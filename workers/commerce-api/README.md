# YZRS Commerce — Phase 0.5 Pre-Live

Authority: Owner-approved **YZRS DEALS / Amazon Creators API Architecture / Implementation Brief — Final Candidate** and the current `site/catalog.json`. This directory is a generated-allowlist consumer, not another Product Master.

## Owner decision update — 2026-10-04

OG-5 is now a **production publication blocker**, not a development/controlled live PoC blocker. Owner authorized controlled live JP Creators API use for **B0C29R9LNL + B0CT9BMGLF only**, Secrets configuration on a development Worker, development/preview KV bindings, manual invocation, live response/token-reuse/freshness checks and Preview Commerce display. TEAMGROUP remains pending. Amazon support answers are still outstanding; this decision is not an Amazon permission or terms determination.

Production Worker routes, continuously running production Cron, a production public Commerce endpoint, Amazon price/Deal display on `apps.yzrswork.com`, monitor Phase 1 production and PR #37 merge remain prohibited. Keep the committed production/default config disabled. Do not set `amazonSupportApproved: true` merely to unlock a PoC. Preview display needs explicit isolation from the production publication guard, restricted access and a bounded test session; CORS/noindex alone do not make a preview private.

The 2026-10-02 Pre-Live acceptance is historical. Its Amazon-answer prerequisite for the private PoC is superseded by this decision; production prerequisites remain. Read [CONTROLLED-LIVE-POC.md](CONTROLLED-LIVE-POC.md) for the approved scope, prerequisites and evidence checklist. Authorization does not imply that any live request has already run.

## Current release gates

Production/default: no route, active Cron, real KV namespace IDs or Secrets are configured. Dedicated PoC resources are tracked separately below. `LIVE_API_ENABLED` and `COMMERCE_PUBLIC_ENABLED` are false. Catalog `liveApiApproved`, `amazonSupportApproved` and `enabled` are false; endpoint is null. Owner approved exactly two products on 2026-10-02: Crucial CP2K16G4DFRA32A / B0C29R9LNL and CP2K16G60C48U5 / B0CT9BMGLF, enabled for mem/deals and game/creative/ai, with specification evidence only. TEAMGROUP mem-team-ddr4-32 remains pending/disabled. Both generated allowlists contain the two approved products, but approval never enables Amazon access or price publication. Fixtures are fabricated and used only with injected HTTP/KV/clock implementations.

Do not deploy this skeleton, populate production bindings, call Amazon with pending ASINs or enable monitor Phase 1. Any further product or changed model/configuration/ASIN/reason/evidence needs an individual Owner approval. Amazon must answer the applicable site-purpose, mobile/PWA, display-JSON and content/disclaimer questions before production Commerce publication. The original Brief contains the support inquiry; this implementation has not sent it.

## Boundaries

- `site/catalog.json` → `scripts/commerce-catalog.mjs` validation → build-generated browser/Worker projections with the same revision. Edit the catalog, not generated files.
- Production `scheduled` is the only production Amazon path; the isolated PoC uses its private service-bound manual entry. Read-only `GET /v1/offers` reads `COMMERCE_SNAPSHOTS`; no arbitrary ASIN/filter/refresh query or visitor-triggered OAuth/GetItems.
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

## Controlled live PoC — Windows 実行経路（2026-10-04）

現行の手順は以下です。以前のローカルAmazon credentials／一時counter wrapper案を置き換えます。productionの既定設定、公開Gate、Product Masterは変更しません。実行状況は [CONTROLLED-LIVE-POC.md](CONTROLLED-LIVE-POC.md) を参照してください。

1. 指定accountで `whoami` と現在の資源・PR HEADを確認します。同名の由来不明Worker／KVを再利用しません。専用Worker名は `yzrs-deals-poc-20261004`、KVは専用のAuth／Snapshotsだけです。
2. `poc-wrangler.example.toml` をGit外へコピーし、mainを `poc-worker.js` の絶対パスにします。今回作成したKVだけを `COMMERCE_AUTH`／`COMMERCE_SNAPSHOTS` にbindingします。workers.dev／Preview URL／routeを設けず、Cron空、observability無効、live／display／public／prerequisites無効でdeployします。通常の `wrangler.toml`／`worker.js` はdeployしません。
3. OwnerがCloudflareの専用Worker設定画面でSecret型の `AMAZON_CLIENT_ID`／`AMAZON_CLIENT_SECRET` を直接設定します。秘密値はチャット、CLI引数、履歴、Git、ログ、ローカルファイルへコピーしません。3.3、JP、partnerTag、利用資格、現在の商品型番／16GB×2との一致を、秘密値を含めず確認します。
4. `poc-gateway.example.toml` をGit外へコピーします。これは**deploy禁止のlocalhost専用gateway**です。remote Service Bindingが、公開URLのない専用Workerへ接続します。Amazon Secretは開発Worker内に留まります。固定Wrangler 4.119.0のローカルworkerdは2026-08-08までに対応するため、gatewayだけこの互換日付を使います。CloudflareへdeployしたPoC Workerは2026-10-04です。
5. gateway用のランダムな `POC_MANUAL_KEY` だけを、Git外・Owner限定アクセスの `.dev.vars` に置きます。これはAmazon／Cloudflare credentialではありません。gatewayは `wrangler dev --ip 127.0.0.1 --port 8787` で起動します。`--remote`、Tunnel、公開scheduledテスト経路を使いません。
6. remote Workerのhealthと `secret list`（名前だけ）で入力完了を確認します。前提確認後に専用configだけlive／prerequisitesを有効化します。Catalogやsupport/public Gateを偽装しません。
7. 手動制御用のローカルprocessが、secret keyをメモリー内で読み、空bodyの `POST /poc/invoke` に付けます。keyをコマンド引数・履歴・出力に入れません。ブラウザーOrigin／Sec-Fetch、任意query／bodyを拒否します。Previewサーバーにはinvoke経路がありません。
8. cold成功はtoken 1＋GetItems 1、warm成功はtoken 0＋GetItems 1を実測します。PoCのGetItemsは**1 attemptのみ**です。予想外の応答・失敗・403・429で止め、意図的な再試行や実429生成をしません。既存clientの通常retry／shared cooldownはmockで別途確認します。
9. sequential実行だけです。通常KVはeventual consistencyで、isolateのsingle-flight／停止latchはglobal lockではありません。warm確認と新しい専用Worker versionでの再確認は、通常KVの伝播とtoken deadlineを考慮します。新versionは新しいfactoryを作りますが、特定edge isolateのcold起動は保証できません。厳密な実測が成立しなければ未検証と記録します。
10. 観測結果にはHTTP status、件数、tokenの取得／期限時刻、承認済みkey別のfield型だけを含めます。upstream body、token値、credentials、実PACをGit／PR／ログへ入れません。Auth KVをdumpしません。Offer／Deal／Savingsは短寿命の正規化snapshotを私的に読み、必要な状態だけ記録します。
11. 表示確認は `node scripts/commerce-poc-preview.mjs --display` の `http://127.0.0.1:8790` です。remote側の `POC_DISPLAY_ENABLED` が必要です。Host／Origin／Sec-Fetchを検証し、readをlocalhost gateway経由でproxyします。ブラウザーにAmazon credentialもrefresh権限も渡しません。公開Pagesにはこのentryを挿入しません。通常起動はdisplay無効です。
12. 終了時は専用remote configのlive／display／prerequisitesをfalseでdeployし、healthで確認します。gateway／Previewを停止します。publicは常にfalse、Cron空、公開URL／routeなし。通常停止ではAuth token／cooldownを消しません。短寿命snapshotは期限で失効し、必要な場合だけ専用namespaceの該当keyを削除します。削除対象は今回作成したことを確認できる資源だけです。OAuth権限の縮小／失効はOwnerの別作業への影響を確認する提案に留めます。

公式一次資料（2026-10-04再確認）: [Amazon 3.3/LWA/GetItems](https://affiliate.amazon.co.jp/creatorsapi/docs/en-us/get-started/using-curl)、[OffersV2](https://affiliate.amazon.co.jp/creatorsapi/docs/en-us/api-reference/resources/offersV2)、[Cloudflare Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)、[remote bindings](https://developers.cloudflare.com/workers/local-development/)、[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。これらはアカウントの利用資格や未解決のAmazon用途許可を証明するものではありません。

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

Official operational references (recheck at execution and pin Wrangler): [KV setup](https://developers.cloudflare.com/kv/get-started/), [KV CLI](https://developers.cloudflare.com/workers/wrangler/commands/kv/), [Workers CLI / scheduled dev / secrets](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/). These document Cloudflare operations, not Amazon permission. The Phase 0.5 history predates the Windows dedicated-resource setup; current measured status is in CONTROLLED-LIVE-POC.md.

Stop after Pre-Live review. Monitor Phase 1 and any live/public activation require their remaining Owner/Amazon gates.
