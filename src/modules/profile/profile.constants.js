const { setting } = require('../../services/settings');

/** Editable in admin → Configuration. */
const verifiedFieldCooldownMs = () => setting('profile.nameDobCooldownDays') * 24 * 60 * 60 * 1000;

module.exports = {
  verifiedFieldCooldownMs,
};
