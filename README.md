# maplibre-mapbundle-protocol

Custom MapLibre GL JS protocol for reading MapBundle archives containing PMTiles and style resources.

Works with:

- Local files selected via an `<input type="file">` (no server required)
- Relative or absolute HTTP(S) URLs to remote TilePackages

The protocol streams tiles, glyphs and sprites directly from the archive.

## Install

```bash
npm add maplibre-mapbundle-protocol
```

## Import (ESM)

```js
import {
  Protocol,
  FileSource,
  MapBundle,
} from "maplibre-mapbundle-protocol";
```

## Local File MapBundle

```js
const protocol = new Protocol({ 
  metadata: true,
  debug: true 
});
maplibregl.addProtocol("mapbundle", protocol.package);

async function initFromFile(file) {
  const pkg = new MapBundle(new FileSource(file));
  protocol.add(pkg); // register so sprite/glyph URLs resolve
  const styles = await pkg.getStyles();
  new maplibregl.Map({ container: "map", style: styles[0] });
}
```

On HTTP(S) you can instead point a style source to a relative URL:

```js
url: "mapbundle://./data/archive.mapbundle";
```

## Vector Style Rewriting

`TilePackage#getStyles()` for replaces any `url` with a `tiles` array (`mapbundle://<key>/{z}/{x}/{y}`), and sets `sprite` & `glyphs` to protocol endpoints. This avoids extra TileJSON requests that fail under `file://`.

## API Summary

- `new MapBundle(source, { coverageCheck })` – `source` is URL string or `FileSource`. `coverageCheck` defaults to `true` enabling coverage map.
- `MapBundle#getHeader()` – name, zooms, bounds, tile type.
- `MapBundle#getStyles()` – gets all styles from the package.
- `MapBundle#getFilelist()` – gets the file list from the archive.
- `MapBundle#getFile(file, signal)` – gets a specific file's data from the archive.
- `MapBundle#getFileAsJson(file, signal)` – gets a specific file from the archive and parses it as JSON.
- `Protocol.add(pkg)` – register local file-backed packages for glyph/sprite resolution.
- `Protocol` options:
  - `metadata` (boolean, default: false) – load metadata section for attribution and inspection
  - `errorOnMissingTile` (boolean, default: false) – raise error when tile is missing instead of returning empty array
  - `debug` (boolean, default: false) – enable debug logging for tile fetches and events

## Debug Logging

Enable `debug:true` in `Protocol` for tile fetch + instance events. Coverage ascent & subdivision messages use `[mapbundle coverage]` and `[mapbundle subdivide]` prefixes.

## Demo

The `example/` directory demonstrates local file selection, remote/relative URL input, style selector dropdown for switching between available styles, and auto-load of a demo archive.

## Sample Data

There is a small example file in the example folder.

## Acknowledgement

Inspired by concepts from PMTiles protocol (Protomaps LLC).

## Support

If this project helps you, consider supporting: https://buymeacoffee.com/spatialillusion
