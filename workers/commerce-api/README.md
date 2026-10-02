# YZRS Commerce — Phase 0 mock skeleton

Authority: Owner-approved **YZRS DEALS / Amazon Creators API Architecture / Implementation Brief — Final Candidate** and the current `site/catalog.json`. This directory is a generated-allowlist consumer, not another Product Master.

## Current release gates

No route, active Cron, real KV namespace IDs or Secrets are configured. `LIVE_API_ENABLED` and `COMMERCE_PUBLIC_ENABLED` are false. Catalog `liveApiApproved`, `amazonSupportApproved` and `enabled` are false; the generated approved/enabled ASIN allowlist is empty. The three existing mem products remain pending. Fixtures are fabricated and used only with injected HTTP/KV/clock implementations.

Do not deploy this skeleton, populate production bindings, call Amazon with pending ASINs or enable monitor Phase 1. Owner must individually approve each product's exact model/configuration/ASIN/reason/evidence. Amazon must answer the applicable site-purpose, mobile/PWA, display-JSON and content/disclaimer questions before production Commerce publication. The original Brief contains the support inquiry; this implementation has not sent it.

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

Current Phase 0 has no production cutover: retain disabled flags, empty Cron/routes/bindings and pending product approvals. Preserve the implementation branch/checkpoint when reviewing changes; do not reset/clean an uncommitted recovery tree.

For a later explicitly approved activation:

1. Disable Worker public and live flags and remove the approved Cron trigger. Return no Commerce projection; static nav/reasons/approved ordinary links remain independent.
2. Remove current `offers:v1:<revision>` snapshot keys. Readers still reject expired/revision-mismatched cached values; ordinary KV deletion is not an instant global purge.
3. Set catalog Commerce `enabled: false`/endpoint null, regenerate, and bump mem's SW version so the static disabled configuration is picked up. Restore or revert the known reviewed UI commit if needed. Already open pages may retain a previously valid projection only until its original bounded deadline; do not promise instant revocation across eventual KV/offline clients.
4. Keep Auth cooldown/short token expiry for a normal UI shutdown. For credential compromise/rotation or Amazon suspension, rotate the epoch, remove affected private Auth entries and revoke credentials as appropriate; do not clear a 429 cooldown to force reminting.
5. Re-run build/check/tests and confirm mem/kit/build/HDD and site entry points continue to work without Commerce. No new DB/Authority or history recovery is needed.

Stop after Phase 0 review. Monitor Phase 1 and any production activation require their remaining Owner/Amazon gates.
