import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../workers/echo-show-dashboard/worker.mjs";
import { normalizeHostMetrics, writeHostMetrics, readHostMetrics, HOST_MAX_BYTES } from "../../workers/echo-show-dashboard/host-metrics.mjs";

const now = Date.now() - 1000;
const payload = (at = now, bytes = 6912, status = "ok") => ({ schemaVersion: 1, source: "windows-codex-temp", measuredAt: new Date(at).toISOString(), codexTemp: { bytes, status } });
function kvStore() {
  const values = new Map();
  const puts = [];
  return { values, puts, async get(k) { return values.get(k) ?? null; },
    async list({ prefix, limit }) { return { keys: [...values.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit).map(name => ({ name })) }; },
    async put(k, v) { puts.push(k); values.set(k, v); } };
}
const env = kv => ({ DASHBOARD_KV: kv, DASHBOARD_HOST_WRITE_TOKEN: "host-test", DASHBOARD_READ_TOKEN: "read-test", DASHBOARD_AI_WRITE_TOKEN: "ai-test" });
const post = (kv, p, token = "host-test", contentType = "application/json") => worker.fetch(new Request("https://example.test/dashboard/host", {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body: typeof p === "string" ? p : JSON.stringify(p)
}), env(kv));

test("strict schema, null, zero, timestamp, privacy and range validation", () => {
  assert.ok(normalizeHostMetrics(payload(), now));
  assert.ok(normalizeHostMetrics(payload(now, 0, "no-matches"), now));
  for (const status of ["partial", "access-denied", "timeout", "error"]) assert.ok(normalizeHostMetrics(payload(now, null, status), now));
  for (const bytes of [null, -1, 1.5, "0", true, HOST_MAX_BYTES + 1]) assert.equal(normalizeHostMetrics(payload(now, bytes), now), null);
  for (const p of [payload(now, 1, "no-matches"), payload(now, 0, "partial"), payload(now, null, "unknown"),
    { ...payload(), source: "private-hostname" }, { ...payload(), schemaVersion: 2 }, { ...payload(), path: "private" },
    { ...payload(), measuredAt: "2026-02-30T00:00:00Z" }, payload(now + 1),
    { ...payload(), codexTemp: { status: "ok" } }, { ...payload(), codexTemp: { bytes: 0 } },
    { ...payload(), codexTemp: { ...payload().codexTemp, files: [] } }]) assert.equal(normalizeHostMetrics(p, now), null);
});
test("host authentication is isolated and fails closed", async () => {
  const kv = kvStore();
  for (const token of ["read-test", "ai-test", "undefined", ""]) assert.equal((await post(kv, payload(), token)).status, 401);
  const e = env(kv); delete e.DASHBOARD_HOST_WRITE_TOKEN;
  assert.equal((await worker.fetch(new Request("https://example.test/dashboard/host", { method: "POST", headers: { Authorization: "Bearer undefined" } }), e)).status, 401);
  assert.equal((await post(kv, payload(), "host-test", "text/plain")).status, 415);
  assert.equal((await post(kv, "{")).status, 400);
  assert.equal((await post(kv, "x".repeat(2049))).status, 413);
  assert.equal((await post(kv, payload(now, null))).status, 400);
  assert.equal(kv.puts.length, 0);
});
test("newer valid observation survives old writes and concurrent reversed completions", async () => {
  const kv = kvStore();
  assert.equal((await post(kv, payload())).status, 200);
  assert.equal((await post(kv, payload(now - 1, 0))).status, 409);
  assert.equal((await post(kv, payload())).status, 409);
  assert.equal((await readHostMetrics(kv, now)).codexTemp.bytes, 6912);
  // Both requests pass their reads before the newer put completes first.
  const concurrent = kvStore();
  const actualPut = concurrent.put;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  concurrent.put = async (k, v) => { if (JSON.parse(v).measuredAt === payload().measuredAt) await barrier; await actualPut(k, v); };
  const oldWrite = writeHostMetrics(concurrent, payload(), now + 1);
  await writeHostMetrics(concurrent, payload(now + 1, 12345), now + 1);
  release(); await oldWrite;
  assert.equal((await readHostMetrics(concurrent, now + 1)).codexTemp.bytes, 12345);
});
test("failure, age and KV faults expose stale LKG; missing never becomes zero", async () => {
  const kv = kvStore();
  assert.equal(await readHostMetrics(kv, now), null);
  await writeHostMetrics(kv, payload(), now);
  assert.equal((await readHostMetrics(kv, now)).stale, false);
  assert.equal((await readHostMetrics(kv, now + 16 * 60000)).stale, true);
  await writeHostMetrics(kv, payload(now + 1, null, "partial"), now + 1);
  const lkg = await readHostMetrics(kv, now + 1);
  assert.equal(lkg.codexTemp.bytes, 6912); assert.equal(lkg.stale, true);
  const original = kv.list;
  kv.list = async o => { if (o.prefix.endsWith("failure:")) throw Error("private-error"); return original(o); };
  assert.equal((await readHostMetrics(kv, now + 1)).stale, true);
  kv.list = async () => { throw Error("private-error"); };
  assert.equal(await readHostMetrics(kv, now), null);
});
test("GET optional host composition preserves TODAY/AI and caps the response", async () => {
  const kv = kvStore();
  const today = { schema_version: 1, today: { notes_total: 42 }, ai: { example: "untouched" }, next: {}, activity: [] };
  kv.values.set("dashboard:latest", JSON.stringify(today));
  const read = () => worker.fetch(new Request("https://example.test/dashboard", { headers: { Authorization: "Bearer read-test" } }), env(kv));
  assert.deepEqual(await (await read()).json(), today);
  await writeHostMetrics(kv, payload(), now);
  let result = await (await read()).json();
  assert.equal(result.host.codexTemp.bytes, 6912); assert.equal(result.host.stale, false);
  delete result.host; assert.deepEqual(result, today);
  assert.ok(kv.puts.every(k => k.startsWith("dashboard:host:valid:")));
  kv.list = async () => { throw Error("private-path"); };
  assert.deepEqual(await (await read()).json(), today);
  const big = { ...today, pad: "x".repeat(128 * 1024 - JSON.stringify(today).length - 9) };
  kv.values.set("dashboard:latest", JSON.stringify(big));
  assert.ok((await (await read()).text()).length <= 128 * 1024);
});
