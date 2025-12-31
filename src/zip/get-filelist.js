import getJsonFromZip from "./get-json-from-file.js";

/**
 * Retrieve the file list of a mapbundle file
 *
 * @param {Source} source - The source of the mapbundle file.
 */
export default async function getFilelistFromMapBundle(source) {
  const key = source.getKey();
  const fileSize = await source.getSize();
  const resp = await source.getBytes(fileSize - 98, 98);
  let v = new DataView(resp.data, 0, 98);
  let entriesCentralDirectory, sizeCentralDirectory, offsetCentralDirectory;
  if (v.getUint32(0, true) === 0x06064b50) {
    // This is a ZIP64 mapbundle
    entriesCentralDirectory = Number(v.getBigUint64(32, true));
    sizeCentralDirectory = Number(v.getBigUint64(40, true));
    offsetCentralDirectory = Number(v.getBigUint64(48, true));
  } else {
    v = new DataView(resp.data, 98 - 22, 22);
    if (v.getUint32(0, true) === 0x06054b50) {
      // This is a ordinary zip archive
      entriesCentralDirectory = Number(v.getUint16(10, true));
      sizeCentralDirectory = Number(v.getUint32(12, true));
      offsetCentralDirectory = Number(v.getUint32(16, true));
    } else {
      throw new Error("Wrong magic number for Zip archive");
    }
  }

  const centralDirectory = await source.getBytes(
    offsetCentralDirectory,
    sizeCentralDirectory,
  );

  v = new DataView(centralDirectory.data, 0, sizeCentralDirectory);
  if (v.getUint32(0, true) !== 0x02014b50) {
    throw new Error("Wrong magic number for Central Directory archive");
  }

  let entryStart = 0;
  const mapbundleFiles = {};
  for (let i = 0; i < entriesCentralDirectory; i++) {
    if (entryStart >= sizeCentralDirectory) break;
    /*
        central file header signature   4 bytes  (0x02014b50)
        version made by                 2 bytes
        version needed to extract       2 bytes
        general purpose bit flag        2 bytes
        compression method              2 bytes
        last mod file time              2 bytes
        last mod file date              2 bytes
        crc-32                          4 bytes
        compressed size                 4 bytes
        uncompressed size               4 bytes
        file name length                2 bytes
        extra field length              2 bytes
        file comment length             2 bytes
        disk number start               2 bytes
        internal file attributes        2 bytes
        external file attributes        4 bytes
        relative offset of local header 4 bytes

        file name (variable size)
        extra field (variable size)
        file comment (variable size)
    */
    let sizeFile = v.getUint32(entryStart + 20, true);
    const compressedSize = v.getUint32(entryStart + 24, true);

    const sizeFileName = v.getUint16(entryStart + 28, true);

    const sizeExtraField = v.getUint16(entryStart + 30, true);

    const sizeComment = v.getUint16(entryStart + 32, true);

    let relativeOffset = v.getUint32(entryStart + 42, true);

    const vFilename = new DataView(
      centralDirectory.data,
      entryStart + 46,
      sizeFileName,
    );
    const decoder = new TextDecoder("utf-8");
    const filename = decoder.decode(vFilename);

    const hasZip64Marker =
      sizeFile == 0xffffffff || relativeOffset == 0xffffffff;

    let localExtraFieldZip64Length = 0;

    // Determine if local header will have ZIP64 extra field
    // Local header only includes ZIP64 if compressed/uncompressed sizes overflow
    const localNeedsZip64 =
      compressedSize === 0xffffffff || sizeFile === 0xffffffff;

    if (hasZip64Marker && sizeExtraField > 0) {
      const vExtended = new DataView(
        centralDirectory.data,
        entryStart + 46 + sizeFileName,
        sizeExtraField,
      );

      // Parse extra field to find ZIP64 block
      let extraOffset = 0;
      while (extraOffset + 4 <= sizeExtraField) {
        const headerId = vExtended.getUint16(extraOffset, true);
        const dataSize = vExtended.getUint16(extraOffset + 2, true);

        if (headerId === 0x0001) {
          // ZIP64 block found in central directory
          // Calculate what will be in local header (only size fields, not offset)

          let localZip64DataSize = 0;

          // Local header ZIP64 includes uncompressed size if it overflows
          if (sizeFile === 0xffffffff) {
            localZip64DataSize += 8;
          }

          // Local header ZIP64 includes compressed size if it overflows
          if (compressedSize === 0xffffffff) {
            localZip64DataSize += 8;
          }

          // Only set length if local header actually needs ZIP64
          if (localZip64DataSize > 0) {
            localExtraFieldZip64Length = 4 + localZip64DataSize; // 4 bytes header + data
          }

          /*
          Central Directory ZIP64 Extra Field:
          Value      Size       Description
          -----      ----       -----------
  (ZIP64) 0x0001     2 bytes    Tag for this "extra" block type
          Size       2 bytes    Size of this "extra" block
          Original 
          Size       8 bytes    Original uncompressed file size (if uncompressed size = 0xFFFFFFFF)
          Compressed
          Size       8 bytes    Size of compressed data (if compressed size = 0xFFFFFFFF)
          Relative Header
          Offset     8 bytes    Offset of local header record (if offset = 0xFFFFFFFF in central dir)
          Disk Start
          Number     4 bytes    Number of the disk on which this file starts (if disk start = 0xFFFF)
          
          Local Header ZIP64 Extra Field only includes:
          - Original Size (if 0xFFFFFFFF in local header)
          - Compressed Size (if 0xFFFFFFFF in local header)
          NO offset or disk number in local header extra field!
          */

          let j = 0;
          if (sizeFile == 0xffffffff) {
            sizeFile = Number(vExtended.getBigUint64(extraOffset + 4, true));
            j += 8;
          }
          if (compressedSize == 0xffffffff) {
            // Skip compressed size field (we don't need to read it, but need to account for it)
            j += 8;
          }
          if (relativeOffset == 0xffffffff) {
            relativeOffset = Number(
              vExtended.getBigUint64(extraOffset + 4 + j, true),
            );
          }
          break;
        }

        extraOffset += 4 + dataSize;
      }
    }

    mapbundleFiles[filename] = {
      filename: filename,
      size: sizeFile,
      relativeOffset: relativeOffset,
      absoluteOffset:
        relativeOffset + 30 + filename.length + localExtraFieldZip64Length,
    };
    entryStart += 46 + sizeFileName + sizeExtraField + sizeComment;
  }

  let root = {};
  return mapbundleFiles;
}
