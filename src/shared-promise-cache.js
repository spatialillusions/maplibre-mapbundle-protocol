import getFilelistFromMapBundle from "./zip/get-filelist.js";

async function getResource(source, file, filelist, signal) {
  const resp = await source.getBytes(
    filelist[file].absoluteOffset,
    filelist[file].size,
    signal,
    filelist.etag,
  );
  //console.log("got file and returns:", file);
  return resp;
}

/**
 * A cache for parts of a MapBundle archive where promises can be shared between requests.
 *
 * Only caches headers, resource files, and directories, not individual tile contents.
 */
export default class SharedPromiseCache {
  constructor(maxCacheEntries = 100) {
    this.cache = new Map();
    this.invalidations = new Map();
    this.maxCacheEntries = maxCacheEntries;
    this.counter = 1;
    //this.decompress = decompress;
    this.subdivided = new Map(); // key: sourceKey|z|x|y -> Uint8Array
  }

  async getFilelist(source) {
    const cacheKey = source.getKey();
    const cacheValue = this.cache.get(cacheKey);
    if (cacheValue) {
      cacheValue.lastUsed = this.counter++;
      const data = await cacheValue.data;
      return data;
    }

    const p = new Promise((resolve, reject) => {
      getFilelistFromMapBundle(source)
        .then((res) => {
          /*
          if (res[1]) {
            this.cache.set(res[1][0], {
              lastUsed: this.counter++,
              data: Promise.resolve(res[1][2]),
            });
          }*/
          resolve(res);
          this.prune();
        })
        .catch((e) => {
          reject(e);
        });
    });
    this.cache.set(cacheKey, { lastUsed: this.counter++, data: p });
    return p;
  }

  async getResource(source, file, header, signal) {
    const cacheKey = `${source.getKey()}|${""}|${file}|Resource`;
    const cacheValue = this.cache.get(cacheKey);
    if (cacheValue) {
      cacheValue.lastUsed = this.counter++;
      const data = await cacheValue.data;
      return data;
    }
    const p = new Promise((resolve, reject) => {
      getResource(source, file, header, signal)
        .then((resource) => {
          resolve(resource);
          this.prune();
        })
        .catch((e) => {
          reject(e);
        });
    });
    this.cache.set(cacheKey, { lastUsed: this.counter++, data: p });
    return p;
  }

  prune() {
    if (this.cache.size >= this.maxCacheEntries) {
      let minUsed = Infinity;
      let minKey = undefined;
      this.cache.forEach((cacheValue, key) => {
        if (cacheValue.lastUsed < minUsed) {
          minUsed = cacheValue.lastUsed;
          minKey = key;
        }
      });
      if (minKey) {
        this.cache.delete(minKey);
      }
    }
  }

  async invalidate(source) {
    const key = source.getKey();
    if (this.invalidations.get(key)) {
      return await this.invalidations.get(key);
    }
    this.cache.delete(source.getKey());
    const p = new Promise((resolve, reject) => {
      this.getHeader(source)
        .then(() => {
          resolve();
          this.invalidations.delete(key);
        })
        .catch((e) => {
          reject(e);
        });
    });
    this.invalidations.set(key, p);
  }
}
