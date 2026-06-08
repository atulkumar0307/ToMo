const { execFile } = require('child_process');
const { promisify } = require('util');
const ffprobePath = require('ffprobe-static').path;

const execFileAsync = promisify(execFile);

const getVideoDuration = async (filePath) => {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);

  const duration = parseFloat(stdout.trim());

  if (Number.isNaN(duration)) {
    throw new Error('Unable to read video duration');
  }

  return duration;
};

module.exports = { getVideoDuration };
