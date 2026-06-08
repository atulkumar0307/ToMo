const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const verificationService = require('./verification.service');
const { validateVideoUpload } = require('./verification.validation');

const uploadVideo = async (req, res, next) => {
  try {
    const validationError = validateVideoUpload(req.file);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const verification = await verificationService.uploadVerificationVideo(
      req.userId,
      req.file
    );

    return sendSuccess(
      res,
      {
        verification,
        message: 'Verification video uploaded successfully. It is pending admin review.',
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

const getStatus = async (req, res, next) => {
  try {
    const verification = await verificationService.getVerificationStatus(req.userId);
    return sendSuccess(res, { verification });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadVideo,
  getStatus,
};
