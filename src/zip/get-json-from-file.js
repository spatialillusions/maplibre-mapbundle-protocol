export default async function getJsonFromZip(file, mapbundleFiles, source) {
  const decoder = new TextDecoder("utf-8");
  if (mapbundleFiles[file]) {
    const fileOffset = mapbundleFiles[file].absoluteOffset;
    const fileJSON = await source.getBytes(
      fileOffset,
      mapbundleFiles[file].size,
    );
    return JSON.parse(decoder.decode(fileJSON.data));
  }
  return {};
}
