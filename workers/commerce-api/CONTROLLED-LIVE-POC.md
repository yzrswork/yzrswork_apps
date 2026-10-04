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

## Windows引き継ぎ実行記録 — 2026-10-04

- 開始時の実装HEAD／remote branch／PR headは `427105dac98b9ff2f25f50d966ac199b1c8c5320`、mainは `5642f7bb1ca9cecee0f1cd1c9ac4fe9d26695888`。Draft OPEN／未マージ、CI成功。既存ローカルcheckoutは変更なしのmain `b8d9d01` だったため、同じ既存実装ブランチへ安全に切り替えた。
- Wrangler 4.119.0で指定account／yzrswork@gmail.com／承認済み5 scopeを再確認。以前のクラウド環境の認証失敗は今回の状態と区別する。scope追加／再login／認証ファイル秘密値の閲覧は行っていない。
- namespace一覧にPoCの同名資源はなかった。今回、専用Auth／Snapshots KV 2件と `yzrs-deals-poc-20261004` を新規作成。対象外の既存Worker／KVは変更していない。実IDと資源記録はローカル引き継ぎ成果物に保存し、committed production configには入れない。
- PoC Workerはworkers.dev／Preview URL／routeなし、Cron空、observability無効、live／display／public／prerequisites=false。localhost gatewayからremote Service Bindingでhealth／disabled readを確認できた。別Originとブラウザー由来のmanual invokeは403。health／readはAmazonを呼ばない。
- 現在はAmazon Secret名一覧が空で、healthのcredentialsPresent=false。Ownerへ専用WorkerのSecret UI入力と、version 3.3／JP・partnerTagの利用資格／実商品型番・16GB×2構成確認を依頼済み。秘密値の入力や前提確認を推測で代替しない。
- **Live PoCは未実行**。実Amazon token requests=0、GetItems requests=0。Offer／Deal／Savingsの実応答、live token reuse／KV伝播／freshnessは未検証。
- 既存snapshot正規化／readを共通化し、公開Guardとは分離した専用PoC entryを追加。固定2件のtuple Guard、Service Binding専用アクセス、localhostのmanual key、query／body拒否、PoC 1 attempt、件数／field型／token期限の機密を含まない観測を実装。公開本番Gateは維持する。
- HTTP 429／403の非JSON error bodyでも、shared cooldown／snapshot失効処理に到達するよう修正。token値やupstream messageを公開しない。
- ローカルtests **90/90 PASS**、build更新0件、check／regression／diff check PASS。Product Masterと両projectionのrevisionは `a0f296a53a66a9e07fa771c11279c4cd79ce487bae30c403dd5aa36f6d7751b3` のまま。approved 2／pending 1、本番無効。MEM SWは共有client変更を受けてapp.jsonからv14を再生成。
- localhostの架空応答で、Chromium／Playwright WebKitの1348・375・320pxを確認。DEALSの仕様・理由優先／Savings basis／JST時刻／開示、MEMのDDR4・DDR5×3用途、web除外、offlineで価格消去・通常CTA維持・online再取得、PACをbrowser storage／SWへ保存しないことを確認。実Amazonデータを使った画面確認とは区別する。WebKitでSW制御後にroute interceptionが通らなかったため、mock serverへ切り替えて再検証した。
- 実iPhone SE3／Safari／インストール済みPWA／VoiceOver／旧SWからの更新／実端末BFCache・背景復帰はOwner manual checkとして残る。
- 再開手順と終了時無効化は [README.md](README.md) の現行Windows手順を使う。Secrets／利用資格／実商品照合が整うまでAmazonを呼ばない。production公開／monitor Phase 1／Draft解除／mergeには進まない。
