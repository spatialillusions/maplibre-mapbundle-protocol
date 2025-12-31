# MapBundle Format Specification

MapBundle (PMTiles Extended) is a single-file archive format for tiled data and resources needed to visualize the data. The contents of a MapBundle archive can be read directly from a web server without having to download the whole archive.

## Format Version

This document describes MapBundle format version 1.0.

## File Format

MapBundle files use the ZIP archive format with the following requirements:

- **File extension**: `.mapbundle`
- **Compression method**: STORE (no compression, compression level 0)
- **Rationale**: Uncompressed storage enables efficient random access and HTTP range requests

The use of standard ZIP format makes it easy to create and extract contents from a MapBundle file using common archiving tools.

## File Structure

### Required Folders

- **`styles/`** - REQUIRED. Contains one or more MapLibre GL JS style JSON files

### Recommended Folders

- **`data/`** - Recommended for storing PMTiles archives containing vector or raster tile data
- **`fonts/`** - Recommended for glyph/font resources in PBF format
- **`sprites/`** - Recommended for sprite images and JSON metadata

Additional folders may be created as needed for other resources.

## Tiled Data

Tiled data SHOULD be stored in Protomaps PMTiles format within the `data/` folder or another appropriate location. Each PMTiles file can be referenced by MapLibre style JSON sources.

## Style JSON Files

### Location and Naming

Style JSON files:
- SHALL be stored in the `/styles/` folder
- SHOULD use descriptive filenames (e.g., `light.json`, `dark.json`, `satellite.json`)
- Multiple style files are supported in a single MapBundle archive

### Style Name Property

Each style JSON SHOULD include a `name` property for display purposes:

```json
{
  "name": "My Map Style",
  "version": 8,
  ...
}
```

### URLs in Style JSON

All resource URLs in style JSON files MUST be stored as absolute paths within the MapBundle archive (starting with `/`).

**Required format:**
```json
{
  "glyphs": "/fonts/{fontstack}/{range}.pbf",
  "sprite": "/sprites/v4/light",
  "sources": {
    "protomaps": {
      "type": "vector",
      "url": "/data/tiles.pmtiles"
    }
  }
}
```

The `mapbundle://` protocol scheme will be added automatically by the MapBundle reader. Storing paths this way makes extracted MapBundle contents compatible with standard tile servers (Maplibre Martin, tileserver-gl-js, etc.).

## Example Structure

A typical MapBundle archive structure:

```
my-map.mapbundle (ZIP archive with STORE compression)
├── styles/
│   ├── light.json
│   ├── dark.json
│   └── satellite.json
├── data/
│   └── tiles.pmtiles
├── fonts/
│   ├── Noto Sans Regular/
│   │   ├── 0-255.pbf
│   │   └── 256-511.pbf
│   └── Noto Sans Bold/
│       └── ...
└── sprites/
    ├── light.json
    ├── light.png
    ├── light@2x.json
    └── light@2x.png
```

## Creating MapBundle Files

To create a MapBundle file, use any ZIP utility with compression disabled:

```bash
# Using zip command (Unix/Linux/macOS)
zip -0 -r my-map.mapbundle styles/ data/ fonts/ sprites/

# Using PowerShell (Windows)
Compress-Archive -Path styles/,data/,fonts/,sprites/ -DestinationPath my-map.mapbundle -CompressionLevel NoCompression
```

## Compatibility

MapBundle archives are designed to work with:
- MapLibre GL JS via the `maplibre-mapbundle-protocol` library
- Standard tile servers when extracted (Martin, tileserver-gl-js)
- Any HTTP server supporting range requests for remote access
