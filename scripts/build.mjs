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
//
// 使い方: node scripts/build.mjs [--check]
//   --check: 書き込まず、生成結果と現状ファイルの差分があれば非0で終了(CI用)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');

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

// --- <head> 生成 ---
function renderHead(app) {
  const lines = [];
  lines.push(`<meta charset="utf-8" />`);
  lines.push(`<title>${app.title}</title>`);
  lines.push(`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`);
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

function renderBackLink(app) {
  if (!app.backLink) return '';
  return `<a href="${app.backLink.href}">${app.backLink.text}</a>`;
}

const HEAD_START = '<!-- BUILD:HEAD:START -->';
const HEAD_END = '<!-- BUILD:HEAD:END -->';
const BACKLINK_START = '<!-- BUILD:BACKLINK:START -->';
const BACKLINK_END = '<!-- BUILD:BACKLINK:END -->';

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

function buildIndexHtml(app) {
  let html = readFileSync(join(app.dir, 'index.html'), 'utf8');
  html = replaceMarked(html, HEAD_START, HEAD_END, renderHead(app));
  if (app.backLink) {
    html = replaceMarked(html, BACKLINK_START, BACKLINK_END, renderBackLink(app));
  }
  return html;
}

function writeIfChanged(path, content, results) {
  const exists = existsSync(path);
  const current = exists ? readFileSync(path, 'utf8') : null;
  const changed = current !== content;
  results.push({ path, changed, exists });
  if (changed && !CHECK) {
    writeFileSync(path, content);
  }
}

function main() {
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
    const html = buildIndexHtml(app);
    writeIfChanged(join(app.dir, 'index.html'), html, results);
  }

  const changedFiles = results.filter((r) => r.changed);
  if (CHECK) {
    if (changedFiles.length > 0) {
      console.error(`[build --check] 差分あり(${changedFiles.length}件):`);
      for (const r of changedFiles) console.error(`  ${r.path}`);
      process.exit(1);
    }
    console.log(`[build --check] 差分なし。${slugs.length}アプリ確認済み。`);
  } else {
    console.log(`[build] ${slugs.length}アプリ処理。更新${changedFiles.length}件。`);
    for (const r of changedFiles) console.log(`  ${r.path}`);
  }
}

main();
