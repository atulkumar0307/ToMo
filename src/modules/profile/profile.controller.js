const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logUserAction } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const profileService = require('./profile.service');
const {
  validateUpdateProfile,
  buildProfileUpdateData,
} = require('./profile.validation');

const FIELD_LABELS = {
  fullName: 'name',
  gender: 'gender',
  dateOfBirth: 'date of birth',
  bio: 'bio',
  profileImagePath: 'profile photo',
};

const updateProfile = async (req, res, next) => {
  try {
    const validationError = validateUpdateProfile(req.body, req.file);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const data = buildProfileUpdateData(req.body, req.file);
    const wasCompleted = req.user.isProfileCompleted;
    const user = await profileService.updateProfile(req.userId, data);

    const changedFields = Object.keys(data);
    logUserAction(req, AUDIT_ACTIONS.PROFILE_UPDATED, {
      user,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      message: wasCompleted
        ? `Updated profile: ${changedFields.map((f) => FIELD_LABELS[f] || f).join(', ')}`
        : 'Completed profile registration',
      metadata: { fields: changedFields, completedRegistration: !wasCompleted },
    });

    return sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
};

const getProfile = async (req, res, next) => {
  try {
    return sendSuccess(res, { user: req.user });
  } catch (err) {
    next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const stats = await profileService.getProfileStats(req.userId);
    return sendSuccess(res, { stats });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  updateProfile,
  getProfile,
};
