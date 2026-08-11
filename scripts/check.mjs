#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NORMALIZED_ROOT = normalize(ROOT);
const catalog = JSON.parse(readFileSync(join(ROOT, 'site', 'catalog.json'), 'utf8'));
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(path) {
  return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
}

function listRootDirsWith(fileName) {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, fileName)))
    .map((entry) => entry.name)
    .sort();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function staticHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function tags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : null;
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function localTargetExists(fromFile, reference) {
  if (
    !reference ||
    reference.startsWith('#') ||
    /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference) ||
    reference.includes('${')
  ) {
    return true;
  }
  const withoutQuery = reference.split(/[?#]/, 1)[0];
  if (!withoutQuery) return true;
  const target = withoutQuery.startsWith('/')
    ? resolve(ROOT, `.${withoutQuery}`)
    : resolve(dirname(fromFile), withoutQuery);
  const normalized = normalize(target);
  if (normalized !== NORMALIZED_ROOT && !normalized.startsWith(`${NORMALIZED_ROOT}${sep}`)) return false;
  return existsSync(normalized) || existsSync(join(normalized, 'index.html'));
}

function assertUnique(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) fail(`${label} が重複: ${item}`);
    seen.add(item);
  }
}

if (catalog.schemaVersion !== 1) {
  fail(`未対応のcatalog schemaVersion: ${catalog.schemaVersion}`);
}

if (!catalog.site.baseUrl.endsWith('/')) {
  fail('site.baseUrl は / で終える');
}

const categoryIds = catalog.categories.map((category) => category.id);
const appSlugs = catalog.apps.map((app) => app.slug);
const pageSlugs = catalog.pages.map((page) => page.slug);
const retiredSlugs = catalog.retiredApps.map((app) => app.slug);
const allSlugs = [...appSlugs, ...pageSlugs, ...retiredSlugs];
const affiliate = catalog.site.affiliate;
const adsense = catalog.site.adsense;
const expectedAffiliateDisclosure =
  'Amazonのアソシエイトとして、や印工務店は適格販売により収入を得ています。';
const expectedAdsenseMeta = `<meta name="google-adsense-account" content="${adsense?.client}"`;
const expectedAdsenseScript =
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense?.client}`;

assertUnique(categoryIds, 'category.id');
assertUnique(allSlugs, 'slug');

if (
  affiliate?.program !== 'amazon-jp' ||
  !/^[a-z0-9][a-z0-9_-]{0,61}-\d{2}$/i.test(affiliate?.associateTag || '') ||
  affiliate?.disclosure !== expectedAffiliateDisclosure
) {
  fail('site.affiliate がAmazon Japanの開示設定と一致しない');
}

const affiliateProducts = affiliate?.products;
if (!affiliateProducts || typeof affiliateProducts !== 'object' || Array.isArray(affiliateProducts)) {
  fail('site.affiliate.products がない');
} else {
  for (const [key, product] of Object.entries(affiliateProducts)) {
    if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(key)) {
      fail(`affiliate product keyが不正: ${key}`);
    }
    if (!['product', 'search'].includes(product.kind)) {
      fail(`affiliate product kindが不正: ${key}`);
    }
    if (!['pending', 'approved', 'rejected'].includes(product.ownerReview)) {
      fail(`affiliate product ownerReviewが不正: ${key}`);
    }
    if (product.kind === 'product') {
      if (!/^[A-Z0-9]{10}$/.test(product.asin || '')) {
        fail(`affiliate product ASINが不正: ${key}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(product.lastVerified || '')) {
        fail(`affiliate product lastVerifiedが不正: ${key}`);
      }
      if (!/^https:\/\//.test(product.sourceUrl || '')) {
        fail(`affiliate product sourceUrlはHTTPS必須: ${key}`);
      }
    } else if (typeof product.query !== 'string' || !product.query.trim()) {
      fail(`affiliate search queryがない: ${key}`);
    }
  }
}

const validQualityStatuses = new Set(['READY', 'IMPROVE', 'OWNER_CONTENT_REQUIRED', 'REVIEW_REQUIRED', 'NOINDEX_CANDIDATE']);
for (const app of catalog.apps) {
  const quality = app.quality;
  if (!quality || !validQualityStatuses.has(quality.primaryStatus)) {
    fail(`quality.primaryStatusが不正: ${app.slug}`);
    continue;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quality.reviewedAt || '')) {
    fail(`quality.reviewedAtが不正: ${app.slug}`);
  }
  for (const flag of quality.flags || []) {
    if (!validQualityStatuses.has(flag)) fail(`quality.flagsが不正: ${app.slug} -> ${flag}`);
  }
  if ((quality.flags || []).includes('NOINDEX_CANDIDATE') && app.managed) {
    const configPath = join(ROOT, app.slug, 'app.json');
    const config = existsSync(configPath) ? JSON.parse(read(configPath)) : null;
    if (config?.robots) fail(`NOINDEX_CANDIDATEを自動適用している: ${app.slug}`);
  }
}

if (
  !/^ca-pub-\d+$/.test(adsense?.client || '') ||
  adsense?.publisherId !== adsense.client.replace(/^ca-/, '') ||
  !/^[0-9a-f]{16}$/.test(adsense?.certificationAuthorityId || '')
) {
  fail('site.adsense のID形式またはclientとpublisherIdの対応が不正');
}

for (const app of catalog.apps) {
  const dir = join(ROOT, app.slug);
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) {
    fail(`公開アプリのindex.htmlがない: ${app.slug}`);
  }
  if (app.category !== null && !categoryIds.includes(app.category)) {
    fail(`未定義カテゴリ: ${app.slug} -> ${app.category}`);
  }
  if (!Array.isArray(app.related) || app.related.length < 2 || app.related.length > 3) {
    fail(`related は公開アプリを2〜3件指定する: ${app.slug}`);
  } else {
    if (new Set(app.related).size !== app.related.length) {
      fail(`related が重複: ${app.slug}`);
    }
    for (const relatedSlug of app.related) {
      if (!appSlugs.includes(relatedSlug)) {
        fail(`related が未登録アプリを参照: ${app.slug} -> ${relatedSlug}`);
      }
      if (relatedSlug === app.slug) {
        fail(`related が自分自身を参照: ${app.slug}`);
      }
    }
  }
  if (
    app.sourceNote &&
    (typeof app.sourceNote.label !== 'string' ||
      !app.sourceNote.label.trim() ||
      !/^https:\/\/note\.com\/yzrswork\//.test(app.sourceNote.url || ''))
  ) {
    fail(`sourceNote はラベルとや印工務店noteのHTTPS URLを指定する: ${app.slug}`);
  }

  if (existsSync(indexPath)) {
    const html = read(indexPath);
    if (!html.includes(expectedAdsenseMeta) || !html.includes(expectedAdsenseScript)) {
      fail(`AdSense確認コードがない: ${app.slug}`);
    }
    for (const relatedSlug of app.related || []) {
      const expectedLink = `href="../${relatedSlug}/" data-related-slug="${relatedSlug}"`;
      if (!html.includes(expectedLink)) {
        fail(`生成済み関連リンクがない: ${app.slug} -> ${relatedSlug}`);
      }
    }
    if (/amazon\.co\.jp|yzrsAffiliate/.test(html)) {
      if (!html.includes(expectedAffiliateDisclosure)) {
        fail(`Amazon開示文がcatalogと一致しない: ${app.slug}`);
      }
      if (!html.includes('href="../privacy/"')) {
        fail(`アフィリエイト利用ページにprivacyリンクがない: ${app.slug}`);
      }
    }
  }

  const configPath = join(dir, 'app.json');
  if (app.managed) {
    if (!existsSync(configPath)) {
      fail(`managedアプリのapp.jsonがない: ${app.slug}`);
      continue;
    }
    const config = JSON.parse(read(configPath));
    const expectedCanonical = `${catalog.site.baseUrl}${app.slug}/`;
    if (config.canonical !== expectedCanonical) {
      fail(`canonical不一致: ${app.slug} (${config.canonical} != ${expectedCanonical})`);
    }
    for (const asset of config.assets || []) {
      if (/^https?:/.test(asset)) continue;
      const assetPath = normalize(resolve(dir, asset));
      if (assetPath !== NORMALIZED_ROOT && !assetPath.startsWith(`${NORMALIZED_ROOT}${sep}`)) {
        fail(`リポジトリ外を参照するasset: ${app.slug} -> ${asset}`);
      } else if (!existsSync(assetPath)) {
        fail(`存在しないasset: ${app.slug} -> ${asset}`);
      }
    }
    if (config.hasServiceWorker) {
      const swPath = join(dir, 'sw.js');
      const swSource = existsSync(swPath) ? read(swPath) : '';
      if (!swSource.includes(`const CACHE_PREFIX = '${app.slug}-';`)) {
        fail(`生成SWのCACHE_PREFIXがslugと不一致: ${app.slug}`);
      }
    }
  } else if (existsSync(configPath)) {
    fail(`catalog-onlyアプリにapp.jsonがある: ${app.slug}`);
  }
}

for (const page of catalog.pages) {
  if (!existsSync(join(ROOT, page.slug, 'index.html'))) {
    fail(`公開ページのindex.htmlがない: ${page.slug}`);
  }
}

// --- 公開HTML・metadata・構造化データ・基本アクセシビリティ ---
const publicHtmlFiles = [
  { slug: 'root', path: join(ROOT, 'index.html'), kind: 'root' },
  ...catalog.apps.map((app) => ({ slug: app.slug, path: join(ROOT, app.slug, 'index.html'), kind: 'app', app })),
  ...catalog.pages.map((page) => ({ slug: page.slug, path: join(ROOT, page.slug, 'index.html'), kind: 'page' })),
];

for (const entry of publicHtmlFiles) {
  if (!existsSync(entry.path)) continue;
  const html = read(entry.path);
  const visible = staticHtml(html);
  const label = entry.slug;

  if (!/<html\b[^>]*\blang=["']ja["']/i.test(visible)) fail(`html lang=jaがない: ${label}`);
  if (count(visible, /<title\b[^>]*>/gi) !== 1) fail(`titleは1件必要: ${label}`);
  if (count(visible, /<meta\b[^>]*\bname=["']description["'][^>]*>/gi) !== 1) {
    fail(`meta descriptionは1件必要: ${label}`);
  }
  if (count(visible, /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi) !== 1) {
    fail(`canonicalは1件必要: ${label}`);
  }
  if (count(visible, /<meta\b[^>]*\bname=["']viewport["'][^>]*>/gi) !== 1) {
    fail(`viewportは1件必要: ${label}`);
  }
  if (count(visible, /<h1\b[^>]*>/gi) < 1) fail(`静的h1がない: ${label}`);

  const ids = tags(visible, '[a-z][a-z0-9:-]*')
    .map((tag) => attr(tag, 'id'))
    .filter(Boolean);
  assertUnique(ids, `${label} の静的id`);

  for (const img of tags(visible, 'img')) {
    if (attr(img, 'alt') === null) fail(`imgのaltがない: ${label}`);
  }

  for (const control of [...tags(visible, 'input'), ...tags(visible, 'select'), ...tags(visible, 'textarea')]) {
    if ((attr(control, 'type') || '').toLowerCase() === 'hidden') continue;
    const id = attr(control, 'id');
    const accessible =
      attr(control, 'aria-label') ||
      attr(control, 'aria-labelledby') ||
      (id && new RegExp(`<label\\b[^>]*\\bfor=["']${escapeRegExp(id)}["']`, 'i').test(visible)) ||
      (id && new RegExp(`<label\\b[^>]*>[\\s\\S]*?<[^>]+\\bid=["']${escapeRegExp(id)}["'][^>]*>[\\s\\S]*?<\\/label>`, 'i').test(visible));
    if (!accessible) fail(`入力コントロールのラベルがない: ${label} -> ${id || '(idなし)'}`);
  }

  for (const tag of [...tags(visible, 'a'), ...tags(visible, 'link'), ...tags(visible, 'script'), ...tags(visible, 'img')]) {
    const reference = attr(tag, tag.startsWith('<a') || tag.startsWith('<link') ? 'href' : 'src');
    if (!localTargetExists(entry.path, reference)) fail(`内部リンク/asset切れ: ${label} -> ${reference}`);
  }

  const analyticsCount = count(html, /<script\b[^>]*\bsrc=["'][^"']*analytics\.js["'][^>]*>/gi);
  if (entry.kind === 'app' && analyticsCount !== 1) fail(`analytics.jsは1回だけ読み込む: ${label}`);

  const jsonLdBlocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (entry.kind !== 'page' && jsonLdBlocks.length === 0) fail(`JSON-LDがない: ${label}`);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      if (entry.kind === 'app' && data['@type'] !== 'WebApplication') {
        fail(`公開アプリのJSON-LDはWebApplicationにする: ${label}`);
      }
      if (entry.kind === 'root' && data['@type'] !== 'WebSite') {
        fail('rootのJSON-LDはWebSiteにする');
      }
    } catch {
      fail(`JSON-LD構文エラー: ${label}`);
    }
  }

  if (entry.kind === 'app') {
    const expectedCanonical = `${catalog.site.baseUrl}${entry.slug}/`;
    if (!visible.includes(`rel="canonical" href="${expectedCanonical}"`) &&
        !visible.includes(`href="${expectedCanonical}" rel="canonical"`)) {
      fail(`HTML canonical不一致: ${label}`);
    }
    for (const property of ['og:title', 'og:description', 'og:url']) {
      if (!new RegExp(`<meta\\b[^>]*property=["']${escapeRegExp(property)}["']`, 'i').test(visible)) {
        fail(`OGP ${property}がない: ${label}`);
      }
    }
    if (html.includes(affiliate.associateTag)) fail(`Associate TagのHTML直書き禁止: ${label}`);

    const productRefs = [
      ...[...html.matchAll(/data-product-key=["']([a-z0-9][a-z0-9._-]*)["']/gi)].map((match) => match[1]),
      ...[...html.matchAll(/urlFor\(\s*["']([a-z0-9][a-z0-9._-]*)["']/gi)].map((match) => match[1]),
    ];
    for (const key of new Set(productRefs)) {
      if (!affiliateProducts?.[key]) fail(`未登録affiliate product key参照: ${label} -> ${key}`);
    }
    for (const anchor of tags(html, 'a').filter((tag) => /data-product-key=/.test(tag))) {
      const rel = new Set((attr(anchor, 'rel') || '').split(/\s+/).filter(Boolean));
      for (const required of ['noopener', 'noreferrer', 'sponsored', 'nofollow']) {
        if (!rel.has(required)) fail(`Amazonリンクのrel不足(${required}): ${label}`);
      }
    }
  }
}

const affiliateJs = existsSync(join(ROOT, 'affiliate.js')) ? read(join(ROOT, 'affiliate.js')) : '';
if (!affiliateJs.includes(`const ASSOCIATE_TAG = ${JSON.stringify(affiliate.associateTag)};`)) {
  fail('affiliate.jsのAssociate Tagがcatalogと不一致');
}

// --- 公開affiliate APIのfail-closed回帰 ---
// catalogは審査待ち候補を含むため、fixtureを差し替えたAPIでも検証する。
// 実際の公開bundleはapproved候補だけを埋め込むため、pending/rejected/missing/invalidは
// getProduct/urlForの両方から到達できないことを保証する。
function loadAffiliateApi(source, productsOverride) {
  let fixtureSource = source;
  if (productsOverride !== undefined) {
    const replacement = `const PRODUCTS = Object.freeze(${JSON.stringify(productsOverride)});`;
    const replaced = fixtureSource.replace(/const PRODUCTS = Object\.freeze\([^\n]*\);/, replacement);
    if (replaced === fixtureSource) {
      fail('affiliate.jsのPRODUCTS定義をfixtureへ差し替えられない');
      return null;
    }
    fixtureSource = replaced;
  }
  const sandbox = {};
  try {
    runInNewContext(fixtureSource, sandbox);
    return sandbox.yzrsAffiliate || null;
  } catch (error) {
    fail(`affiliate.js実行エラー: ${error.message}`);
    return null;
  }
}

const publicAffiliateApi = loadAffiliateApi(affiliateJs);
if (!publicAffiliateApi) {
  fail('affiliate.jsの公開APIが生成されていない');
} else {
  for (const [key, product] of Object.entries(publicAffiliateApi.products || {})) {
    if (product?.ownerReview !== 'approved') {
      fail(`未承認affiliate productが公開bundleに含まれる: ${key}`);
    }
  }
  for (const [key, product] of Object.entries(affiliateProducts || {})) {
    if (product?.ownerReview === 'approved' && !publicAffiliateApi.getProduct(key)) {
      fail(`approved affiliate productが公開APIから取得できない: ${key}`);
    }
    if (product?.ownerReview !== 'approved' && publicAffiliateApi.getProduct(key) !== null) {
      fail(`未承認affiliate productが公開APIから取得できる: ${key}`);
    }
  }
}

const affiliateFixtureApi = loadAffiliateApi(affiliateJs, {
  approvedSearch: { kind: 'search', query: 'DDR4', ownerReview: 'approved' },
  approvedProduct: { kind: 'product', asin: 'B012345678', ownerReview: 'approved' },
  pending: { kind: 'search', query: 'pending', ownerReview: 'pending' },
  rejected: { kind: 'search', query: 'rejected', ownerReview: 'rejected' },
  missing: { kind: 'search', query: 'missing' },
  invalid: { kind: 'search', query: 'invalid', ownerReview: 'apprvoed' },
});
if (affiliateFixtureApi) {
  const approvedUrl = affiliateFixtureApi.urlFor('approvedSearch');
  if (!affiliateFixtureApi.getProduct('approvedSearch') || !approvedUrl.includes('tag=')) {
    fail('Case A: approved候補を公開APIから取得またはURL生成できない');
  }
  for (const [label, key] of [['Case B', 'pending'], ['Case C', 'rejected'], ['Case D', 'missing'], ['Case E', 'invalid']]) {
    if (affiliateFixtureApi.getProduct(key) !== null) {
      fail(`${label}: 未承認候補が公開APIから取得できる`);
    }
    try {
      affiliateFixtureApi.urlFor(key);
      fail(`${label}: 未承認候補のURLを生成できる`);
    } catch {
      // fail closed: 未承認キーはURL生成を拒否する。
    }
  }
  if (affiliateFixtureApi.urlFor('approvedProduct') !== 'https://www.amazon.co.jp/dp/B012345678?tag=yzrs_apps-22') {
    fail('Case A: approved商品URLが期待値と一致しない');
  }
}

for (const slug of ['hdd', 'mem']) {
  const source = read(join(ROOT, slug, 'index.html'));
  if (!source.includes('approvedAffiliateUrl')) {
    fail(`${slug}: 共通affiliate承認ガードがない`);
  }
  if (/window\.yzrsAffiliate\.urlFor/.test(source)) {
    fail(`${slug}: 未承認候補を直接urlForへ渡している`);
  }
}

const analyticsSource = read(join(ROOT, 'analytics.js'));
for (const eventName of ['tool_start', 'result_view', 'tool_complete', 'affiliate_click', 'outbound_click', 'related_tool_click']) {
  if (!analyticsSource.includes(`"${eventName}"`)) fail(`Analyticsイベントがない: ${eventName}`);
}
for (const forbiddenParam of ['link_url', 'item_label']) {
  if (new RegExp(`\\b${forbiddenParam}\\b`).test(analyticsSource)) {
    fail(`Analytics禁止パラメータが残っている: ${forbiddenParam}`);
  }
}

const robots = existsSync(join(ROOT, 'robots.txt')) ? read(join(ROOT, 'robots.txt')) : '';
if (!robots.includes(`Sitemap: ${catalog.site.baseUrl}sitemap.xml`)) fail('robots.txtのSitemapが不正');
for (const slug of appSlugs) {
  if (new RegExp(`Disallow:\\s*/${escapeRegExp(slug)}/`).test(robots)) {
    fail(`公開アプリがrobotsで拒否されている: ${slug}`);
  }
}

// --- 退役SWのキャッシュ削除ポリシー ---
// CacheStorageはオリジン単位で共有される。yzrswork.github.io では yzrswork_apps と
// yzrswork_ai-skill-recipe が同じオリジンに同居するため、退役SWが移転先の現役PWAと
// 同名のキャッシュを消すと、移転先のオフラインキャッシュを破壊する。
// site.sharedOrigin.reservedCachePrefixes に前方一致する退役アプリは、
// cacheClearBlockedBy を必ず持ち、生成SWからキャッシュ削除コードが消えていること。
const sharedOrigin = catalog.site.sharedOrigin;
const reservedCachePrefixes = sharedOrigin?.reservedCachePrefixes;
if (!Array.isArray(reservedCachePrefixes) || reservedCachePrefixes.length === 0) {
  fail('site.sharedOrigin.reservedCachePrefixes がない(共有オリジンのキャッシュ保護が無効化されている)');
}

// 削除は startsWith 判定なので、どちらかがもう一方の接頭辞なら衝突しうる
const prefixOverlaps = (a, b) => a.startsWith(b) || b.startsWith(a);

function conflictingPrefixes(app) {
  if (!Array.isArray(app.cachePrefixes)) return [];
  return app.cachePrefixes.filter((prefix) =>
    (reservedCachePrefixes || []).some((reserved) => prefixOverlaps(prefix, reserved))
  );
}

function assertRetiredSwCachePolicy(app, sw, label) {
  const conflicts = conflictingPrefixes(app);
  const blockedBy = app.cacheClearBlockedBy;

  if (conflicts.length > 0 && !blockedBy) {
    fail(
      `退役アプリのcachePrefixが共有オリジンの予約prefixと衝突している。` +
        `cacheClearBlockedBy を付けてキャッシュ削除を無効化すること: ${app.slug} -> ${conflicts.join(', ')}`
    );
    return;
  }
  if (blockedBy && typeof blockedBy !== 'string') {
    fail(`cacheClearBlockedBy は理由を書いた文字列にする: ${app.slug}`);
    return;
  }

  if (blockedBy) {
    if (!sw.includes('const CACHE_CLEAR_DISABLED = true;')) {
      fail(`cacheClearBlockedBy 付きの退役SWにCACHE_CLEAR_DISABLEDマーカーがない: ${label}`);
    }
    if (sw.includes('caches.delete') || sw.includes('caches.keys')) {
      fail(
        `cacheClearBlockedBy 付きの退役SWにキャッシュ削除が残っている(移転先の現役PWAを壊す): ${label}`
      );
    }
  } else {
    if (!sw.includes(`const CACHE_PREFIXES = ${JSON.stringify(app.cachePrefixes)};`)) {
      fail(`退役SWのcachePrefixesがcatalogと不一致: ${label}`);
    }
    if (!sw.includes('caches.delete')) {
      fail(`退役SWにキャッシュ削除がない(cacheClearBlockedByも未設定): ${label}`);
    }
  }
}

for (const app of catalog.retiredApps) {
  const dir = join(ROOT, app.slug);
  const files = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    : [];
  const expected = ['index.html', 'sw.js'];
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    fail(`退役フォルダはindex.html/sw.jsだけにする: ${app.slug} (${files.join(', ')})`);
  }
  if (!Array.isArray(app.cachePrefixes) || app.cachePrefixes.length === 0) {
    fail(`退役アプリのcachePrefixesがない: ${app.slug}`);
  } else {
    for (const prefix of app.cachePrefixes) {
      if (!prefix.includes(app.slug)) {
        fail(`退役アプリのcachePrefixが広すぎる: ${app.slug} -> ${prefix}`);
      }
    }
    const retiredSw = existsSync(join(dir, 'sw.js')) ? read(join(dir, 'sw.js')) : '';
    assertRetiredSwCachePolicy(app, retiredSw, `${app.slug}/sw.js`);
  }
  if (!app.destination.startsWith('https://')) {
    fail(`退役先はHTTPSに限定: ${app.slug} -> ${app.destination}`);
  }
}

// --- 旧ホスト(yzrswork.github.io)スタブの検証 ---
// docs/ は GitHub Pagesの配信元切り替え専用。yzrswork.github.io は他リポジトリと
// オリジンを共有するため、キャッシュ削除範囲が広すぎないことを機械的に保証する。
const legacyRetirement = catalog.site.legacyRetirement;
if (legacyRetirement?.enabled) {
  const docsDir = join(ROOT, legacyRetirement.outDir || 'docs');
  if (!existsSync(join(docsDir, 'index.html')) || !existsSync(join(docsDir, '404.html'))) {
    fail('docs/ のトップまたは404スタブが生成されていない');
  }
  if (!existsSync(join(docsDir, '.nojekyll'))) {
    fail('docs/.nojekyll がない(Jekyll抑止用)');
  }

  const legacyLiveSlugs = [...appSlugs, ...pageSlugs, 'soubi-navi'];
  for (const slug of legacyLiveSlugs) {
    const indexPath = join(docsDir, slug, 'index.html');
    if (!existsSync(indexPath)) {
      fail(`旧ホストスタブのindex.htmlがない: docs/${slug}`);
      continue;
    }
    const html = read(indexPath);
    if (!html.includes('noindex')) {
      fail(`旧ホストスタブにnoindexがない: docs/${slug}`);
    }
  }

  for (const app of catalog.retiredApps) {
    const indexPath = join(docsDir, app.slug, 'index.html');
    const swPath = join(docsDir, app.slug, 'sw.js');
    if (!existsSync(indexPath) || !existsSync(swPath)) {
      fail(`旧ホスト側の退役スタブがない: docs/${app.slug}`);
      continue;
    }
    const sw = read(swPath);
    if (sw.includes(`'${app.slug}-'`)) {
      fail(`旧ホスト退役SWに広すぎるprefixがある(他リポジトリの現役PWAを壊しうる): docs/${app.slug}`);
    }
    // 共有オリジンの本丸。docs側はまさに yzrswork.github.io に載るので、
    // root側と同じキャッシュ削除ポリシーを機械的に強制する。
    assertRetiredSwCachePolicy(app, sw, `docs/${app.slug}/sw.js`);
  }

  // docs/配下は退役アプリのミラーも含め、全htmlでcanonicalを禁止する
  // (noindexと別ドメインへのcanonicalの併用はGoogle公式が推奨していないため、
  // 予防的に避ける。root側の同種ページ(退役アプリ)は対象外。root自体はcanonicalを維持したまま)。
  // getRegistrations()もサイト境界を越えて全SWを取得するため、docs全体で禁止する。
  const walkLegacy = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkLegacy(path);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
        const source = read(path);
        if (source.includes('getRegistrations(')) {
          fail(`旧ホストスタブでgetRegistrationsは禁止(サイト境界を越えて全SWを取得する): ${path.slice(ROOT.length + 1)}`);
        }
        if (entry.name === 'index.html' || entry.name === '404.html') {
          if (source.includes('rel="canonical"')) {
            fail(`旧ホストスタブにcanonicalが残っている(noindexとの併用はGoogle公式が非推奨): ${path.slice(ROOT.length + 1)}`);
          }
        }
      }
    }
  };
  if (existsSync(docsDir)) walkLegacy(docsDir);
}

const nurerukunSw = read(join(ROOT, 'nurerukun', 'sw.js'));
if (!nurerukunSw.includes("const CACHE_PREFIX = 'nurerukun-';")) {
  fail('塗れるくんSWのCACHE_PREFIXがない');
}

const managedConfigDirs = listRootDirsWith('app.json');
const expectedManagedDirs = catalog.apps
  .filter((app) => app.managed)
  .map((app) => app.slug)
  .sort();
if (JSON.stringify(managedConfigDirs) !== JSON.stringify(expectedManagedDirs)) {
  fail(
    `app.json管理対象がcatalogと不一致: actual=${managedConfigDirs.join(',')} expected=${expectedManagedDirs.join(',')}`
  );
}

const allowedIndexDirs = new Set([
  ...appSlugs,
  ...pageSlugs,
  ...retiredSlugs,
  '_template',
  'soubi-navi',
  'docs',
]);
for (const dir of listRootDirsWith('index.html')) {
  if (!allowedIndexDirs.has(dir)) {
    fail(`公開状態がcatalog未分類のフォルダ: ${dir}`);
  }
}

const rootIndex = read(join(ROOT, 'index.html'));
const readme = read(join(ROOT, 'README.md'));
const sitemap = read(join(ROOT, 'sitemap.xml'));
const adsTxt = read(join(ROOT, 'ads.txt'));
if (!rootIndex.includes(expectedAdsenseMeta) || !rootIndex.includes(expectedAdsenseScript)) {
  fail('root indexにAdSense確認コードがない');
}
const expectedAdsTxt =
  `google.com, ${adsense.publisherId}, DIRECT, ${adsense.certificationAuthorityId}\n`;
if (adsTxt !== expectedAdsTxt) {
  fail('ads.txtがsite.adsenseと一致しない');
}
for (const app of catalog.apps) {
  if (!rootIndex.includes(`href="${app.slug}/"`)) {
    fail(`root indexに未掲載: ${app.slug}`);
  }
  if (!readme.includes(`\`${app.slug}/\``)) {
    fail(`READMEに未掲載: ${app.slug}`);
  }
  if (!sitemap.includes(`<loc>${catalog.site.baseUrl}${app.slug}/</loc>`)) {
    fail(`sitemapに未掲載: ${app.slug}`);
  }
}
for (const app of catalog.retiredApps) {
  if (sitemap.includes(`<loc>${catalog.site.baseUrl}${app.slug}/</loc>`)) {
    fail(`退役アプリがsitemapに残っている: ${app.slug}`);
  }
}

const swFiles = [];
function collectSwFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectSwFiles(path);
    else if (entry.name === 'sw.js') swFiles.push(path);
  }
}
collectSwFiles(ROOT);

for (const path of swFiles) {
  const source = read(path);
  if (source.includes('caches.keys') && source.includes('.filter') && !source.includes('startsWith')) {
    fail(`CacheStorage全体を削除し得るSW: ${path.slice(ROOT.length + 1)}`);
  }
  try {
    execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
  } catch {
    fail(`SW構文エラー: ${path.slice(ROOT.length + 1)}`);
  }
}

for (const script of ['scripts/build.mjs', 'scripts/check.mjs', 'analytics.js']) {
  try {
    execFileSync(process.execPath, ['--check', join(ROOT, script)], { stdio: 'pipe' });
  } catch {
    fail(`スクリプト構文エラー: ${script}`);
  }
}

if (errors.length > 0) {
  console.error(`[check] ${errors.length}件の問題:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `[check] OK: 公開${catalog.apps.length}アプリ、退役${catalog.retiredApps.length}アプリ、SW ${swFiles.length}件。`
);
