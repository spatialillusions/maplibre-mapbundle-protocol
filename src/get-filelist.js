import getJsonFromFile from "./get-json-from-file.js";

/**
 * Retrieve the file list of a pmx file
 *
 * @param {Source} source - The source of the pmx file.
 */
export default async function getFilelistFromPMX(source) {
  const key = source.getKey();
  const fileSize = await source.getSize();
  const resp = await source.getBytes(fileSize - 98, 98);
  let v = new DataView(resp.data, 0, 98);
  let entriesCentralDirectory, sizeCentralDirectory, offsetCentralDirectory;
  //let bigZip64 = false;
  if (v.getUint32(0, true) === 0x06064b50) {
    // This is a ZIP64 pmx
    //bigZip64 = true;
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
  const pmxFiles = {};
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

    if (
      (sizeFile == 0xffffffff || relativeOffset == 0xffffffff) &&
      sizeExtraField > 0
    ) {
      const vExtended = new DataView(
        centralDirectory.data,
        entryStart + 46 + sizeFileName,
        32,
      );
      if (vExtended.getUint16(0, true) == 0x0001) {
        /*
        Value      Size       Description
        -----      ----       -----------
(ZIP64) 0x0001     2 bytes    Tag for this "extra" block type
        Size       2 bytes    Size of this "extra" block
        Original 
        Size       8 bytes    Original uncompressed file size
        Compressed
        Size       8 bytes    Size of compressed data
        Relative Header
        Offset     8 bytes    Offset of local header record
        Disk Start
        Number     4 bytes    Number of the disk on which
                              this file starts
      */

        let j = 0;
        if (sizeFile == 0xffffffff) {
          sizeFile = Number(vExtended.getBigUint64(4, true));
          j += 8;
        }
        if (relativeOffset == 0xffffffff) {
          relativeOffset = Number(vExtended.getBigUint64(4 + j, true));
        }
      }
    }

    pmxFiles[filename] = {
      filename: filename,
      size: sizeFile,
      relativeOffset: relativeOffset,
      absoluteOffset: relativeOffset + 30 + filename.length,
    };
    entryStart += 46 + sizeFileName + sizeExtraField + sizeComment;
  }

  let root = {};
  return pmxFiles;
}
