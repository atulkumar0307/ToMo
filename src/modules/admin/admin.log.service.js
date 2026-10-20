const prisma = require('../../config/database');
const { AUDIT_ACTION_CATALOG, ENTITY_TYPES } = require('../../constants/auditActions');
const { AUDIT_LOG_SELECT } = require('./admin.constants');
const {
  parsePagination,
  buildPagination,
  parseDateQuery,
  parseEnumList,
  trimmedQuery,
  ALLOWED_ACTOR_TYPES,
} = require('./admin.validation');

const KNOWN_ACTIONS = AUDIT_ACTION_CATALOG.map((entry) => entry.action);

const buildLogWhere = (query) => {
  const and = [];
  const actorTypes = parseEnumList(query.actorType, ALLOWED_ACTOR_TYPES);
  const actions = parseEnumList(query.action, KNOWN_ACTIONS);
  const groups = trimmedQuery(query.group);
  const entityTypes = parseEnumList(query.entityType, Object.values(ENTITY_TYPES));
  const q = trimmedQuery(query.q);

  if (actorTypes.length) and.push({ actorType: { in: actorTypes } });

  if (groups) {
    const groupActions = AUDIT_ACTION_CATALOG.filter((entry) => entry.group === groups).map(
      (entry) => entry.action
    );
    actions.push(...groupActions);
  }

  if (actions.length) and.push({ action: { in: actions } });
  if (entityTypes.length) and.push({ entityType: { in: entityTypes } });
  if (query.entityId) and.push({ entityId: String(query.entityId) });
  if (query.userId) and.push({ userId: String(query.userId) });
  if (query.adminId) and.push({ adminId: String(query.adminId) });
  if (query.targetUserId) and.push({ targetUserId: String(query.targetUserId) });

  // Everything a user did, plus everything done to them.
  if (query.involvesUserId) {
    const id = String(query.involvesUserId);
    and.push({ OR: [{ userId: id }, { targetUserId: id }, { entityType: ENTITY_TYPES.USER, entityId: id }] });
  }

  if (q) {
    and.push({
      OR: [
        { message: { contains: q, mode: 'insensitive' } },
        { actorLabel: { contains: q, mode: 'insensitive' } },
        { action: { contains: q.toUpperCase().replace(/\s+/g, '_') } },
        { ipAddress: { contains: q } },
      ],
    });
  }

  const from = parseDateQuery(query.from);
  const to = parseDateQuery(query.to);
  const after = parseDateQuery(query.after);

  if (from || to || after) {
    and.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
        ...(after ? { gt: after } : {}),
      },
    });
  }

  return and.length ? { AND: and } : {};
};

const listLogs = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query, 30);
  const where = buildLogWhere(query);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: AUDIT_LOG_SELECT,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, pagination: buildPagination(page, limit, total) };
};

const getActionCatalog = () => ({
  actions: AUDIT_ACTION_CATALOG,
  groups: [...new Set(AUDIT_ACTION_CATALOG.map((entry) => entry.group))],
  entityTypes: Object.values(ENTITY_TYPES),
  actorTypes: ALLOWED_ACTOR_TYPES,
});

module.exports = {
  listLogs,
  getActionCatalog,
};
