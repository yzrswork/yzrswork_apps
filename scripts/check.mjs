#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
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

assertUnique(categoryIds, 'category.id');
assertUnique(allSlugs, 'slug');

for (const app of catalog.apps) {
  const dir = join(ROOT, app.slug);
  if (!existsSync(join(dir, 'index.html'))) {
    fail(`公開アプリのindex.htmlがない: ${app.slug}`);
  }
  if (app.category !== null && !categoryIds.includes(app.category)) {
    fail(`未定義カテゴリ: ${app.slug} -> ${app.category}`);
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
    if (!retiredSw.includes(`const CACHE_PREFIXES = ${JSON.stringify(app.cachePrefixes)};`)) {
      fail(`退役SWのcachePrefixesがcatalogと不一致: ${app.slug}`);
    }
  }
  if (!app.destination.startsWith('https://')) {
    fail(`退役先はHTTPSに限定: ${app.slug} -> ${app.destination}`);
  }
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
]);
for (const dir of listRootDirsWith('index.html')) {
  if (!allowedIndexDirs.has(dir)) {
    fail(`公開状態がcatalog未分類のフォルダ: ${dir}`);
  }
}

const rootIndex = read(join(ROOT, 'index.html'));
const readme = read(join(ROOT, 'README.md'));
const sitemap = read(join(ROOT, 'sitemap.xml'));
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

for (const script of ['scripts/build.mjs', 'scripts/check.mjs']) {
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
