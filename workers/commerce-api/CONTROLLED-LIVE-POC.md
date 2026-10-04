# Controlled live PoC — Owner authorization 2026-10-04

## Authority and hard boundary

Owner changed OG-5 to a production-publication blocker. Development/preview PoC is authorized before a support reply. This is a project decision, not a finding that Amazon permits the unresolved site/mobile/PWA/display-JSON uses.

Only these products may be queried:

| Product key | Model / configuration | ASIN |
|---|---|---|
| mem-crucial-ddr4-32 | CP2K16G4DFRA32A, DDR4, 32GB (16GBx2) | B0C29R9LNL |
| mem-crucial-ddr5-32 | CP2K16G60C48U5, DDR5, 32GB (16GBx2) | B0CT9BMGLF |

TEAMGROUP remains pending/disabled. No SearchItems, unapproved/inaccessible test ASINs, monitor or automatic discovery. Do not change the source approvals or add a Product Authority, database or history.

Production route, continuously running production Cron, production public endpoint, production Apps price/Deal display and PR merge remain prohibited. Manual invocation must be restricted to the development environment and must not be a public refresh URL. Keep the production defaults disabled and `amazonSupportApproved: false` until the written-answer Gate is closed.

## Prerequisites before any request

1. Reconfirm latest main, PR head, generated revision and exact two-ASIN set; tests/build/check/regression pass. Keep the existing implementation branch and Draft PR.
2. Confirm the authorized Cloudflare account and a distinct development Worker/environment. Use distinct COMMERCE_AUTH and COMMERCE_SNAPSHOTS KV namespaces, never production bindings; no active Cron, custom production domain or production route.
3. Owner supplies JP credential version 3.3 and confirms marketplace/associate-tag eligibility and model/16GBx2 variation. Store AMAZON_CLIENT_ID / AMAZON_CLIENT_SECRET as development Worker Secrets, never in Git, PR, chat, command arguments or browser-visible code. Secret values need a secure input path; none are included in this document.
4. Set a development TOKEN_ROTATION_EPOCH; retain 60-second token safety buffer/shared cooldown. Any live enabling is scoped to this environment. The committed production/default config stays false.
5. Before Preview price rendering, implement/review an isolated development-only read path and matching browser projection, with restricted access, exact Preview host, no-store/noindex and no PAC caching. Do not weaken the production `amazonSupportApproved` guard. Existing production-only CORS does not yet authorize a Preview origin, and existing disabled endpoint is not a completed live Preview implementation.

## Minimal observations and evidence

- First manual invocation: one batch containing the two approved ASINs. On a cold successful run expect one token request and one GetItems request. Record sanitized status, API/resource version, request-start timestamp, ASIN join and presence/types of Offer/price/availability/Deal/Savings fields, not full responses or tokens in Git/PR/chat.
- Second controlled invocation before token expiry: expect zero token requests and one GetItems request. Verify shared reuse after a cold isolate only after ordinary KV propagation and within token validity. Counts are measured, not inferred from a displayed price.
- Health/read requests must cause zero Amazon calls. No automatic Cron polling or repeated browser requests to Amazon. Stop after the required bounded observations; stop immediately on 403/eligibility/credential mismatch or unexpected call counts.
- For 429 handling, record an actual 429 only if naturally encountered. Never hammer the real token/GetItems endpoints to manufacture one. Use injected existing mocks to verify token cooldown/Retry-After and GetItems retry without reminting; report this as mock verification when a real 429 was not observed.
- price null / ItemNotAccessible / absent Offer / absent Deal are not guaranteed to occur for these two ASINs. Inspect whichever live states arrive and retain mock evidence for missing states. Never query a pending product or fabricate an upstream result and describe it as live.
- Verify fetchedAt from request start, <60-minute freshness, known Deal end shortening expiry, no old price/Savings reused on expired/stale/null responses. Keep static reasons/normal affiliate links when Commerce cannot display safely.
- Preview: specification Trust Signal/reason before live price, required timestamp/disclosure/Prime conditions, explicit Savings basis; valid SALE Gate only, no discount ranking/lowest-price/coupon inference. API read failures/offline must hide price and keep owned navigation. Desktop/mobile/Safari evidence must be identified separately.

## End of session / report

Disable development live/display flags, keep Cron empty, stop manual invocation and confirm the end state. Clear only the scoped development snapshots as appropriate; normal shutdown preserves bounded auth expiry/cooldown. Never log or dump Auth KV. Do not deploy production or merge.

Report observed live request counts, response shape and normalized outcomes, token reuse, snapshot bounds, Preview behavior, required presentation changes and all remaining unobserved/mocked states. Keep site-purpose/mobile/PWA/display JSON/redistribution/cache/disclosure questions explicitly unresolved for production. Use [README.md](README.md) for bounded retry and future rollback/cutover details; the production checklist is not execution authorization.

## Start-of-attempt status — 2026-10-04

- Local/remote PR head: d6a840e5535c2876e5c3706d6cbe5ee0bcbc855b; main: 5642f7bb1ca9cecee0f1cd1c9ac4fe9d26695888. Draft open/unmerged; starting tree clean.
- Execution environment has no configured Cloudflare API authentication, Wrangler OAuth file or Amazon client credentials. No Cloudflare connector is available. Cloudflare dashboard currently shows the login page with a verification error.
- A requested login-page reload was rejected by automatic approval review because authentication guidance forbids reload retries after a verification error. No workaround or credential entry was attempted.
- **Live PoC not executed**: zero live Amazon calls, no resource creation, Secrets/binding change, deployment or public/display flag activation. Authentication and safe Secrets input are prerequisites, not another request to approve the already authorized PoC.

Replace this attempt status with measured results only after the actual controlled PoC; do not mark an authorization or mock result as live success.
