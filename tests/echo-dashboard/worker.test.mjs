import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../workers/echo-show-dashboard/worker.mjs";
import { normalizeAiUsage, isHealthyAiUsage, readAiUsage } from "../../workers/echo-show-dashboard/ai-usage.mjs";

const READ_TOKEN = "test-read";
const WRITE_TOKEN = "test-write";
const REFRESH_TOKEN = "test-refresh";

function aiPayload(overrides = {}) {
  const now = Date.now();
  return {
    source: "token-monitor",
    updatedAt: new Date(now).toISOString(),
    ai: {
      codex: {
        plan: "Plus",
        status: "ok",
        stale: false,
        todayTokens: 6944007,
        session: {
          remainingPercent: 65,
          resetsAt: new Date(now + 60 * 60 * 1000).toISOString(),
        },
        weekly: {
          remainingPercent: 52,
          resetsAt: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    },
    ...overrides,
  };
}

function dashboardPayload() {
  return {
    schema_version: 1,
    data_date: "2026-10-05",
    generated_at: "2026-10-05T10:00:00Z",
    source: { repository: "example/dashboard", main_sha: "abcdef" },
    today: { title: "Existing today" },
    next: { title: "Existing next" },
    activity: [{ title: "Existing activity" }],
  };
}

function memoryKv(initial = {}, { failGet = [], failPut = [] } = {}) {
  const values = new Map(Object.entries(initial));
  const gets = [];
  const puts = [];
  return {
    values,
    gets,
    puts,
    async get(key) {
      gets.push(key);
      if (failGet.includes(key)) throw new Error("Test KV read failure");
      return values.has(key) ? values.get(key) : null;
    },
    async put(key, value) {
      puts.push({ key, value });
      if (failPut.includes(key)) throw new Error("Test KV write failure");
      values.set(key, value);
    },
  };
}

function environment(kv) {
  return {
    DASHBOARD_KV: kv,
    DASHBOARD_READ_TOKEN: READ_TOKEN,
    DASHBOARD_WRITE_TOKEN: WRITE_TOKEN,
    DASHBOARD_REFRESH_TOKEN: REFRESH_TOKEN,
    GITHUB_OWNER: "test-owner",
    GITHUB_REPO: "test-repo",
    GITHUB_WORKFLOW: "test-workflow.yml",
    GITHUB_DISPATCH_TOKEN: "test-github-dispatch",
    GITHUB_REF: "test-branch",
  };
}

async function request(kv, path, {
  method = "GET",
  token = READ_TOKEN,
  body,
  contentType = "application/json",
  envOverrides = {},
} = {}) {
  const headers = new Headers();
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined && contentType !== null) headers.set("Content-Type", contentType);
  return worker.fetch(new Request(`https://dashboard.test${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  }), { ...environment(kv), ...envOverrides });
}

async function postAi(kv, body = aiPayload(), options = {}) {
  return request(kv, "/dashboard/ai", { method: "POST", token: WRITE_TOKEN, body, ...options });
}

function assertDashboardPreserved(result, existing) {
  const { ai, ...dashboard } = result;
  assert.deepEqual(dashboard, existing);
  return ai;
}

test("AI ingest accepts the PoC shape and writes only independent AI keys", async () => {
  const existingRaw = JSON.stringify(dashboardPayload(), null, 2);
  const kv = memoryKv({ "dashboard:latest": existingRaw });
  const payload = aiPayload();
  const response = await postAi(kv, payload, { contentType: "application/json; charset=utf-8" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(kv.puts.map(({ key }) => key).sort(), ["dashboard:ai", "dashboard:ai:lkg"]);
  assert.equal(kv.values.get("dashboard:latest"), existingRaw);
  assert.deepEqual(JSON.parse(kv.values.get("dashboard:ai")), payload);
  assert.deepEqual(JSON.parse(kv.values.get("dashboard:ai:lkg")), payload);

  const read = await request(kv, "/dashboard");
  assert.equal(read.status, 200);
  const ai = assertDashboardPreserved(await read.json(), dashboardPayload());
  assert.deepEqual(ai, {
    source: payload.source,
    updatedAt: payload.updatedAt,
    codex: payload.ai.codex,
  });
});

test("AI ingest requires the write token and never writes on auth failure", async (t) => {
  for (const token of [null, "wrong", READ_TOKEN, REFRESH_TOKEN]) {
    await t.test(String(token), async () => {
      const kv = memoryKv();
      const response = await postAi(kv, aiPayload(), { token });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.equal(kv.puts.length, 0);
    });
  }
});

test("AI ingest refuses an unconfigured write token", async () => {
  const kv = memoryKv();
  const response = await postAi(kv, aiPayload(), {
    token: "undefined",
    envOverrides: { DASHBOARD_WRITE_TOKEN: undefined },
  });
  assert.equal(response.status, 401);
  assert.equal(kv.puts.length, 0);
});

test("AI ingest refuses an empty write token", async () => {
  const kv = memoryKv();
  const response = await postAi(kv, aiPayload(), {
    token: "",
    envOverrides: { DASHBOARD_WRITE_TOKEN: "" },
  });
  assert.equal(response.status, 401);
  assert.equal(kv.puts.length, 0);
});

test("AI ingest requires JSON and rejects malformed JSON without storage", async (t) => {
  for (const contentType of [null, "text/plain", "application/jsonp"]) {
    await t.test(`content type ${contentType}`, async () => {
      const kv = memoryKv();
      const response = await postAi(kv, aiPayload(), { contentType });
      assert.equal(response.status, 415);
      assert.equal(kv.puts.length, 0);
    });
  }
  const kv = memoryKv();
  assert.equal((await postAi(kv, "{broken")).status, 400);
  assert.equal(kv.puts.length, 0);
});

test("AI ingest rejects bodies over 8 KiB before storage", async () => {
  const kv = memoryKv();
  assert.equal((await postAi(kv, " ".repeat(8193))).status, 413);
  assert.equal(kv.puts.length, 0);
});

test("AI body limit measures bytes and accepts a valid body exactly 8 KiB long", async () => {
  const payloadRaw = JSON.stringify(aiPayload());
  const padded = payloadRaw + " ".repeat(8192 - Buffer.byteLength(payloadRaw));
  assert.equal(Buffer.byteLength(padded), 8192);
  assert.equal((await postAi(memoryKv(), padded)).status, 200);

  const kv = memoryKv();
  const multibyte = JSON.stringify({ ...aiPayload(), extra: "あ".repeat(2700) });
  assert.ok(multibyte.length < 8192);
  assert.ok(Buffer.byteLength(multibyte) > 8192);
  assert.equal((await postAi(kv, multibyte)).status, 413);
  assert.equal(kv.puts.length, 0);
});

test("AI ingest rejects unknown and sensitive fields at every nesting level", async (t) => {
  const mutations = [
    ["root accountEmail", (p) => { p.accountEmail = "example@example.test"; }],
    ["root accountKey", (p) => { p.accountKey = "test-account-key"; }],
    ["root OAuth", (p) => { p.OAuth = "test-oauth"; }],
    ["root secret", (p) => { p.secret = "test-secret"; }],
    ["root unknown", (p) => { p.extra = true; }],
    ["ai unknown", (p) => { p.ai.secret = "test-secret"; }],
    ["ai other provider", (p) => { p.ai.otherProvider = {}; }],
    ["codex accountEmail", (p) => { p.ai.codex.accountEmail = "example@example.test"; }],
    ["codex OAuth", (p) => { p.ai.codex.OAuth = {}; }],
    ["codex unknown", (p) => { p.ai.codex.extra = true; }],
    ["session secret", (p) => { p.ai.codex.session.secret = "test-secret"; }],
    ["session unknown", (p) => { p.ai.codex.session.extra = true; }],
    ["weekly accountKey", (p) => { p.ai.codex.weekly.accountKey = "test-key"; }],
    ["weekly unknown", (p) => { p.ai.codex.weekly.extra = true; }],
    ["source object", (p) => { p.source = { name: "token-monitor", secret: "test-secret" }; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const kv = memoryKv();
      const payload = aiPayload();
      mutate(payload);
      assert.equal((await postAi(kv, payload)).status, 400);
      assert.equal(kv.puts.length, 0);
    });
  }
});

test("AI ingest validates required structure, types, ranges, and RFC3339 dates", async (t) => {
  const mutations = [
    ["missing source", (p) => { delete p.source; }],
    ["source empty", (p) => { p.source = ""; }],
    ["source URL", (p) => { p.source = "https://example.test/account"; }],
    ["source newline", (p) => { p.source = "token-monitor\n"; }],
    ["missing updatedAt", (p) => { delete p.updatedAt; }],
    ["missing ai", (p) => { delete p.ai; }],
    ["null codex", (p) => { p.ai.codex = null; }],
    ["missing plan", (p) => { delete p.ai.codex.plan; }],
    ["plan object", (p) => { p.ai.codex.plan = {}; }],
    ["plan email", (p) => { p.ai.codex.plan = "example@example.test"; }],
    ["plan whitespace", (p) => { p.ai.codex.plan = " Plus "; }],
    ["plan too long", (p) => { p.ai.codex.plan = "p".repeat(33); }],
    ["status object", (p) => { p.ai.codex.status = {}; }],
    ["status newline", (p) => { p.ai.codex.status = "ok\n"; }],
    ["stale string", (p) => { p.ai.codex.stale = "false"; }],
    ["tokens negative", (p) => { p.ai.codex.todayTokens = -1; }],
    ["tokens fractional", (p) => { p.ai.codex.todayTokens = 1.5; }],
    ["tokens unsafe integer", (p) => { p.ai.codex.todayTokens = Number.MAX_SAFE_INTEGER + 1; }],
    ["tokens string", (p) => { p.ai.codex.todayTokens = "6944007"; }],
    ["session negative percent", (p) => { p.ai.codex.session.remainingPercent = -1; }],
    ["weekly over 100 percent", (p) => { p.ai.codex.weekly.remainingPercent = 101; }],
    ["session string percent", (p) => { p.ai.codex.session.remainingPercent = "65"; }],
    ["weekly null", (p) => { p.ai.codex.weekly = null; }],
    ["updatedAt non-date", (p) => { p.updatedAt = "yesterday"; }],
    ["updatedAt lacks offset", (p) => { p.updatedAt = "2026-10-05T10:00:00"; }],
    ["updatedAt impossible date", (p) => { p.updatedAt = "2026-02-30T10:00:00Z"; }],
    ["updatedAt future", (p) => { p.updatedAt = new Date(Date.now() + 6 * 60 * 1000).toISOString(); }],
    ["updatedAt newline", (p) => { p.updatedAt += "\n"; }],
    ["updatedAt invalid leap day", (p) => { p.updatedAt = "2025-02-29T10:00:00Z"; }],
    ["updatedAt invalid hour", (p) => { p.updatedAt = "2026-10-05T24:00:00Z"; }],
    ["updatedAt invalid offset", (p) => { p.updatedAt = "2026-10-05T10:00:00+24:00"; }],
    ["session reset non-date", (p) => { p.ai.codex.session.resetsAt = "tomorrow"; }],
    ["weekly reset non-date", (p) => { p.ai.codex.weekly.resetsAt = 123; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const kv = memoryKv();
      const payload = aiPayload();
      mutate(payload);
      assert.equal((await postAi(kv, payload)).status, 400);
      assert.equal(kv.puts.length, 0);
    });
  }
  for (const invalidRoot of ["null", "[]", "42", '"hello"']) {
    await t.test(`invalid root ${invalidRoot}`, async () => {
      const kv = memoryKv();
      assert.equal((await postAi(kv, invalidRoot)).status, 400);
      assert.equal(kv.puts.length, 0);
    });
  }
});

test("AI percentages accept zero and 100", async () => {
  const payload = aiPayload();
  payload.ai.codex.session.remainingPercent = 0;
  payload.ai.codex.weekly.remainingPercent = 100;
  assert.equal((await postAi(memoryKv(), payload)).status, 200);
});

test("AI normalization preserves PoC timestamp precision and valid UTC offsets", () => {
  const now = Date.parse("2026-10-05T10:00:00Z");
  const payload = aiPayload({ updatedAt: "2026-10-05T19:00:00.1234567+09:00" });
  payload.ai.codex.session.resetsAt = "2026-10-05T11:00:00.123456789z";
  payload.ai.codex.weekly.resetsAt = "2028-02-29t23:59:59-05:30";
  assert.deepEqual(normalizeAiUsage(payload, now), payload);
});

test("AI freshness and future timestamp boundaries are deterministic", () => {
  const now = Date.parse("2026-10-05T10:00:00Z");
  const threshold = aiPayload({ updatedAt: new Date(now - 15 * 60 * 1000).toISOString() });
  assert.equal(isHealthyAiUsage(threshold, now), true);
  assert.equal(isHealthyAiUsage(threshold, now + 1), false);
  const withinFuture = aiPayload({ updatedAt: new Date(now + 5 * 60 * 1000 - 1).toISOString() });
  assert.ok(normalizeAiUsage(withinFuture, now));
  const tooFuture = aiPayload({ updatedAt: new Date(now + 5 * 60 * 1000).toISOString() });
  assert.equal(normalizeAiUsage(tooFuture, now), null);
});

test("stale and non-ok AI reports preserve LKG and serve its values as stale", async (t) => {
  for (const change of ["stale", "error"]) {
    await t.test(change, async () => {
      const knownGood = aiPayload();
      const latest = aiPayload();
      latest.ai.codex.todayTokens = 999;
      if (change === "stale") latest.ai.codex.stale = true;
      else latest.ai.codex.status = "error";
      const goodRaw = JSON.stringify(knownGood);
      const kv = memoryKv({
        "dashboard:latest": JSON.stringify(dashboardPayload()),
        "dashboard:ai:lkg": goodRaw,
      });
      assert.equal((await postAi(kv, latest)).status, 200);
      assert.equal(kv.values.get("dashboard:ai:lkg"), goodRaw);
      assert.deepEqual(kv.puts.map(({ key }) => key), ["dashboard:ai"]);
      const response = await request(kv, "/dashboard");
      assert.equal(response.status, 200);
      const ai = assertDashboardPreserved(await response.json(), dashboardPayload());
      assert.equal(ai.updatedAt, knownGood.updatedAt);
      assert.equal(ai.codex.todayTokens, 6944007);
      assert.equal(ai.codex.stale, true);
    });
  }
});

test("AI reports older than 15 minutes are stale and do not replace LKG", async () => {
  const knownGood = aiPayload();
  const old = aiPayload({ updatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() });
  const goodRaw = JSON.stringify(knownGood);
  const kv = memoryKv({ "dashboard:ai:lkg": goodRaw });
  assert.equal((await postAi(kv, old)).status, 200);
  assert.equal(kv.values.get("dashboard:ai:lkg"), goodRaw);
  assert.deepEqual(kv.puts.map(({ key }) => key), ["dashboard:ai"]);

  const dashboardKv = memoryKv({
    "dashboard:latest": JSON.stringify(dashboardPayload()),
    "dashboard:ai": JSON.stringify(old),
  });
  const response = await request(dashboardKv, "/dashboard");
  assert.equal(response.status, 200);
  const ai = assertDashboardPreserved(await response.json(), dashboardPayload());
  assert.equal(ai.updatedAt, old.updatedAt);
  assert.equal(ai.codex.stale, true);
});

test("missing, invalid, or inaccessible latest AI falls back to LKG", async (t) => {
  const cases = [
    ["missing", undefined, []],
    ["malformed JSON", "{broken", []],
    ["invalid schema", '{"source":"token-monitor"}', []],
    ["KV failure", undefined, ["dashboard:ai"]],
  ];
  for (const [name, raw, failGet] of cases) {
    await t.test(name, async () => {
      const good = aiPayload();
      const kv = memoryKv({
        "dashboard:latest": JSON.stringify(dashboardPayload()),
        "dashboard:ai:lkg": JSON.stringify(good),
        ...(raw !== undefined ? { "dashboard:ai": raw } : {}),
      }, { failGet });
      const response = await request(kv, "/dashboard");
      assert.equal(response.status, 200);
      const ai = assertDashboardPreserved(await response.json(), dashboardPayload());
      assert.equal(ai.updatedAt, good.updatedAt);
      assert.equal(ai.codex.todayTokens, 6944007);
      assert.equal(ai.codex.stale, true);
    });
  }
});

test("AI read failures and invalid storage never prevent the existing dashboard response", async (t) => {
  const raw = JSON.stringify(dashboardPayload(), null, 2);
  const cases = [
    ["both missing", {}, []],
    ["both invalid", { "dashboard:ai": "{broken", "dashboard:ai:lkg": "[]" }, []],
    ["both KV failures", {}, ["dashboard:ai", "dashboard:ai:lkg"]],
    ["invalid unknown confidential field", {
      "dashboard:ai": JSON.stringify({ ...aiPayload(), accountEmail: "example@example.test" }),
    }, []],
  ];
  for (const [name, initial, failGet] of cases) {
    await t.test(name, async () => {
      const kv = memoryKv({ "dashboard:latest": raw, ...initial }, { failGet });
      const response = await request(kv, "/dashboard");
      assert.equal(response.status, 200);
      assert.equal(await response.text(), raw);
      assert.equal(kv.puts.length, 0);
    });
  }
});

test("an expired LKG remains usable and an invalid LKG cannot leak forbidden fields", async () => {
  const now = Date.parse("2026-10-05T10:00:00Z");
  const expired = aiPayload({ updatedAt: "2026-10-04T10:00:00Z" });
  const kv = memoryKv({ "dashboard:ai:lkg": JSON.stringify(expired) });
  const ai = await readAiUsage(kv, now);
  assert.equal(ai.updatedAt, expired.updatedAt);
  assert.equal(ai.codex.todayTokens, 6944007);
  assert.equal(ai.codex.stale, true);

  const invalidLkg = memoryKv({
    "dashboard:ai:lkg": JSON.stringify({ ...expired, secret: "test-secret" }),
  });
  assert.equal(await readAiUsage(invalidLkg, now), null);
});

test("unhealthy latest without LKG is returned with explicit stale=true", async () => {
  const payload = aiPayload();
  payload.ai.codex.status = "unavailable";
  const kv = memoryKv({
    "dashboard:latest": JSON.stringify(dashboardPayload()),
    "dashboard:ai": JSON.stringify(payload),
  });
  const response = await request(kv, "/dashboard");
  assert.equal(response.status, 200);
  const ai = assertDashboardPreserved(await response.json(), dashboardPayload());
  assert.equal(ai.codex.status, "unavailable");
  assert.equal(ai.codex.stale, true);
});

test("base snapshot parse or shape failures retain its original response even with valid AI", async (t) => {
  for (const raw of ["{broken", "[]", "null", '"legacy"']) {
    await t.test(raw, async () => {
      const kv = memoryKv({ "dashboard:latest": raw, "dashboard:ai": JSON.stringify(aiPayload()) });
      const response = await request(kv, "/dashboard");
      assert.equal(response.status, 200);
      assert.equal(await response.text(), raw);
    });
  }
});

test("AI merging that exceeds the existing client 128 KiB cap retains the original snapshot", async () => {
  const base = { ...dashboardPayload(), padding: "" };
  base.padding = "x".repeat(128 * 1024 - Buffer.byteLength(JSON.stringify(base)));
  const raw = JSON.stringify(base);
  assert.equal(Buffer.byteLength(raw), 128 * 1024);
  const kv = memoryKv({ "dashboard:latest": raw, "dashboard:ai": JSON.stringify(aiPayload()) });
  const response = await request(kv, "/dashboard");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), raw);
});

test("AI ingest reports a storage failure without touching dashboard:latest", async () => {
  const raw = JSON.stringify(dashboardPayload());
  const kv = memoryKv({ "dashboard:latest": raw }, { failPut: ["dashboard:ai"] });
  assert.equal((await postAi(kv)).status, 500);
  assert.equal(kv.values.get("dashboard:latest"), raw);
});

test("a failed LKG write prevents publishing a new latest AI report", async () => {
  const old = JSON.stringify(aiPayload());
  const kv = memoryKv({ "dashboard:ai": old }, { failPut: ["dashboard:ai:lkg"] });
  assert.equal((await postAi(kv)).status, 500);
  assert.equal(kv.values.get("dashboard:ai"), old);
  assert.deepEqual(kv.puts.map(({ key }) => key), ["dashboard:ai:lkg"]);
});

test("existing GET read authentication, content, missing data, and failure behavior remain", async (t) => {
  for (const token of [null, "wrong", WRITE_TOKEN, REFRESH_TOKEN]) {
    await t.test(`unauthorized ${token}`, async () => {
      const kv = memoryKv({ "dashboard:latest": "{}" });
      const response = await request(kv, "/dashboard", { token });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.equal(kv.gets.length, 0);
    });
  }
  await t.test("raw existing content", async () => {
    const raw = '{\n  "legacy": true\n}';
    const response = await request(memoryKv({ "dashboard:latest": raw }), "/dashboard");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), raw);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
  await t.test("missing existing dashboard", async () => {
    const response = await request(memoryKv({ "dashboard:ai": JSON.stringify(aiPayload()) }), "/dashboard");
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "dashboard_not_found" });
  });
  await t.test("existing dashboard KV failure", async () => {
    const response = await request(memoryKv({}, { failGet: ["dashboard:latest"] }), "/dashboard");
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal_error" });
  });
});

test("existing publish route keeps write auth, validation, response, and AI storage isolation", async (t) => {
  for (const token of [null, "wrong", READ_TOKEN, REFRESH_TOKEN]) {
    await t.test(`unauthorized ${token}`, async () => {
      const kv = memoryKv();
      const response = await request(kv, "/dashboard/publish", { method: "POST", token, body: dashboardPayload() });
      assert.equal(response.status, 401);
      assert.equal(kv.puts.length, 0);
    });
  }
  for (const [name, body, contentType, expectedStatus, expectedError] of [
    ["wrong content type", dashboardPayload(), "text/plain", 415, "content_type_must_be_application_json"],
    ["malformed JSON", "{broken", "application/json", 400, "invalid_json"],
    ["invalid contract", {}, "application/json", 400, "invalid_dashboard_payload"],
  ]) {
    await t.test(name, async () => {
      const kv = memoryKv();
      const response = await request(kv, "/dashboard/publish", { method: "POST", token: WRITE_TOKEN, body, contentType });
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(await response.json(), { error: expectedError });
      assert.equal(kv.puts.length, 0);
    });
  }
  await t.test("valid publish changes dashboard only", async () => {
    const aiRaw = JSON.stringify(aiPayload());
    const kv = memoryKv({ "dashboard:ai": aiRaw, "dashboard:ai:lkg": aiRaw });
    const payload = dashboardPayload();
    const response = await request(kv, "/dashboard/publish", { method: "POST", token: WRITE_TOKEN, body: payload });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      key: "dashboard:latest",
      schema_version: 1,
      generated_at: payload.generated_at,
    });
    assert.deepEqual(kv.puts.map(({ key }) => key), ["dashboard:latest"]);
    assert.equal(kv.values.get("dashboard:ai"), aiRaw);
    assert.equal(kv.values.get("dashboard:ai:lkg"), aiRaw);
  });
});

test("existing refresh route keeps token separation and mocked dispatch behavior", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = [];
  try {
    globalThis.fetch = async (...args) => { calls.push(args); return new Response(null, { status: 204 }); };
    for (const token of [null, "wrong", READ_TOKEN, WRITE_TOKEN]) {
      await t.test(`unauthorized ${token}`, async () => {
        calls = [];
        const kv = memoryKv();
        const response = await request(kv, "/dashboard/refresh", { method: "POST", token });
        assert.equal(response.status, 401);
        assert.equal(calls.length, 0);
        assert.equal(kv.puts.length, 0);
      });
    }
    await t.test("successful dispatch", async () => {
      calls = [];
      const kv = memoryKv();
      const response = await request(kv, "/dashboard/refresh", { method: "POST", token: REFRESH_TOKEN });
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), {
        ok: true,
        status: "dispatch_requested",
        workflow: "test-workflow.yml",
        ref: "test-branch",
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], "https://api.github.com/repos/test-owner/test-repo/actions/workflows/test-workflow.yml/dispatches");
      assert.equal(calls[0][1].method, "POST");
      assert.equal(calls[0][1].headers.Authorization, "Bearer test-github-dispatch");
      assert.deepEqual(JSON.parse(calls[0][1].body), { ref: "test-branch" });
      assert.equal(kv.puts.length, 0);
    });
    await t.test("failed dispatch", async () => {
      globalThis.fetch = async () => new Response(null, { status: 403 });
      const response = await request(memoryKv(), "/dashboard/refresh", { method: "POST", token: REFRESH_TOKEN });
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: "github_dispatch_failed", github_status: 403 });
    });
    await t.test("dispatch exception", async () => {
      globalThis.fetch = async () => { throw new Error("Test network failure"); };
      const response = await request(memoryKv(), "/dashboard/refresh", { method: "POST", token: REFRESH_TOKEN });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "internal_error" });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unmatched methods and routes preserve Not Found", async () => {
  assert.equal((await request(memoryKv(), "/dashboard/ai")).status, 404);
  assert.equal((await request(memoryKv(), "/dashboard/publish")).status, 404);
  assert.equal((await request(memoryKv(), "/unknown")).status, 404);
});
