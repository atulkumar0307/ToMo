const { verificationLimits } = require('./verification.constants');

const validateImageUpload = (files) => {
  if (!files || files.length === 0) {
    return 'At least one verification image is required';
  }

  const { minImages, maxImages } = verificationLimits();
  if (files.length < minImages) {
    return `Upload at least ${minImages} verification images`;
  }

  if (files.length > maxImages) {
    return `Upload at most ${maxImages} verification images`;
  }

  return null;
};

module.exports = {
  validateImageUpload,
};
