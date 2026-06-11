const COUNTER_ID = 'activity_aid';
const ACTIVITY_CODE_PREFIX = 'ACT';

const getNextActivityAid = async (tx) => {
  const counter = await tx.counter.upsert({
    where: { id: COUNTER_ID },
    create: { id: COUNTER_ID, value: 1 },
    update: { value: { increment: 1 } },
  });

  return counter.value;
};

const formatActivityCode = (aid) => `${ACTIVITY_CODE_PREFIX}-${aid}`;

module.exports = {
  getNextActivityAid,
  formatActivityCode,
  ACTIVITY_CODE_PREFIX,
};
