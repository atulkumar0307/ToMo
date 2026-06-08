const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const profileService = require('./profile.service');
const {
  validateUpdateProfile,
  buildProfileUpdateData,
} = require('./profile.validation');

const updateProfile = async (req, res, next) => {
  try {
    const validationError = validateUpdateProfile(req.body, req.file);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const data = buildProfileUpdateData(req.body, req.file);
    const user = await profileService.updateProfile(req.userId, data);

    return sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await profileService.getProfile(req.userId);
    return sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  updateProfile,
  getProfile,
};
