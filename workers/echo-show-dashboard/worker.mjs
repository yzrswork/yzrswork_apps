import { normalizeAiUsage, isHealthyAiUsage, readAiUsage } from "./ai-usage.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ----------------------------
    // READ: Echo Show
    // GET /dashboard
    // ----------------------------
    if (url.pathname === "/dashboard" && request.method === "GET") {
      const auth = request.headers.get("Authorization");
      const expected = `Bearer ${env.DASHBOARD_READ_TOKEN}`;

      if (auth !== expected) {
        return json({ error: "unauthorized" }, 401, {
          "www-authenticate": "Bearer"
        });
      }

      try {
        const value = await env.DASHBOARD_KV.get("dashboard:latest");

        if (value === null) {
          return json({ error: "dashboard_not_found" }, 404);
        }

        // AI is optional. Any AI failure preserves the existing response.
        const merged = await mergeAiUsage(value, env.DASHBOARD_KV);
        return new Response(merged, {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
          }
        });
      } catch {
        return json({ error: "internal_error" }, 500);
      }
    }

    // AI WRITE: Token Monitor, using the existing publish token.
    if (url.pathname === "/dashboard/ai" && request.method === "POST") {
      const token = env.DASHBOARD_WRITE_TOKEN;
      if (typeof token !== "string" || token.length === 0 ||
          request.headers.get("Authorization") !== `Bearer ${token}`) {
        return json({ error: "unauthorized" }, 401, {
          "www-authenticate": "Bearer"
        });
      }

      const contentType = request.headers.get("Content-Type") || "";
      if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
        return json({ error: "content_type_must_be_application_json" }, 415);
      }

      let input;
      try {
        input = JSON.parse(await readLimitedBody(request, 8192));
      } catch (error) {
        return error instanceof BodyTooLarge
          ? json({ error: "payload_too_large" }, 413)
          : json({ error: "invalid_json" }, 400);
      }

      const now = Date.now();
      const payload = normalizeAiUsage(input, now);
      if (payload === null) {
        return json({ error: "invalid_ai_payload" }, 400);
      }

      const healthy = isHealthyAiUsage(payload, now);
      try {
        const value = JSON.stringify(payload);
        // Failed/stale observations never replace the healthy AI backup.
        if (healthy) {
          await env.DASHBOARD_KV.put("dashboard:ai:lkg", value);
        }
        await env.DASHBOARD_KV.put("dashboard:ai", value);
      } catch {
        return json({ error: "internal_error" }, 500);
      }

      return json({
        ok: true,
        key: "dashboard:ai",
        updatedAt: payload.updatedAt,
        stale: !healthy
      });
    }

    // ----------------------------
    // REFRESH: Echo Show -> GitHub Actions
    // POST /dashboard/refresh
    // ----------------------------
    if (url.pathname === "/dashboard/refresh" && request.method === "POST") {
      const auth = request.headers.get("Authorization");
      const expected = `Bearer ${env.DASHBOARD_REFRESH_TOKEN}`;

      if (auth !== expected) {
        return json({ error: "unauthorized" }, 401, {
          "www-authenticate": "Bearer"
        });
      }

      try {
        const githubUrl =
          `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}` +
          `/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`;

        const response = await fetch(githubUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "echo-show-dashboard-worker",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ref: env.GITHUB_REF
          })
        });

        if (!response.ok) {
          return json(
            {
              error: "github_dispatch_failed",
              github_status: response.status
            },
            502
          );
        }

        return json(
          {
            ok: true,
            status: "dispatch_requested",
            workflow: env.GITHUB_WORKFLOW,
            ref: env.GITHUB_REF
          },
          202
        );
      } catch {
        return json({ error: "internal_error" }, 500);
      }
    }

    // ----------------------------
    // WRITE: GitHub Actions
    // POST /dashboard/publish
    // ----------------------------
    if (url.pathname === "/dashboard/publish" && request.method === "POST") {
      const auth = request.headers.get("Authorization");
      const expected = `Bearer ${env.DASHBOARD_WRITE_TOKEN}`;

      if (auth !== expected) {
        return json({ error: "unauthorized" }, 401, {
          "www-authenticate": "Bearer"
        });
      }

      const contentType = request.headers.get("Content-Type") || "";
      if (!contentType.includes("application/json")) {
        return json({ error: "content_type_must_be_application_json" }, 415);
      }

      try {
        const payload = await request.json();

        // Minimal v1 contract validation
        if (
          payload?.schema_version !== 1 ||
          typeof payload?.data_date !== "string" ||
          typeof payload?.generated_at !== "string" ||
          typeof payload?.source?.repository !== "string" ||
          typeof payload?.source?.main_sha !== "string" ||
          !payload?.today ||
          !payload?.next ||
          !Array.isArray(payload?.activity)
        ) {
          return json({ error: "invalid_dashboard_payload" }, 400);
        }

        await env.DASHBOARD_KV.put(
          "dashboard:latest",
          JSON.stringify(payload)
        );

        return json(
          {
            ok: true,
            key: "dashboard:latest",
            schema_version: payload.schema_version,
            generated_at: payload.generated_at
          },
          200
        );
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

async function mergeAiUsage(value, kv) {
  try {
    const snapshot = JSON.parse(value);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return value;
    }
    const ai = await readAiUsage(kv);
    if (ai === null) return value;
    const merged = JSON.stringify({ ...snapshot, ai });
    // Butler's existing reader caps the entire response at 128 KiB.
    return new TextEncoder().encode(merged).byteLength <= 128 * 1024 ? merged : value;
  } catch {
    return value;
  }
}

class BodyTooLarge extends Error {}

async function readLimitedBody(request, limit) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (declaredLength > limit) throw new BodyTooLarge();
  if (request.body === null) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new BodyTooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
