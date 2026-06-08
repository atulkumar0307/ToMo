const fs = require('fs');
const { VerificationStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { getVideoDuration } = require('../../utils/videoDuration');
const { VERIFICATION_VIDEO_SELECT } = require('./verification.constants');
const { validateVideoDuration } = require('./verification.validation');

const removeUploadedFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const uploadVerificationVideo = async (userId, file) => {
  const pendingVerification = await prisma.verificationVideo.findFirst({
    where: {
      userId,
      status: VerificationStatus.PENDING,
    },
    select: { id: true },
  });

  if (pendingVerification) {
    removeUploadedFile(file.path);
    throw new AppError(
      'Your verification video is already under review. Please wait for admin approval.',
      409
    );
  }

  const approvedVerification = await prisma.verificationVideo.findFirst({
    where: {
      userId,
      status: VerificationStatus.APPROVED,
    },
    select: { id: true },
  });

  if (approvedVerification) {
    removeUploadedFile(file.path);
    throw new AppError('Your profile is already verified.', 409);
  }

  let durationSec;
  try {
    durationSec = await getVideoDuration(file.path);
  } catch {
    removeUploadedFile(file.path);
    throw new AppError('Unable to process verification video. Please upload a valid video file.', 400);
  }

  const durationError = validateVideoDuration(durationSec);
  if (durationError) {
    removeUploadedFile(file.path);
    throw new AppError(durationError, 400);
  }

  const verificationVideo = await prisma.verificationVideo.create({
    data: {
      userId,
      videoPath: `/uploads/verification-videos/${file.filename}`,
      status: VerificationStatus.PENDING,
    },
    select: VERIFICATION_VIDEO_SELECT,
  });

  return verificationVideo;
};

const getVerificationStatus = async (userId) => {
  const verificationVideo = await prisma.verificationVideo.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: VERIFICATION_VIDEO_SELECT,
  });

  if (!verificationVideo) {
    throw new AppError('No verification video found', 404);
  }

  return verificationVideo;
};

module.exports = {
  uploadVerificationVideo,
  getVerificationStatus,
};
