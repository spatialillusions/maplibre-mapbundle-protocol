export * from "./maplibre-gl-js-protocol.js";
export * from "./source.js";

import { PMTiles } from "pmtiles";
import { FetchSource } from "./source.js";
import defaultDecompress from "./default-decompress.js";
import getJsonFromFile from "./get-json-from-file.js";
import SharedPromiseCache from "./shared-promise-cache.js";

class EtagMismatch extends Error {
  constructor(message) {
    super(message);
    this.name = "EtagMismatch";
  }
}

export class PMX {
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
    this.decompress =
      options && options.decompress ? options.decompress : defaultDecompress;
    this.cache =
      options && options.cache ? options.cache : new SharedPromiseCache();
    this.pmtiles = {};
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
      console.log(`File ${file} not found in PMX package`);
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
          const style = await getJsonFromFile(file, filelist, this.source);
          // TODO Rewrite any URLs in the style
          /*
          style.sources = {
            composite: {
              type: "vector",
              url: `pmx://${sourceKey}/data/OS_Open_Zoomstack.pmtiles/tiles.json`,
            },
          };
          */
          for (const source in style.sources) {
            style.sources[
              source
            ].url = `pmx://${sourceKey}${style.sources[source].url}`;
          }
          if (style.glyphs) style.glyphs = `pmx://${sourceKey}${style.glyphs}`;
          //console.log("updated style glyphs to:", style.glyphs);
          if (style.sprite) style.sprite = `pmx://${sourceKey}${style.sprite}`;
          //console.log("updated style sprite to:", style.sprite);
          styles.push(style);
        } catch (e) {
          console.warn(`[pmx style] failed to load style file ${file}:`, e);
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
  /*
  async getTileJson(baseTilesUrl) {
    const header = await this.getFilelist();
    const metadata = await this.getMetadata();
    const ext = header.tileType;
    const tileJson = {
      tilejson: "3.0.0",
      scheme: "xyz",
      tiles: [`${baseTilesUrl}/{z}/{x}/{y}${ext}`],
      name: metadata.name,
      version: header.version,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    };
    if (metadata.vector_layers) tileJson.vector_layers = metadata.vector_layers;
    if (metadata.attribution) tileJson.attribution = metadata.attribution;
    if (metadata.description) tileJson.description = metadata.description;
    if (header.minZoom) tileJson.minzoom = header.minZoom;
    if (header.maxZoom) tileJson.maxzoom = header.maxZoom;
    return tileJson;
  }
  //*/
}
