export * from "./maplibre-gl-js-protocol.js";
export * from "./source.js";
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

export class TilePackage {
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
  }

  async getFilelist() {
    return await this.cache.getFilelist(this.source);
  }

  async getMetadataAttempt() {
    const header = await this.cache.getFilelist(this.source);
    let metadata = {};
    if (header.packageType === "vtpk") {
      const resp = await this.source.getBytes(
        header.jsonMetadataOffset,
        header.jsonMetadataLength,
        undefined,
        header.etag,
      );
      const decoder = new TextDecoder("utf-8");
      metadata = JSON.parse(decoder.decode(resp.data));
    }
    metadata.name = header.name;
    return metadata;
  }

  async getMetadata() {
    try {
      return await this.getMetadataAttempt();
    } catch (e) {
      if (e instanceof EtagMismatch) {
        this.cache.invalidate(this.source);
        return await this.getMetadataAttempt();
      }
      throw e;
    }
  }

  async getResourceAttempt(file, signal) {
    const header = await this.cache.getFilelist(this.source);
    if (!header.files[file]) return undefined;
    const resource = await this.cache.getResource(
      this.source,
      file,
      header,
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

  async getStylesAttempt() {
    const filelist = await this.cache.getFilelist(this.source);
    const sourceKey = this.source.getKey();
    /*
    if (header.packageType === "vtpk") {
      const metadata = await getJsonFromFile(
        "p12/root.json",
        header.files,
        this.source,
      );
      const styles = await getJsonFromFile(
        "p12/resources/styles/root.json",
        header.files,
        this.source,
      );
      if (styles.sources && styles.sources.esri) {
        delete styles.sources.esri.url;
        styles.sources.esri.tiles = [`tilepackage://${sourceKey}/{z}/{x}/{y}`];
        styles.sources.esri.type = styles.sources.esri.type || "vector";
        styles.sources.esri.minzoom = header.minZoom || 0;
        styles.sources.esri.maxzoom = header.maxZoom || 22;
      }
      for (const k in styles.sources) {
        const src = styles.sources[k];
        if (
          src &&
          typeof src.url === "string" &&
          src.url.startsWith("tilepackage://")
        ) {
          delete src.url;
          if (!src.tiles)
            src.tiles = [`tilepackage://${sourceKey}/{z}/{x}/{y}`];
        }
      }
      if (metadata.copyrightText)
        style.sources.esri.attribution = metadata.copyrightText;
      style.glyphs = `tilepackage://${sourceKey}/{fontstack}/{range}`;
      style.sprite = `tilepackage://${sourceKey}/sprite`;
      if (this.debug)
        console.debug(
          "[tilepackage style] rewritten esri source",
          style.sources.esri,
        );
      return style;
    }
    return {
      version: 8,
      sources: {
        esri: {
          type: "raster",
          tileSize: header.tileSize || 256,
          tiles: [`tilepackage://${sourceKey}/{z}/{x}/{y}`],
          maxzoom: header.maxZoom || 22,
          minzoom: header.minZoom || 0,
        },
      },
      layers: [{ id: "tilepackageraster", type: "raster", source: "esri" }],
    };
    */
    const styles = [];
    for (const file in filelist) {
      if (file.startsWith("styles/") && file.endsWith(".json")) {
        try {
          const style = await getJsonFromFile(file, filelist, this.source);
          // TODO Rewrite any tilepackage:// URLs in the style
          styles.push(style);
        } catch (e) {
          console.warn(
            `[tilepackage style] failed to load style file ${file}:`,
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
}
