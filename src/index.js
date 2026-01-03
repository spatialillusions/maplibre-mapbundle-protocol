export * from "./maplibre-gl-js-protocol.js";
export * from "./source.js";

import { PMTiles } from "pmtiles";
import { FetchSource } from "./source.js";
import getJsonFromZip from "./zip/get-json-from-file.js";
import SharedPromiseCache from "./shared-promise-cache.js";

class EtagMismatch extends Error {
  constructor(message) {
    super(message);
    this.name = "EtagMismatch";
  }
}

export class MapBundle {
  constructor(source, options) {
    // Default coverageCheck enabled; disable with coverageCheck:false
    this.coverageCheck = 1;
    if (options && options.coverageCheck === false) this.coverageCheck = 0;
    // Max dz guard (skip subdivision beyond this): default 8
    this.maxDz =
      options && typeof options.maxDz === "number" ? options.maxDz : 8;
    if (typeof source === "string") {
      const opts = this.coverageCheck
        ? { coverageCheck: this.coverageCheck }
        : undefined;
      this.source = new FetchSource(source, opts);
    } else {
      this.source = source;
      // Propagate default coverageCheck to existing Source instances if undefined
      if (this.source && this.source.coverageCheck === undefined) {
        this.source.coverageCheck = this.coverageCheck;
      }
    }

    this.cache =
      options && options.cache ? options.cache : new SharedPromiseCache();
    this.pmtiles = {};
  }

  // Get a file's data from the MapBundle package
  async getFile(file, signal) {
    try {
      const resource = await this.getResource(file, signal);
      return resource.data;
    } catch (e) {
      if (e instanceof EtagMismatch) {
        this.cache.invalidate(this.source);
        const resource = await this.getResource(file, signal);
        return resource.data;
      }
    }
  }

  async getFileAsJson(file, signal) {
    try {
      const data = await this.getFile(file, signal);
      const decoder = new TextDecoder("utf-8");
      return JSON.parse(decoder.decode(data));
    } catch (e) {
      console.warn(`Failed to get JSON from file ${file}:`, e);
      throw e;
    }
  }

  async getFilelist() {
    return await this.cache.getFilelist(this.source);
  }

  async getPmtilesInstance(file) {
    if (!this.pmtiles[file]) {
      const fileList = await this.getFilelist();
      const fileOffset = fileList[file].absoluteOffset;
      const source = this.source.clone(fileOffset); // Clone to allow different fileOffsets
      this.pmtiles[file] = new PMTiles(source);
    }
    return this.pmtiles[file];
  }

  async getResourceAttempt(file, signal) {
    const filelist = await this.cache.getFilelist(this.source);
    if (file.indexOf(",") !== -1) {
      // Support for multiple files separated by comma (e.g. tilejson + data)
      const files = file.split("/");
      for (const f in files) {
        files[f] = files[f].split(",")[0];
      }
      file = files.join("/");
    }
    if (!filelist[file]) {
      console.log(`File ${file} not found in MapBundle package`);
      return undefined;
    }

    const resource = await this.cache.getResource(
      this.source,
      file,
      filelist,
      signal,
    );
    return {
      data: resource.data,
      cacheControl: resource.cacheControl,
      expires: resource.expires,
    };
  }

  async getResource(file, signal) {
    try {
      return await this.getResourceAttempt(file, signal);
    } catch (e) {
      if (e instanceof EtagMismatch) {
        this.cache.invalidate(this.source);
        return await this.getResourceAttempt(file, signal);
      }
      throw e;
    }
  }

  getSource() {
    return this.source;
  }

  async getStylesAttempt() {
    const filelist = await this.cache.getFilelist(this.source);
    const sourceKey = this.source.getKey();

    const styles = [];
    for (const file in filelist) {
      if (file.startsWith("styles/") && file.endsWith(".json")) {
        try {
          const style = await getJsonFromZip(file, filelist, this.source);
          // Update style URLs to use mapbundle:// protocol
          for (const source in style.sources) {
            // Update source URLs
            if (style.sources[source].url) {
              style.sources[
                source
              ].url = `mapbundle://${sourceKey}${style.sources[source].url}`;
            }
            // If it is a geojson source with 'data' property, update that too
            if (
              style.sources[source].data &&
              typeof style.sources[source].data === "string"
            ) {
              style.sources[
                source
              ].data = `mapbundle://${sourceKey}${style.sources[source].data}`;
            }
          }
          if (style.glyphs)
            style.glyphs = `mapbundle://${sourceKey}${style.glyphs}`;
          //console.log("updated style glyphs to:", style.glyphs);
          if (style.sprite) {
            if (typeof style.sprite === "string") {
              style.sprite = `mapbundle://${sourceKey}${style.sprite}`;
            } else if (Array.isArray(style.sprite)) {
              style.sprite = style.sprite.map((sprite) =>
                Object.assign({}, sprite, {
                  url: `mapbundle://${sourceKey}${sprite.url}`,
                }),
              );
            }
            //console.log("updated style sprite to:", style.sprite);
          }
          styles.push(style);
        } catch (e) {
          console.warn(
            `[mapbundle style] failed to load style file ${file}:`,
            e,
          );
        }
      }
    }
    return styles;
  }

  async getStyles() {
    try {
      return await this.getStylesAttempt();
    } catch (e) {
      if (e instanceof EtagMismatch) {
        this.cache.invalidate(this.source);
        return await this.getStylesAttempt();
      }
      throw e;
    }
  }
}
