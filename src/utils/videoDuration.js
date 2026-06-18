const { parseFile } = require('music-metadata');

const getVideoDurationSeconds = async (filePath) => {
  const metadata = await parseFile(filePath);
  const duration = metadata.format.duration;

  if (duration === undefined || Number.isNaN(duration)) {
    return null;
  }

  return Math.round(duration);
};

module.exports = { getVideoDurationSeconds };
