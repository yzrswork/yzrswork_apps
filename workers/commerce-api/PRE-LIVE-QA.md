# Phase 0.5 Pre-Live acceptance record — 2026-10-02

Scope: Draft PR #37, static approved-product integration and fabricated Commerce tests only. This is not Amazon permission, live-PoC execution, production cutover or merge approval.

## Reviewed source and Preview

- Base main: `5642f7bb1ca9cecee0f1cd1c9ac4fe9d26695888`.
- Implementation commit: `c5d6789dcb15b3621b9b509fd486613cf11adbea`; subsequent acceptance-record commit changes documentation only.
- Cloudflare Pages deployed this implementation successfully: <https://5a8838cc.yzrswork-apps.pages.dev/deals/> and <https://5a8838cc.yzrswork-apps.pages.dev/mem/> were opened and inspected in the cloud Chrome browser.
- Local tests and PR-merge-ref GitHub Verify Build: **79/79 passed**; build, generated-output check and repository check passed. Regression compares the PR merge ref with fetched `origin/main`, not a previous implementation checkpoint.
- Approved projections are exactly Crucial `mem-crucial-ddr4-32` / CP2K16G4DFRA32A / B0C29R9LNL and `mem-crucial-ddr5-32` / CP2K16G60C48U5 / B0CT9BMGLF. Both are enabled, reviewed 2026-10-02, specification evidence only, mem/deals, game/creative/ai. `mem-team-ddr4-32` remains pending/disabled and absent from both product projections.
- Zero real Amazon Creators API requests or credential/resource configuration were performed. Ordinary Amazon link destinations were inspected without opening them; this verifies URL construction, not the current Amazon variation or destination-page response.
- Worker routes/Cron/KV bindings are absent; live/public flags are false. Catalog Commerce flags are false and endpoint is null. API/auth/normalization/state logic and Wrangler config were not changed in Phase 0.5.

## Observed Preview results

| Area | Result / evidence |
|---|---|
| DEALS static products | Exactly two Crucial cards; TEAMGROUP absent. Trust label, specification limitations, recommendation reason and conditions precede the hidden Commerce slot. No price, discount or SALE claim. |
| DEALS metadata | DOM has `noindex, follow`, Apps canonical and CollectionPage only. Generated source tests confirm sitemap exclusion and no Product/Offer/WebApplication schema. |
| DEALS desktop | Editorial list at 1348 CSS-pixel viewport; document has no horizontal overflow. Long Japanese product names wrap; screenshot inspection found no text/CTA overlap. |
| MEM six matching flows | AM4 DDR4 and AM5 DDR5, each with game/creative/ai, display only the matching Crucial after explicit candidate acceptance. Product URL has the expected ASIN and `yzrs_apps-22` tag. |
| MEM negative flows | Before acceptance no product link; switching use/socket resets acceptance. Web shows no 32GB product. Unknown DDR and LGA1700 before DDR choice show neither product nor purchase search. |
| MEM DDR mismatch | LGA1700 DDR4 and DDR5 choices each produce only the matching product; changing DDR resets acceptance. |
| MEM layout / controls | At 1348 CSS pixels, no horizontal overflow or candidate text/CTA intersection. Product CTA is 44px high; DDR controls 44px and socket/use buttons 49px. |
| Keyboard / navigation | Tab reaches the next DDR button with a visible native outline; buttons expose pressed state. Descriptive product-link names include new-tab behavior. Privacy navigation renders the existing policy. |
| Optional Commerce failure / offline | Injected client/VM/Service Worker tests pass, including disabled approved configuration causing zero fetches and offline price clearing. These are automated mocks, not actual offline/BFCache device observations. |

No new UI defect was found in the available desktop Preview. Browser-extension console errors were observed; they are not the page's Commerce script. This was a targeted accessibility review, not a full screen-reader or WCAG audit.

## Mobile and Safari limits — Owner manual check required

The available browser exposes Chrome only, with no viewport/emulation control. No Safari/WebKit executable was available. Real mobile-width, Safari and installed iPhone PWA rendering therefore remain **unverified**, not PASS. Source inspection confirms one-column DEALS cards, wrapping rules and a <=600px MEM rule stacking candidate text above the CTA, but CSS inspection is not a mobile rendering test.

Use the Preview links above on an actual iPhone (including iPhone SE-sized 375px width) and, if available, desktop Safari:

1. DEALS: two cards only; one column at 320/375/390px, landscape and 200% text size; no horizontal scrolling, clipped Japanese model names or CTA/body overlap. Confirm the specification trust label and reason dominate the disabled-price message.
2. MEM: repeat DDR4/DDR5 × game/creative/ai; accept explicitly and verify matching product only. Switch use/DDR and confirm the candidate disappears until acceptance. Web and unknown DDR must not expose these 32GB products.
3. Check tap targets, focus order, VoiceOver names/pressed state, new-tab disclosure, normal Amazon links and return navigation. Before any live PoC, independently confirm Amazon's actual model/16GB×2 variation matches the approved ASIN; do not infer it from generated URLs.
4. Visit MEM online, then airplane mode/reload: static navigation and recommendations should still work after the Service Worker is installed, with no price or discount retained. Reconnect, background/resume and back/forward navigation must still show disabled Commerce. DEALS itself has no offline PWA guarantee.
5. Installed Home Screen MEM: standalone safe-area/rotation, update from the previous SW, background/resume and BFCache. Actual offline clearing of previously live prices must be repeated only after the separately authorized controlled non-production/live acceptance stage; Phase 0.5 contains no real price to clear.
6. After the Amazon/public Gates, separately verify real endpoint no-store/CORS/freshness/expiry and device lifecycle against the reviewed release. Current mocks cannot certify those deployed properties.

## Remaining gates and rollback

- Amazon written answers: site purpose, mobile/responsive/PWA, first-party display JSON/content redistribution/caching and required disclosure/registration. Owner must separately authorize controlled live PoC after eligibility/JP 3.3 confirmation.
- Complete the device acceptance above before production cutover; close real response/KV/token-reuse/freshness acceptance during the future private PoC.
- TEAMGROUP needs individual approval; monitor Phase 1, public price display, production resources/routes/Cron and merge remain outside this authorization. Draft stays open.
- Future operations, activation order, smoke expectations and rollback are in [README.md](README.md). No listed live command has been executed.
- Current static rollback: revert the Phase 0.5 implementation/documentation commits after review, regenerate, rerun tests/build/check, retain disabled production flags and the Phase 0 checkpoint. If static assets are later released, bump MEM's SW version during rollback. No new DB, Product Authority or price history exists to recover.
