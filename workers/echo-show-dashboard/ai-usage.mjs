const AI_KEY = "dashboard:ai";
const AI_LKG_KEY = "dashboard:ai:lkg";
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 15 * 60 * 1000;

const ROOT_KEYS = ["source", "updatedAt", "ai"];
const AI_KEYS = ["codex"];
const CODEX_KEYS = [
  "plan", "status", "stale", "todayTokens", "session", "weekly"
];
const WINDOW_KEYS = ["remainingPercent", "resetsAt"];

function hasExactKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length &&
    actual.every((key) => typeof key === "string" && keys.includes(key));
}

function isSource(value) {
  return typeof value === "string" && value === value.trim() &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

function isPlan(value) {
  return typeof value === "string" && value === value.trim() &&
    /^[\p{L}\p{N}][\p{L}\p{N} ._+-]{0,31}$/u.test(value);
}

function isStatus(value) {
  return typeof value === "string" && value === value.trim() &&
    /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value);
}

function isPercent(value) {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= 100;
}

// Keep the original timestamp, including monitor precision and UTC offset.
// Validate the calendar ourselves: Date.parse can normalize impossible dates.
export function timestampMs(value) {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!parts || parts[0].length !== value.length) return null;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const offsetHour = Number(parts[10] || 0);
  const offsetMinute = Number(parts[11] || 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (
    year < 1 || month < 1 || month > 12 || day < 1 ||
    day > days[month - 1] || hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) return null;

  const milliseconds = Number((parts[7] || "").padEnd(3, "0").slice(0, 3));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  const offsetSign = parts[9] === "-" ? -1 : 1;
  return date.getTime() - offsetSign * (offsetHour * 60 + offsetMinute) * 60 * 1000;
}

function isWindow(value) {
  return hasExactKeys(value, WINDOW_KEYS) &&
    isPercent(value.remainingPercent) && timestampMs(value.resetsAt) !== null;
}

/** Validate every field and return a newly constructed, allowlisted payload. */
export function normalizeAiUsage(value, now = Date.now()) {
  try {
    if (!Number.isFinite(now) || !hasExactKeys(value, ROOT_KEYS)) return null;
    if (!isSource(value.source) || !hasExactKeys(value.ai, AI_KEYS)) return null;

    const updatedAtMs = timestampMs(value.updatedAt);
    if (updatedAtMs === null || updatedAtMs >= now + MAX_FUTURE_MS) return null;

    const codex = value.ai.codex;
    if (
      !hasExactKeys(codex, CODEX_KEYS) || !isPlan(codex.plan) ||
      !isStatus(codex.status) || typeof codex.stale !== "boolean" ||
      !Number.isSafeInteger(codex.todayTokens) || codex.todayTokens < 0 ||
      !isWindow(codex.session) || !isWindow(codex.weekly)
    ) return null;

    return {
      source: value.source,
      updatedAt: value.updatedAt,
      ai: {
        codex: {
          plan: codex.plan,
          status: codex.status,
          stale: codex.stale,
          todayTokens: codex.todayTokens,
          session: {
            remainingPercent: codex.session.remainingPercent,
            resetsAt: codex.session.resetsAt
          },
          weekly: {
            remainingPercent: codex.weekly.remainingPercent,
            resetsAt: codex.weekly.resetsAt
          }
        }
      }
    };
  } catch {
    return null;
  }
}

export function isHealthyAiUsage(payload, now = Date.now()) {
  const value = normalizeAiUsage(payload, now);
  return value !== null && value.ai.codex.status === "ok" &&
    !value.ai.codex.stale && now - timestampMs(value.updatedAt) <= MAX_AGE_MS;
}

async function readPayload(kv, key, now) {
  try {
    const stored = await kv.get(key);
    if (typeof stored !== "string") return null;
    return normalizeAiUsage(JSON.parse(stored), now);
  } catch {
    return null;
  }
}

function dashboardAi(payload, stale) {
  return {
    source: payload.source,
    updatedAt: payload.updatedAt,
    codex: { ...payload.ai.codex, stale }
  };
}

/** AI faults are isolated from the existing dashboard read path. */
export async function readAiUsage(kv, now = Date.now()) {
  try {
    const latest = await readPayload(kv, AI_KEY, now);
    if (latest && isHealthyAiUsage(latest, now)) {
      return dashboardAi(latest, false);
    }

    const lkg = await readPayload(kv, AI_LKG_KEY, now);
    // A stored healthy observation remains useful after its freshness expires.
    if (lkg && lkg.ai.codex.status === "ok" && !lkg.ai.codex.stale) {
      return dashboardAi(lkg, true);
    }
    return latest ? dashboardAi(latest, true) : null;
  } catch {
    return null;
  }
}
