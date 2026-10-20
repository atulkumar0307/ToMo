const fs = require('fs');
const { parseFile } = require('music-metadata');

/**
 * Reads the movie duration from an MP4/MOV `moov > mvhd` box. Works for
 * silent videos, which music-metadata reports without a duration.
 */
const readMp4Duration = (filePath) => {
  const fd = fs.openSync(filePath, 'r');

  try {
    const fileSize = fs.fstatSync(fd).size;
    const header = Buffer.alloc(16);

    const findBox = (start, end, type) => {
      let offset = start;

      while (offset + 8 <= end) {
        fs.readSync(fd, header, 0, 16, offset);
        let boxSize = header.readUInt32BE(0);
        const boxType = header.toString('latin1', 4, 8);
        let headerSize = 8;

        if (boxSize === 1) {
          boxSize = Number(header.readBigUInt64BE(8));
          headerSize = 16;
        } else if (boxSize === 0) {
          boxSize = end - offset;
        }

        if (boxSize < headerSize) {
          return null;
        }

        if (boxType === type) {
          return { start: offset + headerSize, end: offset + boxSize };
        }

        offset += boxSize;
      }

      return null;
    };

    const moov = findBox(0, fileSize, 'moov');
    const mvhd = moov && findBox(moov.start, moov.end, 'mvhd');

    if (!mvhd) {
      return null;
    }

    const body = Buffer.alloc(32);
    fs.readSync(fd, body, 0, 32, mvhd.start);

    const version = body.readUInt8(0);
    const timescale = version === 1 ? body.readUInt32BE(20) : body.readUInt32BE(12);
    const duration = version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);

    return timescale ? duration / timescale : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
};

const getVideoDurationSeconds = async (filePath, mimeType) => {
  if (!mimeType || mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    const mp4Duration = readMp4Duration(filePath);

    if (mp4Duration !== null && !Number.isNaN(mp4Duration)) {
      return Math.round(mp4Duration);
    }
  }

  let duration;

  try {
    const metadata = await parseFile(filePath);
    duration = metadata.format.duration;
  } catch {
    // Not a readable media file: callers report "Could not read video duration".
    return null;
  }

  if (duration === undefined || Number.isNaN(duration)) {
    return null;
  }

  return Math.round(duration);
};

module.exports = { getVideoDurationSeconds };
