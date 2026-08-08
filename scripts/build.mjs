#!/usr/bin/env node
// yzrswork_apps ビルドスクリプト(依存ゼロ、Node標準ライブラリのみ)
//
// 各アプリフォルダの app.json を正として、以下を生成する:
//   - sw.js (hasServiceWorker: true の場合)
//   - manifest.webmanifest または manifest.json (hasManifest: true の場合)
//   - index.html の <head> と フッターの戻りリンクだけを、
//     <!-- BUILD:HEAD:START/END --> <!-- BUILD:BACKLINK:START/END --> の
//     マーカーコメントで囲まれた区間だけ書き換える。<body>内のアプリ固有
//     マークアップ、<script>ロジックには一切触れない。
// site/catalog.json を正として、以下も生成する:
//   - ルートindex.htmlのツール一覧
//   - README.mdの収録ツール表
//   - sitemap.xml
//   - デジタル作品置き場へ移したアプリの退役index.html / sw.js
//
// 使い方: node scripts/build.mjs [--check]
//   --check: 書き込まず、生成結果と現状ファイルの差分があれば非0で終了(CI用)

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');
const CATALOG_PATH = join(ROOT, 'site', 'catalog.json');

function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
}

function listAppDirs() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'shared' && d.name !== 'scripts' && d.name !== 'icons')
    .map((d) => d.name)
    .filter((name) => existsSync(join(ROOT, name, 'app.json')))
    .sort();
}

function loadApp(slug) {
  const dir = join(ROOT, slug);
  const app = JSON.parse(readFileSync(join(dir, 'app.json'), 'utf8'));
  app.slug = slug;
  app.dir = dir;
  return app;
}

// --- sw.js 生成 ---
function renderSw(app) {
  const varName = app.slug.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_ASSET_URLS';
  const assets = app.assets.map((a) => `  '${a}'`).join(',\n');
  return `const CACHE_NAME = '${app.slug}-v${app.swVersion}';
const CACHE_PREFIX = '${app.slug}-';
const ASSETS = [
${assets}
];

// ASSETSを絶対URLに正規化したSet（fetch判定で使用）
const ${varName} = new Set(
  ASSETS.map(path => new URL(path, self.location.href).href)
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // クロスオリジン（Google Fonts等）は素通り
  if (url.origin !== self.location.origin) {
    return;
  }

  // GET以外は素通り
  if (request.method !== 'GET') {
    return;
  }

  // ${app.slug}アプリの既知アセット以外は素通り（他ページに介入しない）
  if (!${varName}.has(url.href)) {
    return;
  }

  // Cache First + ネットワークフォールバック
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// === キャッシュ更新ルール ===
// index.html や manifest を更新したら app.json の swVersion を bump すること
// （このファイルは scripts/build.mjs が自動生成する。直接編集しない）
//
// === キャッシュ範囲 ===
// このSWは /${app.slug}/ スコープで、ASSETS配列に列挙された既知アセットのみキャッシュする。
// 他ページには介入しない。
`;
}

// --- manifest 生成 ---
function renderManifest(app) {
  const manifest = {
    name: app.name,
    short_name: app.shortName || app.name,
    ...(app.manifestDescription ? { description: app.manifestDescription } : {}),
    start_url: './index.html',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ja',
    background_color: app.themeColor,
    theme_color: app.themeColor,
    icons: app.manifestIcons,
  };
  return JSON.stringify(manifest, null, 2) + '\n';
}

// --- AdSense / <head> 生成 ---
function renderAdsenseHead(catalog) {
  const adsense = catalog.site.adsense;
  if (!adsense?.client || !adsense?.publisherId || !adsense?.certificationAuthorityId) {
    throw new Error('site.adsense の client / publisherId / certificationAuthorityId が必要');
  }
  return [
    `<meta name="google-adsense-account" content="${adsense.client}" />`,
    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense.client}"`,
    `     crossorigin="anonymous"></script>`,
  ].join('\n');
}

function renderAdsTxt(catalog) {
  const adsense = catalog.site.adsense;
  return `google.com, ${adsense.publisherId}, DIRECT, ${adsense.certificationAuthorityId}\n`;
}

function renderHead(app, catalog) {
  const lines = [];
  lines.push(`<meta charset="utf-8" />`);
  lines.push(`<title>${app.title}</title>`);
  lines.push(`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`);
  lines.push(renderAdsenseHead(catalog));
  if (app.hasManifest) {
    lines.push(`<link rel="manifest" href="${app.manifestHref}" />`);
  }
  lines.push(`<meta name="theme-color" content="${app.themeColor}" />`);
  if (app.robots) {
    lines.push(`<meta name="robots" content="${app.robots}" />`);
  }
  if (app.hasServiceWorker || app.hasManifest) {
    lines.push(`<meta name="apple-mobile-web-app-capable" content="yes" />`);
    lines.push(`<meta name="apple-mobile-web-app-status-bar-style" content="default" />`);
    lines.push(`<meta name="apple-mobile-web-app-title" content="${app.shortName || app.name}" />`);
  }
  if (app.appleTouchIcon) {
    lines.push(`<link rel="apple-touch-icon" href="${app.appleTouchIcon}" />`);
  }
  lines.push(`<link rel="canonical" href="${app.canonical}" />`);
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:site_name" content="や印工務店 — YZRS WORK" />`);
  lines.push(`<meta property="og:locale" content="ja_JP" />`);
  const ogTitle = app.ogTitle || app.title;
  lines.push(`<meta property="og:title" content="${ogTitle}" />`);
  lines.push(`<meta property="og:description" content="${app.ogDescription}" />`);
  lines.push(`<meta property="og:url" content="${app.canonical}" />`);
  if (app.ogImage) {
    lines.push(`<meta property="og:image" content="${app.ogImage}" />`);
    lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  } else {
    lines.push(`<meta name="twitter:card" content="summary" />`);
  }
  lines.push(`<meta name="twitter:title" content="${ogTitle}" />`);
  lines.push(`<meta name="twitter:description" content="${app.twitterDescription}" />`);
  if (app.ogImage) {
    lines.push(`<meta name="twitter:image" content="${app.ogImage}" />`);
  }
  lines.push(`<meta name="description" content="${app.metaDescription}" />`);
  lines.push(`<script type="application/ld+json">`);
  lines.push(
    JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: app.name,
        url: app.canonical,
        applicationCategory: app.applicationCategory || 'UtilitiesApplication',
        operatingSystem: 'Web',
        inLanguage: 'ja',
        description: app.ogDescription,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
        author: { '@type': 'Organization', name: 'や印工務店 (yzrswork)', url: 'https://note.com/yzrswork' },
      },
      null,
      2
    )
  );
  lines.push(`</script>`);
  if (app.analyticsSrc) {
    lines.push(`<script async src="${app.analyticsSrc}"></script>`);
  }
  lines.push(`<link rel="preconnect" href="https://fonts.googleapis.com" />`);
  lines.push(`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`);
  lines.push(
    `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=DM+Mono:wght@400;500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet" />`
  );
  lines.push(`<link rel="stylesheet" href="${app.tokensHref}" />`);
  return lines.join('\n');
}

function renderBackLink(app, catalog) {
  if (!app.backLink) return '';

  const catalogApp = catalog.apps.find((entry) => entry.slug === app.slug);
  const related = (catalogApp?.related || [])
    .map((slug) => catalog.apps.find((entry) => entry.slug === slug))
    .filter(Boolean);
  const lines = [];

  if (related.length > 0 || catalogApp?.sourceNote) {
    lines.push('<nav class="yapps-related" aria-label="関連情報">');
    if (related.length > 0) {
      lines.push('  <span class="yapps-related-label">次に使える道具</span>');
      lines.push('  <div class="yapps-related-links">');
      for (const entry of related) {
        lines.push(
          `    <a href="../${escapeHtml(entry.slug)}/" data-related-slug="${escapeHtml(entry.slug)}">${escapeHtml(entry.name)}</a>`
        );
      }
      lines.push('  </div>');
    }
    if (catalogApp?.sourceNote) {
      lines.push(
        `  <a class="yapps-source-note" href="${escapeHtml(catalogApp.sourceNote.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(catalogApp.sourceNote.label)} ↗</a>`
      );
    }
    lines.push('</nav>');
  }

  lines.push(`<a href="${app.backLink.href}">${app.backLink.text}</a>`);
  return lines.join('\n');
}

const HEAD_START = '<!-- BUILD:HEAD:START -->';
const HEAD_END = '<!-- BUILD:HEAD:END -->';
const BACKLINK_START = '<!-- BUILD:BACKLINK:START -->';
const BACKLINK_END = '<!-- BUILD:BACKLINK:END -->';
const CATALOG_START = '<!-- BUILD:CATALOG:START -->';
const CATALOG_END = '<!-- BUILD:CATALOG:END -->';
const README_TOOLS_START = '<!-- BUILD:README-TOOLS:START -->';
const README_TOOLS_END = '<!-- BUILD:README-TOOLS:END -->';
const ADSENSE_START = '<!-- BUILD:ADSENSE:START -->';
const ADSENSE_END = '<!-- BUILD:ADSENSE:END -->';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCatalog(catalog) {
  const featured = catalog.apps.find((app) => app.slug === catalog.featured.slug);
  if (!featured) {
    throw new Error(`featured.slug に対応するアプリがない: ${catalog.featured.slug}`);
  }

  const lines = [
    `<a class="featured" id="trouble" href="${escapeHtml(featured.slug)}/">`,
    `  <span class="f-eyebrow">${escapeHtml(catalog.featured.eyebrow)}</span>`,
    `  <div class="name">${escapeHtml(featured.name)}</div>`,
    `  <p class="desc">${escapeHtml(featured.description)}</p>`,
    `  <span class="go">${escapeHtml(catalog.featured.linkText)}</span>`,
    `</a>`,
  ];

  for (const category of catalog.categories) {
    const apps = catalog.apps.filter((app) => app.category === category.id);
    lines.push('');
    lines.push(
      `<div class="cat-head" id="category-${escapeHtml(category.id)}"><h2>${escapeHtml(category.name)}</h2><span class="cnt">${apps.length} TOOLS</span></div>`
    );
    lines.push('<div class="grid">');
    for (const app of apps) {
      lines.push(`  <a class="app" href="${escapeHtml(app.slug)}/">`);
      lines.push(`    <div class="name">${escapeHtml(app.name)}</div>`);
      lines.push(`    <p class="desc">${escapeHtml(app.description)}</p>`);
      lines.push('  </a>');
    }
    lines.push('</div>');
  }

  return lines.map((line) => (line ? `  ${line}` : '')).join('\n');
}

function renderReadmeTools(catalog) {
  const entries = [
    ...catalog.apps,
    ...[...catalog.pages].sort((a, b) => (a.readmeOrder || 0) - (b.readmeOrder || 0)),
  ];
  const lines = ['| ツール | 説明 | パス |', '|---|---|---|'];
  for (const entry of entries) {
    lines.push(
      `| ${entry.name} | ${entry.readmeDescription} | \`${entry.slug}/\` |`
    );
  }
  return lines.join('\n');
}

function renderSitemap(catalog) {
  const baseUrl = catalog.site.baseUrl;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${baseUrl}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
  ];
  for (const app of catalog.apps) {
    lines.push(
      `  <url><loc>${baseUrl}${app.slug}/</loc><changefreq>monthly</changefreq><priority>${app.sitemapPriority}</priority></url>`
    );
  }
  for (const page of catalog.pages) {
    lines.push(
      `  <url><loc>${baseUrl}${page.slug}/</loc><priority>${page.sitemapPriority}</priority></url>`
    );
  }
  lines.push('</urlset>');
  return `${lines.join('\n')}\n`;
}

function renderRetiredIndex(app) {
  const reason = app.reason || 'この作品はデジタル作品置き場へ移動しました。';
  const destination = escapeHtml(app.destination);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, follow" />
  <meta http-equiv="refresh" content="5;url=${destination}" />
  <link rel="canonical" href="${destination}" />
  <title>${escapeHtml(app.name)} — 移転のお知らせ</title>
  <style>
    :root { color-scheme: light; --paper:#f0ebe3; --ink:#26211d; --terra:#a54832; --rule:#c9bca9; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:var(--paper); color:var(--ink); font-family:"Noto Sans JP",system-ui,sans-serif; }
    main { width:min(560px,100%); padding:32px; border:1px solid var(--rule); border-radius:14px; background:#fffaf2; box-shadow:0 12px 36px rgba(38,33,29,.08); }
    h1 { margin:0 0 14px; font-size:clamp(1.4rem,5vw,2rem); }
    p { line-height:1.8; }
    a { display:inline-block; margin-top:10px; color:#fff; background:var(--terra); padding:12px 18px; border-radius:8px; font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(app.name)}</h1>
    <p>${escapeHtml(reason)}</p>
    <p>旧PWAのキャッシュを安全に解除してから移動します。</p>
    <a href="${destination}">${escapeHtml(app.destinationLabel)}</a>
  </main>
  <script>
    const destination = ${JSON.stringify(app.destination)};
    const move = () => window.location.replace(destination);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => registration.update())
        .catch(() => {})
        .finally(() => window.setTimeout(move, 1800));
    } else {
      window.setTimeout(move, 600);
    }
  </script>
</body>
</html>
`;
}

// --- 退役SWの共通本体 ---
// root(apps.yzrswork.com)側とdocs(yzrswork.github.io)側で同じ本体を使う。
// 以前は2つの関数に同じ本文をコピーしていたため、片方だけ直すと安全性の差が生まれた。
//
// キャッシュ削除の可否は catalog の cacheClearBlockedBy で決める。
// CacheStorageはオリジン単位で共有される。yzrswork.github.io は
// yzrswork_ai-skill-recipe とオリジンを共有するため、移転先が現役で使っている
// キャッシュ名(yapps-<slug>-vN)を退役SWが消すと、移転先PWAのオフラインキャッシュを
// 破壊する。削除できるのは「移転先と名前が衝突しない」と確認できた退役アプリだけ。
// 削除しない場合に残るのは、SW解除後は誰も参照しない孤児キャッシュだけで、
// ブラウザのストレージ回収に任せられる(害は容量のみ)。
// なお registration.unregister() はスコープ単位なので、移転先の登録には影響しない。
function retiredSwSource(app, { navigateExpression }) {
  const blockedBy = app.cacheClearBlockedBy;
  const header = blockedBy
    ? `// このSWはキャッシュを削除しない。
// 理由: ${blockedBy}
// 対象prefix: ${app.cachePrefixes.join(', ')}
// 同一オリジンでCacheStorageを共有するため、削除すると移転先の現役PWAを壊す。
// (site/catalog.json の site.sharedOrigin と cacheClearBlockedBy を参照)
const CACHE_CLEAR_DISABLED = true;`
    : `const CACHE_PREFIXES = ${JSON.stringify(app.cachePrefixes)};`;
  const clearStep = blockedBy
    ? ''
    : `    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .map((key) => caches.delete(key))
    );

`;
  return `${header}
const RETIRED_URL = new URL('./index.html?retired=1', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
${clearStep}    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(
      windows
        .filter((client) => client.url.startsWith(self.registration.scope))
        .map((client) => ${navigateExpression})
    );
  })());
});
`;
}

function renderRetiredSw(app) {
  return retiredSwSource(app, { navigateExpression: 'client.navigate(RETIRED_URL)' });
}

// --- 旧ホスト(yzrswork.github.io)退役スタブ生成 ---
// GitHub Pagesの配信元をmainブランチの/docsへ切り替えることで、Cloudflare Pages側
// (リポジトリ直下、apps.yzrswork.com)の公開アプリ本体には触れずに旧ホストだけを
// 退役させる(ただしCloudflare Pagesはリポジトリ直下を配信するため、_redirectsの
// 追加など、リポジトリ側の設定変更は反映される。Cloudflareダッシュボード側の
// 設定は変更しない、という意味)。docs/配下のスタブは canonical を書かない
// (noindexと別ドメインへのcanonicalの併用はGoogle公式が推奨していない予防的な
// 回避。apps.yzrswork.com側を巻き込んで消さないための防衛線)。
function renderLegacyIndex({ name, destination, destinationLabel, hasSw, noticeSeconds }) {
  const dest = escapeHtml(destination);
  const label = escapeHtml(destinationLabel || 'apps.yzrswork.com で開く');
  // hasSw時、SW側は退役完了後に ./index.html?retired=1 へ遷移させる(下のrenderLegacySw参照)。
  // ここでそのマーカーを見て再登録をスキップしないと、reload -> 再register -> activate -> navigate の
  // 周回でタイマーが振り出しに戻り、体感の移転までの時間が伸びる。
  const swScript = hasSw
    ? `if (location.search.includes('retired=1')) {
      move();
    } else if (location.hostname === 'yzrswork.github.io' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => registration.update())
        .catch(() => {})
        .finally(() => window.setTimeout(move, Math.max(${noticeSeconds} * 1000, 1800)));
    } else {
      window.setTimeout(move, ${noticeSeconds} * 1000);
    }`
    : `window.setTimeout(move, ${noticeSeconds} * 1000);`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, follow" />
  <meta http-equiv="refresh" content="${noticeSeconds};url=${dest}" />
  <title>${escapeHtml(name)} — 移転のお知らせ</title>
  <style>
    :root { color-scheme: light; --paper:#f0ebe3; --ink:#26211d; --terra:#a54832; --rule:#c9bca9; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:var(--paper); color:var(--ink); font-family:"Noto Sans JP",system-ui,sans-serif; }
    main { width:min(560px,100%); padding:32px; border:1px solid var(--rule); border-radius:14px; background:#fffaf2; box-shadow:0 12px 36px rgba(38,33,29,.08); }
    h1 { margin:0 0 14px; font-size:clamp(1.4rem,5vw,2rem); }
    p { line-height:1.8; }
    a { display:inline-block; margin-top:10px; color:#fff; background:var(--terra); padding:12px 18px; border-radius:8px; font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(name)}</h1>
    <p>このページは <strong>apps.yzrswork.com</strong> へ移転しました。今後はそちらをご利用ください。</p>
    <p>ホーム画面に追加したアイコンがあれば削除して、新しいURLから追加し直してください。</p>
    <a href="${dest}">${label}</a>
  </main>
  <script>
    const destination = ${JSON.stringify(destination)};
    const move = () => window.location.replace(destination + window.location.hash);
    ${swScript}
  </script>
</body>
</html>
`;
}

function renderLegacySw({ slug }) {
  return `// yzrswork.github.io(旧ホスト)専用の退役SW。yzrswork.github.io は
// yzrswork_ai-skill-recipe 等の別リポジトリとオリジンを共有しているため、
// 削除対象は自分自身が生成したキャッシュ名(${slug}-v数字)への厳密一致に限定する。
const CACHE_PREFIX = '${slug}-';
const CACHE_RE = /^${slug}-v\\d+$/;
const RETIRED_URL = new URL('./index.html?retired=1', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && CACHE_RE.test(key))
        .map((key) => caches.delete(key))
    );
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(
      windows
        .filter((client) => client.url.startsWith(self.registration.scope))
        .map((client) => client.navigate(RETIRED_URL + new URL(client.url).hash).catch(() => {}))
    );
  })());
});
`;
}

// --- 退役アプリ(catalog.retiredApps)のdocs側ミラー ---
// root側の renderRetiredIndex / renderRetiredSw は本番(apps.yzrswork.com)にも
// そのまま配信されるため変更しない。docs側だけ以下の3点を変えた派生版を使う:
//   1. canonical を書かない(退役ライブ16本と同じ理由。全docs配下で統一する)
//   2. SW登録をhostname厳密一致でガードする(_redirectsの301はCloudflare側の
//      設定に依存するため、apps.yzrswork.com/docs/<slug>/ に直接来られても
//      正規ドメイン上にSW登録を作らないよう構造で防ぐ)
//   3. client.navigate() のrejectを握る(uncontrolled clientでのTypeErrorを黙らせる)
function renderLegacyRetiredIndex(app) {
  const reason = app.reason || 'この作品はデジタル作品置き場へ移動しました。';
  const destination = escapeHtml(app.destination);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, follow" />
  <meta http-equiv="refresh" content="5;url=${destination}" />
  <title>${escapeHtml(app.name)} — 移転のお知らせ</title>
  <style>
    :root { color-scheme: light; --paper:#f0ebe3; --ink:#26211d; --terra:#a54832; --rule:#c9bca9; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:var(--paper); color:var(--ink); font-family:"Noto Sans JP",system-ui,sans-serif; }
    main { width:min(560px,100%); padding:32px; border:1px solid var(--rule); border-radius:14px; background:#fffaf2; box-shadow:0 12px 36px rgba(38,33,29,.08); }
    h1 { margin:0 0 14px; font-size:clamp(1.4rem,5vw,2rem); }
    p { line-height:1.8; }
    a { display:inline-block; margin-top:10px; color:#fff; background:var(--terra); padding:12px 18px; border-radius:8px; font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(app.name)}</h1>
    <p>${escapeHtml(reason)}</p>
    <p>旧PWAのキャッシュを安全に解除してから移動します。</p>
    <a href="${destination}">${escapeHtml(app.destinationLabel)}</a>
  </main>
  <script>
    const destination = ${JSON.stringify(app.destination)};
    const move = () => window.location.replace(destination);
    if (location.search.includes('retired=1')) {
      move();
    } else if (location.hostname === 'yzrswork.github.io' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => registration.update())
        .catch(() => {})
        .finally(() => window.setTimeout(move, 1800));
    } else {
      window.setTimeout(move, 600);
    }
  </script>
</body>
</html>
`;
}

// docs側はhashを引き継ぎ、uncontrolled clientでのnavigate rejectを握る点だけがrootと違う。
// 本体(キャッシュ削除の可否を含む)は retiredSwSource に集約している。
function renderLegacyRetiredSw(app) {
  return retiredSwSource(app, {
    navigateExpression: 'client.navigate(RETIRED_URL + new URL(client.url).hash).catch(() => {})',
  });
}

function legacyLiveTargets(catalog) {
  return [
    ...catalog.apps.map((app) => ({
      slug: app.slug,
      name: app.name,
      hasSw: existsSync(join(ROOT, app.slug, 'sw.js')),
    })),
    ...catalog.pages.map((page) => ({ slug: page.slug, name: page.name, hasSw: false })),
    {
      slug: 'soubi-navi',
      name: '装備ナビ(旧パス)',
      hasSw: existsSync(join(ROOT, 'soubi-navi', 'sw.js')),
      destination: `${catalog.site.baseUrl}kit/`,
    },
  ];
}

function buildLegacyHostStubs(catalog, results) {
  const legacy = catalog.site.legacyRetirement;
  if (!legacy?.enabled) return;
  const outDir = join(ROOT, legacy.outDir || 'docs');
  const noticeSeconds = legacy.noticeSeconds ?? 3;

  writeIfChanged(join(outDir, '.nojekyll'), '', results);
  writeIfChanged(
    join(outDir, 'index.html'),
    renderLegacyIndex({
      name: catalog.site.name,
      destination: catalog.site.baseUrl,
      destinationLabel: '道具箱トップへ',
      hasSw: false,
      noticeSeconds,
    }),
    results
  );
  writeIfChanged(
    join(outDir, '404.html'),
    renderLegacyIndex({
      name: 'ページが見つかりません',
      destination: catalog.site.baseUrl,
      destinationLabel: '道具箱トップへ',
      hasSw: false,
      noticeSeconds,
    }),
    results
  );

  for (const target of legacyLiveTargets(catalog)) {
    const dir = join(outDir, target.slug);
    const destination = target.destination || `${catalog.site.baseUrl}${target.slug}/`;
    writeIfChanged(
      join(dir, 'index.html'),
      renderLegacyIndex({
        name: target.name,
        destination,
        destinationLabel: 'apps.yzrswork.com で開く',
        hasSw: target.hasSw,
        noticeSeconds,
      }),
      results
    );
    if (target.hasSw) {
      writeIfChanged(join(dir, 'sw.js'), renderLegacySw({ slug: target.slug }), results);
    }
  }

  // 退役アプリはroot(apps.yzrswork.com)側でも移転スタブを配信しているが、
  // docs側はcanonical省略・hostname厳密ガード・navigate rejectの握りを追加した
  // 派生版(renderLegacyRetiredIndex/Sw)を使う。root側の生成物とは中身が異なる。
  for (const retiredApp of catalog.retiredApps) {
    const dir = join(outDir, retiredApp.slug);
    writeIfChanged(join(dir, 'index.html'), renderLegacyRetiredIndex(retiredApp), results);
    writeIfChanged(join(dir, 'sw.js'), renderLegacyRetiredSw(retiredApp), results);
  }

  // Search Console のURLプレフィックス検証(HTML file method)が旧ホスト側にも
  // 発行されている場合、配信元切替と同時に検証が外れてプロパティを失う。
  // root直下にある検証ファイルをそのままdocsにも複製しておく(安価な保険)。
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && /^google[0-9a-f]+\.html$/.test(entry.name)) {
      writeIfChanged(join(outDir, entry.name), readFileSync(join(ROOT, entry.name), 'utf8'), results);
    }
  }
}

function replaceMarked(html, startMarker, endMarker, content) {
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`マーカーが見つからない: ${startMarker} ... ${endMarker}`);
  }
  const before = html.slice(0, startIdx + startMarker.length);
  const after = html.slice(endIdx);
  return `${before}\n${content}\n${after}`;
}

function buildIndexHtml(app, catalog) {
  let html = readFileSync(join(app.dir, 'index.html'), 'utf8');
  html = replaceMarked(html, HEAD_START, HEAD_END, renderHead(app, catalog));
  if (app.backLink) {
    html = replaceMarked(html, BACKLINK_START, BACKLINK_END, renderBackLink(app, catalog));
  }
  return html;
}

function normalizeText(content) {
  return content.replaceAll('\r\n', '\n');
}

function writeIfChanged(path, content, results) {
  const exists = existsSync(path);
  const current = exists ? readFileSync(path, 'utf8') : null;
  const normalizedContent = normalizeText(content);
  const changed = current === null || normalizeText(current) !== normalizedContent;
  results.push({ path, changed, exists });
  if (changed && !CHECK) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, normalizedContent);
  }
}

function main() {
  const catalog = loadCatalog();
  const slugs = listAppDirs();
  const results = [];
  for (const slug of slugs) {
    const app = loadApp(slug);
    if (app.hasServiceWorker) {
      writeIfChanged(join(app.dir, 'sw.js'), renderSw(app), results);
    }
    if (app.hasManifest) {
      writeIfChanged(join(app.dir, app.manifestFile || 'manifest.webmanifest'), renderManifest(app), results);
    }
    const html = buildIndexHtml(app, catalog);
    writeIfChanged(join(app.dir, 'index.html'), html, results);
  }

  let rootIndex = readFileSync(join(ROOT, 'index.html'), 'utf8');
  rootIndex = replaceMarked(rootIndex, ADSENSE_START, ADSENSE_END, renderAdsenseHead(catalog));
  rootIndex = replaceMarked(rootIndex, CATALOG_START, CATALOG_END, renderCatalog(catalog));
  writeIfChanged(join(ROOT, 'index.html'), rootIndex, results);

  for (const app of catalog.apps.filter((entry) => entry.managed === false)) {
    const indexPath = join(ROOT, app.slug, 'index.html');
    const html = replaceMarked(
      readFileSync(indexPath, 'utf8'),
      ADSENSE_START,
      ADSENSE_END,
      renderAdsenseHead(catalog)
    );
    writeIfChanged(indexPath, html, results);
  }

  const readme = replaceMarked(
    readFileSync(join(ROOT, 'README.md'), 'utf8'),
    README_TOOLS_START,
    README_TOOLS_END,
    renderReadmeTools(catalog)
  );
  writeIfChanged(join(ROOT, 'README.md'), readme, results);
  writeIfChanged(join(ROOT, 'sitemap.xml'), renderSitemap(catalog), results);
  writeIfChanged(join(ROOT, 'ads.txt'), renderAdsTxt(catalog), results);

  for (const retiredApp of catalog.retiredApps) {
    const dir = join(ROOT, retiredApp.slug);
    writeIfChanged(join(dir, 'index.html'), renderRetiredIndex(retiredApp), results);
    writeIfChanged(join(dir, 'sw.js'), renderRetiredSw(retiredApp), results);
  }

  buildLegacyHostStubs(catalog, results);

  const changedFiles = results.filter((r) => r.changed);
  if (CHECK) {
    if (changedFiles.length > 0) {
      console.error(`[build --check] 差分あり(${changedFiles.length}件):`);
      for (const r of changedFiles) console.error(`  ${r.path}`);
      process.exit(1);
    }
    console.log(
      `[build --check] 差分なし。公開${catalog.apps.length}アプリ、生成対象${slugs.length}アプリ、退役${catalog.retiredApps.length}アプリ確認済み。`
    );
  } else {
    console.log(
      `[build] 公開${catalog.apps.length}アプリ、生成対象${slugs.length}アプリ、退役${catalog.retiredApps.length}アプリ処理。更新${changedFiles.length}件。`
    );
    for (const r of changedFiles) console.log(`  ${r.path}`);
  }
}

main();
