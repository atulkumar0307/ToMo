const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const verificationService = require('./verification.service');
const { validateImageUpload } = require('./verification.validation');

const uploadImages = async (req, res, next) => {
  try {
    const validationError = validateImageUpload(req.files);
    if (validationError) {
      verificationService.removeUploadedFiles(req.files);
      throw new AppError(validationError, 400);
    }

    const verification = await verificationService.uploadVerificationImages(
      req.userId,
      req.files
    );

    return sendSuccess(
      res,
      {
        verification,
        message: 'Verification images uploaded successfully. Pending admin review.',
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
  uploadImages,
  getStatus,
};
