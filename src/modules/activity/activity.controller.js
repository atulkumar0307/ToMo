const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const activityService = require('./activity.service');
const { validateCreateActivity } = require('./activity.validation');

const createActivity = async (req, res, next) => {
  try {
    const validation = validateCreateActivity(req.body);

    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const activity = await activityService.createActivity(req.userId, validation.data);

    return sendSuccess(
      res,
      {
        activity,
        message: 'Activity created successfully',
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createActivity,
};
