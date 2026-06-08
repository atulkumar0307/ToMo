const COUNTER_ID = 'user_uid';

const getNextUserUid = async (tx) => {
  const counter = await tx.counter.upsert({
    where: { id: COUNTER_ID },
    create: { id: COUNTER_ID, value: 1 },
    update: { value: { increment: 1 } },
  });

  return counter.value;
};

module.exports = { getNextUserUid };
