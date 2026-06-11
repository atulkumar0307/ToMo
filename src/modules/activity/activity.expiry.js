const activityService = require('./activity.service');

const EXPIRY_INTERVAL_MS = 60 * 1000;

const startActivityExpiryJob = () => {
  const run = async () => {
    try {
      const count = await activityService.expireUnstartedActivities();
      if (count > 0) {
        console.log(`Expired ${count} unstarted activit${count === 1 ? 'y' : 'ies'}`);
      }
    } catch (err) {
      console.error('Activity expiry job failed:', err.message);
    }
  };

  run();
  return setInterval(run, EXPIRY_INTERVAL_MS);
};

module.exports = { startActivityExpiryJob };
