import { PMX } from "./index.js";

const converter = (getData) => (requestParameters, arg2) => {
  if (arg2 instanceof AbortController) {
    return getData(requestParameters, arg2);
  }
  const abortController = new AbortController();
  getData(requestParameters, abortController)
    .then(
      (result) => {
        return arg2(
          undefined,
          result.data,
          result.cacheControl || "",
          result.expires || "",
        );
      },
      (err) => {
        return arg2(err);
      },
    )
    .catch((e) => {
      return arg2(e);
    });
  return { cancel: () => abortController.abort() };
};

/**
 * MapLibre GL JS protocol. Must be added once globally.
 */
export class Protocol {
  /**
   * Initialize the MapLibre PMX protocol.
   *
   * * metadata: also load the metadata section of the PMX. required for some "inspect" functionality
   * and to automatically populate the map attribution. Requires an extra HTTP request.
   * * errorOnMissingTile: When a vector MVT tile is missing from the archive, raise an error instead of
   * returning the empty array. Not recommended. This is only to reproduce the behavior of ZXY tile APIs
   * which some applications depend on when overzooming.
   */
  constructor(options) {
    this.tiles = new Map();
    this.metadata = options ? options.metadata || false : false;
    this.errorOnMissingTile = options
      ? options.errorOnMissingTile || false
      : false;
    this.debug = options ? options.debug || false : false;
    this.getData = async (params, abortController) => {
      const pmxUrl = params.url
        .substr(params.url.indexOf("://") + 3, params.url.indexOf(".pmx") - 2)
        .replace(/(https?)\/\/?/g, "$1://");
      //console.log("PMX URL:", pmxUrl);
      let instance = this.tiles.get(pmxUrl);
      if (!instance) {
        instance = new PMX(pmxUrl);
        this.tiles.set(pmxUrl, instance);
      }

      // Check if the url ends in numbers so that it is a tile request
      let re = new RegExp(/pmx:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/);
      let result = params.url.match(re);

      if (!result) {
        const file = params.url.substr(params.url.indexOf(".pmx") + 5);
        //console.log("PMX non-tile file request:", file, params.type);
        if (params.type === "json" && params.url.endsWith("tiles.json")) {
          // This is probably a file json request
          const pmtiles = await instance.getPmtilesInstance(
            file.replace("/tiles.json", ""),
          );
          const h = await pmtiles.getHeader();
          abortController.signal.throwIfAborted();

          if (h.minLon >= h.maxLon || h.minLat >= h.maxLat) {
            console.error(
              `Bounds of PMTiles archive ${h.minLon},${h.minLat},${h.maxLon},${h.maxLat} are not valid.`,
            );
          }
          return {
            data: {
              tiles: [
                `${params.url.substr(
                  0,
                  params.url.indexOf(".pmtiles") + 8,
                )}/{z}/{x}/{y}`,
              ],
              minzoom: h.minZoom,
              maxzoom: h.maxZoom,
              bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat],
            },
          };
          //*/
        }
        if (params.type === "json") {
          const resp = await instance.getResource(file, abortController.signal);
          if (resp) {
            const decoder = new TextDecoder("utf-8");
            const json = JSON.parse(decoder.decode(resp.data));
            return {
              data: json,
            };
          }
        }
        // This is another non-tile request, return the file directly
        const resp = await instance.getResource(file, abortController.signal);
        if (resp) {
          return {
            data: new Uint8Array(resp.data),
            cacheControl: resp.cacheControl,
            expires: resp.expires,
          };
        }
      }
      // Parse z/x/y from the URL
      const z = result[2];
      const x = result[3];
      const y = result[4];

      const file = result[1].substr(result[1].indexOf(".pmx") + 5);
      const pmtiles = await instance.getPmtilesInstance(file);
      const resp = await pmtiles.getZxy(+z, +x, +y, abortController.signal);
      if (this.debug)
        console.debug("[] tile fetch", {
          z: +z,
          x: +x,
          y: +y,
          found: !!resp,
        });
      if (resp) {
        return {
          data: new Uint8Array(resp.data),
          cacheControl: resp.cacheControl,
          expires: resp.expires,
        };
      }
      const header = await pmtiles.getHeader();

      if (header.tileType === 1) {
        if (this.errorOnMissingTile) {
          const e = new Error(
            `Tile [${z},${x},${y}] not found in Tile Package, normal for with variable depth pyramids.`,
          );
          e.name = "TileError";
          if (this.debug) console.debug("[pmx] missing tile", { z, x, y });
          throw e;
        }
        return { data: new Uint8Array() };
      } else {
        return { data: null };
      }
    };

    this.package = converter(this.getData);
  }

  /**
   * Add a {@link PMX} instance to the global protocol instance.
   *
   * For remote fetch sources, references in MapLibre styles like pmx://http://...
   * will resolve to the same instance if the URLs match.
   */
  add(p) {
    this.tiles.set(p.source.getKey(), p);
    if (this.debug) console.debug("[pmx] add instance", p.source.getKey());
  }

  /**
   * Fetch a {@link PMX} instance by URL, for remote PMX instances.
   */
  get(url) {
    if (this.debug) console.debug("[pmx] get instance", url);
    return this.tiles.get(url);
  }
}
