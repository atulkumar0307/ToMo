const fs = require('fs');
const { VerificationStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { VERIFICATION_SUBMISSION_SELECT } = require('./verification.constants');

const removeUploadedFiles = (files = []) => {
  files.forEach((file) => {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  });
};

const uploadVerificationImages = async (userId, files) => {
  const pendingVerification = await prisma.verificationSubmission.findFirst({
    where: {
      userId,
      status: VerificationStatus.PENDING,
    },
    select: { id: true },
  });

  if (pendingVerification) {
    removeUploadedFiles(files);
    throw new AppError(
      'Your verification is already under review. Please wait for admin approval.',
      409
    );
  }

  // The user flag, not an old APPROVED submission, decides: an admin may have
  // revoked verification since, and the user must then be able to resubmit.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isProfileVerified: true },
  });

  if (user?.isProfileVerified) {
    removeUploadedFiles(files);
    throw new AppError('Your profile is already verified.', 409);
  }

  const submission = await prisma.$transaction(async (tx) => {
    const createdSubmission = await tx.verificationSubmission.create({
      data: {
        userId,
        status: VerificationStatus.PENDING,
        images: {
          create: files.map((file, index) => ({
            imagePath: `/uploads/verification-images/${file.filename}`,
            sortOrder: index,
          })),
        },
      },
      select: VERIFICATION_SUBMISSION_SELECT,
    });

    return createdSubmission;
  });

  return submission;
};

const getVerificationStatus = async (userId) => {
  const submission = await prisma.verificationSubmission.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: VERIFICATION_SUBMISSION_SELECT,
  });

  if (!submission) {
    throw new AppError('No verification submission found', 404);
  }

  return submission;
};

module.exports = {
  uploadVerificationImages,
  getVerificationStatus,
  removeUploadedFiles,
};
