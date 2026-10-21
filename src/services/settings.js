const prisma = require('../config/database');
const { GROUPS, SETTINGS, CONSISTENCY_RULES } = require('../config/settings.registry');

/**
 * Runtime configuration. Values live in memory, so reading one costs nothing;
 * they are loaded at boot, replaced on every admin save, and re-read every
 * minute so several server instances agree.
 */

const definitions = new Map(SETTINGS.map((def) => [def.key, def]));
const overrides = new Map(); // key → { value, updatedAt, updatedBy }
const REFRESH_MS = 60 * 1000;
let refreshTimer = null;

class SettingsError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Current value of a setting (an admin override, else the default). */
const setting = (key) => {
  const def = definitions.get(key);
  if (!def) throw new Error(`Unknown setting: ${key}`);
  return overrides.has(key) ? overrides.get(key).value : def.default;
};

const currentValues = () => Object.fromEntries(SETTINGS.map((def) => [def.key, setting(def.key)]));

/** Loads saved values. If the table is missing (migration not applied yet), defaults stay in effect. */
const loadSettings = async () => {
  try {
    const rows = await prisma.appSetting.findMany({
      select: { key: true, value: true, updatedAt: true, updatedBy: { select: { id: true, fullName: true } } },
    });
    overrides.clear();
    for (const row of rows) {
      const def = definitions.get(row.key);
      if (!def) continue; // a setting removed from the code
      const checked = coerce(def, row.value);
      if (checked.error) continue; // never let a bad stored value break the app
      overrides.set(row.key, { value: checked.value, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
    }
  } catch (err) {
    console.error('Settings load failed (using defaults):', err.message);
  }
};

const startSettingsRefresh = () => {
  if (refreshTimer) return refreshTimer;
  refreshTimer = setInterval(loadSettings, REFRESH_MS);
  refreshTimer.unref();
  return refreshTimer;
};

const stopSettingsRefresh = () => {
  clearInterval(refreshTimer);
  refreshTimer = null;
};

/** Validates and normalises a value for its setting. */
const coerce = (def, raw) => {
  switch (def.type) {
    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw };
      if (raw === 'true' || raw === 'false') return { value: raw === 'true' };
      return { error: `${def.label} must be on or off` };
    }
    case 'integer': {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isInteger(value)) return { error: `${def.label} must be a whole number` };
      if (def.min !== undefined && value < def.min) return { error: `${def.label} must be at least ${def.min}` };
      if (def.max !== undefined && value > def.max) return { error: `${def.label} must be at most ${def.max}` };
      return { value };
    }
    case 'string': {
      if (typeof raw !== 'string') return { error: `${def.label} must be text` };
      const value = raw.trim();
      if (def.maxLength && value.length > def.maxLength) return { error: `${def.label} must be at most ${def.maxLength} characters` };
      if (def.pattern && !new RegExp(def.pattern).test(value)) return { error: `${def.label} has an invalid format` };
      return { value };
    }
    default:
      return { error: `Unsupported setting type for ${def.key}` };
  }
};

const describe = (def) => {
  const override = overrides.get(def.key);
  return {
    key: def.key,
    group: def.group,
    type: def.type,
    label: def.label,
    description: def.description || null,
    unit: def.unit || null,
    min: def.min ?? null,
    max: def.max ?? null,
    maxLength: def.maxLength ?? null,
    pattern: def.pattern ?? null,
    public: Boolean(def.public),
    danger: Boolean(def.danger),
    sensitive: Boolean(def.sensitive),
    default: def.default,
    value: override ? override.value : def.default,
    isCustom: Boolean(override),
    updatedAt: override?.updatedAt || null,
    updatedBy: override?.updatedBy || null,
  };
};

/** Everything for the admin Configuration page. */
const listSettings = () => ({
  groups: GROUPS,
  settings: SETTINGS.map(describe),
});

/** Values the app may read (no auth). */
const publicSettings = () =>
  Object.fromEntries(SETTINGS.filter((def) => def.public).map((def) => [def.key, setting(def.key)]));

/**
 * Saves several values at once (all-or-nothing). Values equal to the default
 * remove the override. Returns the changes as [{ key, from, to }].
 */
const updateSettings = async (values, adminId) => {
  if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) {
    throw new SettingsError('Send at least one setting to change');
  }

  const next = currentValues();
  const parsed = {};

  for (const [key, raw] of Object.entries(values)) {
    const def = definitions.get(key);
    if (!def) throw new SettingsError(`Unknown setting: ${key}`);
    const checked = coerce(def, raw);
    if (checked.error) throw new SettingsError(checked.error);
    parsed[key] = checked.value;
    next[key] = checked.value;
  }

  for (const rule of CONSISTENCY_RULES) {
    const error = rule(next);
    if (error) throw new SettingsError(error);
  }

  const changes = Object.entries(parsed)
    .map(([key, value]) => ({ key, from: setting(key), to: value }))
    .filter((change) => change.from !== change.to);

  if (!changes.length) return [];

  await prisma.$transaction(
    changes.map(({ key, to }) =>
      to === definitions.get(key).default
        ? prisma.appSetting.deleteMany({ where: { key } })
        : prisma.appSetting.upsert({
            where: { key },
            create: { key, value: to, updatedById: adminId || null },
            update: { value: to, updatedById: adminId || null },
          })
    )
  );

  await loadSettings();
  return changes;
};

/** Back to defaults for the given keys (or all). */
const resetSettings = async (keys, adminId) => {
  const targets = keys?.length ? keys : [...overrides.keys()];
  for (const key of targets) {
    if (!definitions.has(key)) throw new SettingsError(`Unknown setting: ${key}`);
  }
  const values = Object.fromEntries(targets.map((key) => [key, definitions.get(key).default]));
  return Object.keys(values).length ? updateSettings(values, adminId) : [];
};

module.exports = {
  setting,
  loadSettings,
  startSettingsRefresh,
  stopSettingsRefresh,
  listSettings,
  publicSettings,
  updateSettings,
  resetSettings,
  SettingsError,
};
