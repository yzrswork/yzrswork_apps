import { timestampMs } from "./ai-usage.mjs";

export const HOST_MAX_BYTES = 16 * 1024 ** 4; // 16 TiB; shared with the native reader.
const PREFIX = "dashboard:host:";
const statuses = ["ok", "no-matches", "partial", "access-denied", "timeout", "error"];
const exact = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const validMeasurement = p => p.status === "ok" || p.status === "no-matches";

export function normalizeHostMetrics(v, now = Date.now()) {
  if (!exact(v, ["schemaVersion", "source", "measuredAt", "codexTemp"]) ||
      v.schemaVersion !== 1 || v.source !== "windows-codex-temp" ||
      !exact(v.codexTemp, ["bytes", "status"]) || !Number.isFinite(now)) return null;
  const at = timestampMs(v.measuredAt);
  if (at === null || at < 0 || at > now || !statuses.includes(v.codexTemp.status)) return null;
  const { bytes, status } = v.codexTemp;
  if (validMeasurement(v.codexTemp)
    ? !Number.isSafeInteger(bytes) || bytes < 0 || bytes > HOST_MAX_BYTES || (status === "no-matches" && bytes !== 0)
    : bytes !== null) return null;
  return { schemaVersion: 1, source: "windows-codex-temp", measuredAt: v.measuredAt,
    codexTemp: { bytes, status } };
}

// KV has no compare-and-swap. Immutable, reverse-time keys prevent a delayed
// older POST from overwriting a newer observation, including across isolates.
// Separate prefixes preserve a valid LKG through arbitrarily many failures.
function observationKey(p) {
  const lane = validMeasurement(p.codexTemp) ? "valid:" : "failure:";
  return PREFIX + lane + String(999999999999999 - timestampMs(p.measuredAt)).padStart(15, "0");
}
async function newest(kv, lane, now) {
  const page = await kv.list({ prefix: PREFIX + lane + ":", limit: 1 });
  if (!page.keys?.length) return null;
  const raw = await kv.get(page.keys[0].name);
  const p = normalizeHostMetrics(JSON.parse(raw), now);
  return p && observationKey(p) === page.keys[0].name ? p : null;
}
export async function writeHostMetrics(kv, p, now = Date.now()) {
  const [valid, failure] = await Promise.all([newest(kv, "valid", now), newest(kv, "failure", now)]);
  const latest = [valid, failure].filter(Boolean).sort((a, b) => timestampMs(b.measuredAt) - timestampMs(a.measuredAt))[0];
  if (latest && timestampMs(p.measuredAt) <= timestampMs(latest.measuredAt)) return false;
  await kv.put(observationKey(p), JSON.stringify(p), { expirationTtl: 30 * 24 * 60 * 60 });
  return true;
}
export async function readHostMetrics(kv, now = Date.now()) {
  try {
    const valid = await newest(kv, "valid", now);
    // A failure to read status must explicitly stale a usable LKG.
    let failure;
    try { failure = await newest(kv, "failure", now); } catch {
      return valid ? { ...valid, stale: true } : null;
    }
    if (valid) return { ...valid, stale: now - timestampMs(valid.measuredAt) > 15 * 60 * 1000 ||
      !!(failure && timestampMs(failure.measuredAt) >= timestampMs(valid.measuredAt)) };
    return failure ? { ...failure, stale: true } : null;
  } catch { return null; }
}
