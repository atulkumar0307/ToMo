const { HighlightStatus, ParticipantStatus } = require('@prisma/client');
const prisma = require('../../config/database');

const emptyCounts = () => ({ approved: 0, pending: 0, rejected: 0, withdrawn: 0, expired: 0 });

/**
 * Participant counts for many activities in one grouped query.
 * `approved` includes the host (same rule as maxParticipants); the rest are joiners only.
 */
const loadParticipantCounts = async (activityIds, client = prisma) => {
  const counts = new Map();
  if (!activityIds.length) return counts;

  const rows = await client.activityParticipant.groupBy({
    by: ['activityId', 'status', 'isHost'],
    where: { activityId: { in: activityIds } },
    _count: { _all: true },
  });

  for (const row of rows) {
    const entry = counts.get(row.activityId) || emptyCounts();
    if (row.status === ParticipantStatus.APPROVED || !row.isHost) {
      const key = row.status.toLowerCase();
      entry[key] = (entry[key] || 0) + row._count._all;
    }
    counts.set(row.activityId, entry);
  }

  return counts;
};

/** Published highlight counts for many activities in one grouped query. */
const loadHighlightCounts = async (activityIds, client = prisma) => {
  const counts = new Map();
  if (!activityIds.length) return counts;

  const rows = await client.highlight.groupBy({
    by: ['activityId'],
    where: { activityId: { in: activityIds }, status: HighlightStatus.PUBLISHED },
    _count: { _all: true },
  });

  for (const row of rows) counts.set(row.activityId, row._count._all);
  return counts;
};

const countsFor = (map, activityId) => map.get(activityId) || emptyCounts();

module.exports = { loadParticipantCounts, loadHighlightCounts, countsFor, emptyCounts };
