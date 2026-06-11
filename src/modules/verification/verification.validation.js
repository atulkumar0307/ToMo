const { MIN_IMAGES, MAX_IMAGES } = require('./verification.constants');

const validateImageUpload = (files) => {
  if (!files || files.length === 0) {
    return 'At least one verification image is required';
  }

  if (files.length < MIN_IMAGES) {
    return `Upload at least ${MIN_IMAGES} verification images`;
  }

  if (files.length > MAX_IMAGES) {
    return `Upload at most ${MAX_IMAGES} verification images`;
  }

  return null;
};

module.exports = {
  validateImageUpload,
};
