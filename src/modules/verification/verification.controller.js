const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logUserAction } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
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

    logUserAction(req, AUDIT_ACTIONS.VERIFICATION_SUBMITTED, {
      entityType: ENTITY_TYPES.VERIFICATION,
      entityId: verification.id,
      targetUserId: req.userId,
      message: `Submitted verification (${verification.images.length} photos)`,
      metadata: { imageCount: verification.images.length },
    });

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
