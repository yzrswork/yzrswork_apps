# YZRS Commerce — Phase 0.5 Pre-Live

Authority: Owner-approved **YZRS DEALS / Amazon Creators API Architecture / Implementation Brief — Final Candidate** and the current `site/catalog.json`. This directory is a generated-allowlist consumer, not another Product Master.

## Owner decision update — 2026-10-04

OG-5 is now a **production publication blocker**, not a development/controlled live PoC blocker. Owner authorized controlled live JP Creators API use for **B0C29R9LNL + B0CT9BMGLF only**, Secrets configuration on a development Worker, development/preview KV bindings, manual invocation, live response/token-reuse/freshness checks and Preview Commerce display. TEAMGROUP remains pending. Amazon support answers are still outstanding; this decision is not an Amazon permission or terms determination.

Production Worker routes, continuously running production Cron, a production public Commerce endpoint, Amazon price/Deal display on `apps.yzrswork.com`, monitor Phase 1 production and PR #37 merge remain prohibited. Keep the committed production/default config disabled. Do not set `amazonSupportApproved: true` merely to unlock a PoC. Preview display needs explicit isolation from the production publication guard, restricted access and a bounded test session; CORS/noindex alone do not make a preview private.

The 2026-10-02 Pre-Live acceptance is historical. Its Amazon-answer prerequisite for the private PoC is superseded by this decision; production prerequisites remain. Read [CONTROLLED-LIVE-POC.md](CONTROLLED-LIVE-POC.md) for the approved scope, prerequisites and evidence checklist. Authorization does not imply that any live request has already run.

## Current release gates

No route, active Cron, real KV namespace IDs or Secrets are configured. `LIVE_API_ENABLED` and `COMMERCE_PUBLIC_ENABLED` are false. Catalog `liveApiApproved`, `amazonSupportApproved` and `enabled` are false; endpoint is null. Owner approved exactly two products on 2026-10-02: Crucial CP2K16G4DFRA32A / B0C29R9LNL and CP2K16G60C48U5 / B0CT9BMGLF, enabled for mem/deals and game/creative/ai, with specification evidence only. TEAMGROUP mem-team-ddr4-32 remains pending/disabled. Both generated allowlists contain the two approved products, but approval never enables Amazon access or price publication. Fixtures are fabricated and used only with injected HTTP/KV/clock implementations.

Do not deploy this skeleton, populate production bindings, call Amazon with pending ASINs or enable monitor Phase 1. Any further product or changed model/configuration/ASIN/reason/evidence needs an individual Owner approval. Amazon must answer the applicable site-purpose, mobile/PWA, display-JSON and content/disclaimer questions before production Commerce publication. The original Brief contains the support inquiry; this implementation has not sent it.

## Boundaries

- `site/catalog.json` → `scripts/commerce-catalog.mjs` validation → build-generated browser/Worker projections with the same revision. Edit the catalog, not generated files.
- `scheduled` is the only Amazon path. Read-only `GET /v1/offers` reads `COMMERCE_SNAPSHOTS`; no arbitrary ASIN/filter/refresh query or visitor-triggered OAuth/GetItems.
- Future approved schedule: `0 * * * *`; two separate ordinary KV namespaces: `COMMERCE_SNAPSHOTS` and private `COMMERCE_AUTH`. The disabled config intentionally contains no placeholder IDs to mistake for working bindings.
- Future credentials: Worker Secrets `AMAZON_CLIENT_ID` / `AMAZON_CLIENT_SECRET`; credential version 3.3 and a rotation epoch. Never put credential/token values into catalog, Git, static bundles, health, responses, analytics or logs.
- JP LWA token requests use JSON and `creatorsapi::default`. Shared Auth KV + isolate single-flight reuse valid tokens. KV is eventually consistent, not a distributed lock. Token 429 writes a separate short-lived cooldown; GetItems 429 does not remint tokens. TokenExpired can refresh once per run without blind cache deletion.
- GetItems uses at most 10 ASINs per batch; response joins use ASIN, not input order. At most two transient HTTP retries, at least one second between item requests, and a 60-second run budget. Long Retry-After defers to another run. Real JP error shapes, quota, credentials and Worker bindings remain live-PoC gates.
- Snapshot freshness starts at the Amazon request start, not KV write completion. Absolute KV expiry and per-read/per-item checks never extend an old offer on failure. A successful missing/inaccessible/no-price response clears only that item's Commerce state. 403 stops and attempts snapshot removal. CORS is an origin restriction, not access authentication or redistribution permission.
- Price comes from one safe New BuyBox listing with known stock, positive JPY money, confirmed MAP safety, and matching API DetailPageURL/affiliate tag. Unknown conditions and Prime early-access transitions are excluded; confirmed Prime-exclusive Deals are labeled. No coupons, points, countdowns, price history, Amazon images, automatic discovery or discount ranking.

## State contract

| State | Meaning / effect |
|---|---|
| fresh | Valid safe offer, less than 60 minutes old; known Deal end may shorten the deadline |
| expired | Known end reached while the observed Deal was displayable; clear price, Savings and API URL |
| stale | Freshness lost, current Commerce state unknown; never claim that the sale ended |
| no-offer | Product still recommended, but no safe Offer/price/conditions |
| not-accessible | Item missing/inaccessible through Creators; keep owned recommendation and approved ordinary link |
| pending | Async read in progress; existing valid state remains until its own deadline, with no invented price when absent |

SALE requires approved + enabled product + `displayOn: deals` + fresh safe offer + either a recognizable active Deal or valid API Savings of at least 10% **and** JPY 500. `endTime: null` does not mean ended. Future/expired Deal economics cannot use the Savings branch to re-enter. A later success with no Deal is classified only from that new response. Recommendation order remains catalog/editorial order.

Browser price state is memory-only. Responses use `no-store`; no PAC in localStorage/sessionStorage/Cache API/Service Worker. The client subtracts request duration from server remaining freshness, clears on offline/visibility/pagehide, revalidates on resume, and rejects stale-generation responses. Optional Commerce module failure does not stop mem navigation or approved search links.

## Validation

Run at repository root with Node 24:

```sh
npm test
npm run build
npm run check
git diff --check
```

Tests use fabricated HTTP responses, fake KV, fake clocks, DOM adapters and VM execution of the actual mem/Service Worker scripts. They include token reuse/miss/race/cooldown, batch sizes, normal/partial/error responses, SALE thresholds, Deal disappearance/end, stale snapshots, pending/restart races, offline cache boundaries, disabled flags, unchanged non-mem outputs, and build refusal before overwriting generated assets.

These mocks do not certify real Amazon access, Cloudflare deployed behavior, KV propagation, real CORS/CDN behavior, browser rendering, WebKit/BFCache lifecycle or installed iPhone PWA behavior. Complete the relevant controlled PoC and browser/device checks after their gates; do not treat this mock recovery as monitor MVP or production cutover approval.

## Rollback

Current Phase 0.5 has no production cutover: retain disabled flags, empty Cron/routes/bindings and the TEAMGROUP pending status. To roll back Pre-Live static integration, revert its reviewed commit(s), regenerate and validate; keep the previous Phase 0 checkpoint. If this UI is eventually released, bump the mem SW version on rollback so cached static assets are replaced. Preserve the implementation branch/checkpoint; do not reset/clean an uncommitted tree.

For a later explicitly approved activation:

1. Disable Worker public and live flags and remove the approved Cron trigger. Return no Commerce projection; static nav/reasons/approved ordinary links remain independent.
2. Remove current `offers:v1:<revision>` snapshot keys. Readers still reject expired/revision-mismatched cached values; ordinary KV deletion is not an instant global purge.
3. Set catalog Commerce `enabled: false`/endpoint null, regenerate, and bump mem's SW version so the static disabled configuration is picked up. Restore or revert the known reviewed UI commit if needed. Already open pages may retain a previously valid projection only until its original bounded deadline; do not promise instant revocation across eventual KV/offline clients.
4. Keep Auth cooldown/short token expiry for a normal UI shutdown. For credential compromise/rotation or Amazon suspension, rotate the epoch, remove affected private Auth entries and revoke credentials as appropriate; do not clear a 429 cooldown to force reminting.
5. Re-run build/check/tests and confirm mem/kit/build/HDD and site entry points continue to work without Commerce. No new DB/Authority or history recovery is needed.

## Controlled live PoC runbook — NOT EXECUTED

The 2026-10-04 Owner decision authorizes the controlled development PoC below before the Amazon support reply, subject to JP API eligibility and exact credential/version confirmation. Production publication remains gated by Amazon's applicable written answers and separate public-release approval. No credentials, tokens, full upstream responses or PAC fixtures may be copied into Git/PR/chat/logs. Production routes/Cron/public endpoint and merge remain prohibited. The original local-dev invocation is an option; a deployed development Worker must store credentials as Worker Secrets and remain isolated from production.

### 1. Freeze the approved candidate and gates

- Record the then-current main/PR SHA and generated `catalogRevision`; rerun build/check/tests. The initial controlled set is **B0C29R9LNL + B0CT9BMGLF**, one GetItems batch. No TEAMGROUP, SearchItems, monitor or arbitrary query ASINs.
- Owner checks the actual Amazon listing model/kit against the approved 16GB×2 tuple before the first query; approval in the catalog is not proof of Amazon's current variation mapping.
- Retain the Amazon response for site purpose, responsive/mobile/PWA, first-party display JSON/caching/redistribution, registered URLs and exact required disclaimers when it becomes available. These answers block production publication, not the Owner-authorized development PoC. Apply any required presentation changes through review first; CORS is not a permission determination.
- Activate live access only in the explicitly isolated PoC environment using the approved two-product projection. Keep the committed default/catalog Commerce `enabled: false`, `endpoint: null`, and production/public Worker flags false. Set `amazonSupportApproved` only when the actual answers warrant it. Do not flip the production support gate to make Preview rendering work. This runbook edit changes no current runtime values.

### 2. Isolated resources and secrets (future only)

Use two dedicated **PoC** ordinary KV namespaces, never production namespaces. Private `COMMERCE_AUTH` stores tokens and cooldown; `COMMERCE_SNAPSHOTS` stores the short-lived normalized projection. No D1/R2/DO/Instant/history. Record IDs privately and double-check the target Cloudflare account/environment before each command.

```sh
# AFTER the PoC gates. Placeholder names are environment labels, not real IDs.
npx wrangler kv namespace create COMMERCE_AUTH_POC
npx wrangler kv namespace create COMMERCE_SNAPSHOTS_POC
```

Create a local PoC directory outside Git with restrictive permissions. Its `wrangler.toml` uses the reviewed Worker or the temporary counter wrapper below as `main`, absolute repo import paths, `workers_dev = false`, `preview_urls = false`, no routes, `crons = []`, and two `[[kv_namespaces]]` entries with `binding = "COMMERCE_AUTH"` / `"COMMERCE_SNAPSHOTS"`, their **PoC** IDs and `remote = true`. Set `CREDENTIAL_VERSION = "3.3"`, a fresh non-secret `TOKEN_ROTATION_EPOCH = "poc-<review-date>-1"`, `LIVE_API_ENABLED = "true"` only when authorized to start, and `COMMERCE_PUBLIC_ENABLED = "false"`. Run local dev with remote **bindings**, not `--local` (which disables remote bindings), and not `--remote`/Tunnel. Do not deploy this private config.

Owner enters `AMAZON_CLIENT_ID` / `AMAZON_CLIENT_SECRET` into a permission-restricted `.dev.vars` alongside that private config, outside Git; do not place values in a command argument, history, PR or chat. Future deployed Worker credentials must use Worker Secrets with those exact names. `wrangler secret put` deploys a version immediately: use it only for a separately authorized, disabled target, never against this current skeleton as a preparation step. Prefer version-secret staging if immediate activation is not approved. JP token host is `api.amazon.co.jp`, JSON LWA scope `creatorsapi::default`; do not reuse a US/v2 credential.

### 3. Controlled invocation and non-sensitive call counts

Use a temporary local-only entry outside Git to wrap the existing factory for accounting. Replace `<ABSOLUTE_REPO>` with the reviewed checkout path. This wrapper delegates all behavior and does not log request bodies, headers, token values, prices or upstream responses:

```js
import { createWorker } from '<ABSOLUTE_REPO>/workers/commerce-api/worker.js';
const counts = { token: 0, items: 0 };
const worker = createWorker({ fetcher: async (url, init) => {
  if (url === 'https://api.amazon.co.jp/auth/o2/token') counts.token++;
  else if (url === 'https://creatorsapi.amazon/catalog/v1/getItems') counts.items++;
  else throw new Error('unexpected outbound host');
  return fetch(url, init);
}});
export default {
  fetch: (request, env) => worker.fetch(request, env),
  async scheduled(event, env) {
    const before = { ...counts };
    const result = await worker.scheduled(event, env);
    console.info(JSON.stringify({ status: result.status,
      tokenCalls: counts.token - before.token, itemCalls: counts.items - before.items }));
    return result;
  },
};
```

```sh
# AFTER authorization; PRIVATE_POC_CONFIG points outside Git. No real Cron.
npx wrangler dev --config "$PRIVATE_POC_CONFIG" --test-scheduled --ip 127.0.0.1 --port 8787
# Run in a second terminal, once per controlled observation.
curl --fail http://127.0.0.1:8787/health
curl --fail -H 'Origin: https://apps.yzrswork.com' http://127.0.0.1:8787/v1/offers
curl --fail http://127.0.0.1:8787/cdn-cgi/local/scheduled
```

Use the scheduled test route printed/documented by the pinned Wrangler version (current docs use `/cdn-cgi/local/scheduled`; older versions used `/__scheduled`). Freeze that version and verify the local route before secrets/live enabling. Do not create a public HTTP route to invoke `scheduled`.

Expected cold successful update: **1 token + 1 GetItems** for the two-ASIN batch. A second controlled invocation before the token deadline: **0 token + 1 GetItems**. Restart the local isolate, retain the same private KV/epoch, allow ordinary-KV propagation, and repeat: same warm count. `/health` and `/v1/offers` each cause **0 Amazon calls**. Token reuse is conditional on token expiry/cooldown/KV propagation; KV is not a distributed lock. Stop on unexpected counts; do not induce real 429s to test retry. The existing injected tests verify races and throttling.

### 4. Smoke observations / stop conditions

| Observation | Expected / action |
|---|---|
| `/health` | 200 `{ "status": "ok" }`; liveness only, no claim of Amazon access, bindings or freshness |
| Private `/v1/offers` with Apps Origin | 200 `status: disabled`, empty `items`; public catalog/flag gate stays closed even after a private update |
| Wrong/no Origin, query ASIN, wrong method | 403 / 400 / 405 respectively; never an Amazon request |
| Successful private update | `status: updated`; only approved ASINs, ASIN join independent of response order; inspect sanitized snapshot privately, not Auth token output |
| Auth hit / miss | Cache reuse above; `expiresAt` starts at request start with the 60-second token buffer; rotate epoch only for authorized rotation, not to evade cooldown |
| Token 429 | Separate shared cooldown, honor Retry-After seconds/date or conservative fallback; no GetItems, no remint loop, no new snapshot deadline |
| GetItems 429 / 5xx | Same token, bounded retries within 60-second run budget; long Retry-After defers; no freshness extension on failure |
| OAuth / 403 / repeated TokenExpired | Stop; confirm eligibility/credentials/tag/marketplace privately. 403 attempts snapshot removal; do not fabricate fallback prices |
| ItemNotAccessible / omitted ASIN | Only Commerce becomes not-accessible; owned recommendation/ordinary approved link remains |
| Offer/price null, unavailable/MAP unknown | No safe offer; no SALE/old economics. Do not broaden safety rules merely to populate a card |
| Deal end / disappearance | End reached within observed freshness = expired; erase price/Savings/API URL. New response without Deal uses only its new economics |
| Freshness | Each item <60 minutes from request start, shorter at known Deal end; old/missing/corrupt KV = unavailable, never a refreshed timestamp |
| Later PUBLIC-gated endpoint | 200 `ok` with schema/revision/serverNow/minimal safe projection; 503 unavailable for missing/stale/corrupt KV; `no-store`, noindex, fixed Apps CORS. Verify only after the public gate, not during private PoC |

For private snapshot inspection use only `offers:v1:<catalogRevision>` in COMMERCE_SNAPSHOTS. Do not dump COMMERCE_AUTH into terminal recordings. Token accounting needs only count/expiry metadata, never accessToken. A no-offer result is a valid safe technical observation, not evidence that a product is on sale. Real OffersV2/JP error shapes and MAP/Prime conditions remain acceptance checks; fail closed if they differ.

### 5. End private PoC

Stop Wrangler; set local live flag false; restore the catalog live flag to the reviewed Pre-Live state if PoC activation is not retained by explicit approval. Keep no routes/Cron/public flag. Remove only the PoC snapshot keys as needed, retaining bounded auth expiry/cooldown for normal shutdown; revoke credentials/rotate epoch for compromise or suspension. Remove local secret files securely under Owner control. Record sanitized PASS/FAIL, counts, revision and timestamps; no token/raw PAC logs. Any failed safety/eligibility/terms check blocks cutover.

## Production cutover checklist — NOT AUTHORIZED / NOT EXECUTED

1. Close Amazon written-answer/disclaimer/registration gates, private live PoC, actual browser/device acceptance and Owner public-release approval. Approve an exact release SHA; review diff/checks/regression/rollback. Existing Draft PR #37 is not a deployment approval.
2. Prepare one reviewed final catalog/Worker/browser revision with `liveApiApproved: true`, `amazonSupportApproved: true`, a separately approved HTTPS endpoint and eventually `enabled: true`; build both projections together. Keep served Pages on the disabled revision while staging the Worker. Config changes affect revision/snapshot keys; do not copy older snapshots into the new key.
3. Only now create production COMMERCE_AUTH / COMMERCE_SNAPSHOTS and provision JP Worker Secrets. Confirm account/IDs are distinct from PoC, 3.3 and rotation epoch. Review the intended route, fixed Apps Origin, no-store/no PAC caching. Stage the approved Worker revision with both env flags false and Cron empty; `/health` alone is not acceptance.
4. After review, set Worker `LIVE_API_ENABLED: true`, `COMMERCE_PUBLIC_ENABLED: false`, then enable only `0 * * * *`. Confirm first scheduled update/call count and a fresh snapshot for this exact release revision privately. No visitor-triggered Amazon call. Keep price publication closed if no safe offers are present.
5. With valid snapshot and all Gates closed, enable Worker `COMMERCE_PUBLIC_ENABLED: true` and validate the read endpoint against that exact release revision. Then deploy matching Pages/browser projection. Each activation/deploy must retain reviewed bindings/Cron/flags; do not let an environment inherit a production namespace accidentally. Price display becomes possible only here.
6. Actual Safari/iPhone PWA checks: display/no-store/timestamp/disclosure, navigation, deadline, background/resume, airplane mode, old SW update, no price persisted offline. Simulate endpoint outage with mocks/controlled non-production interception; normal recommendations/search/affiliate links must survive. Root/kit/build/HDD/site remain functional.
7. `/deals/` noindex/sitemap/schema remain as reviewed unless a separate SEO/public-index instruction is approved. No Product/Offer markup added by this cutover runbook; no monitor Phase 1. Record final checks before closing the release.

## Rollback checklist

- Close public Worker flag first; close live flag and remove Cron; verify empty/disabled projection and zero subsequent scheduled Amazon calls. Retain owned cards/reasons and ordinary approved links.
- Disable catalog Commerce/endpoint and regenerate both projections; deployment is a separately authorized action. Bump mem SW version if static assets have been released. Old offline/open clients are bounded by original freshness, not instantly revoked.
- Remove only current snapshot keys from the correct namespace. Ordinary KV deletion/flag propagation is eventual; verify per-read expiry. Never claim an instant worldwide purge.
- Preserve Auth cooldown/token expiry for ordinary shutdown; rotate epoch/revoke compromised credentials if necessary. Never remove cooldown just to resume calls.
- Revert UI to the known reviewed checkpoint if needed; keep two product approvals only if Owner still intends them. TEAMGROUP remains pending. No reset/clean of uncommitted work.
- Rerun build/check/tests, disabled-state smoke, mem base/approved ordinary links, root/kit/build/HDD/site and real-device SW update. Log sanitized outcome and stop before any reactivation.

Official operational references (recheck at execution and pin Wrangler): [KV setup](https://developers.cloudflare.com/kv/get-started/), [KV CLI](https://developers.cloudflare.com/workers/wrangler/commands/kv/), [Workers CLI / scheduled dev / secrets](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/). These document Cloudflare operations, not Amazon permission. No command in this runbook was executed during Phase 0.5.

Stop after Pre-Live review. Monitor Phase 1 and any live/public activation require their remaining Owner/Amazon gates.
