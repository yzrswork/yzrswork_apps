// Cloudflare Worker: 塗れるくん用の複合天気プロキシ
//
// - MET Norway: 地点別の気温・湿度・降水量・風速
// - 気象庁: 予報区域別の降水確率
// - 国土地理院: 座標から市区町村コードを解決
//
// レスポンスは従来のMET Norway JSONを維持し、yzrswork.jmaだけを追加する。
// そのため、Workerとアプリを別々に更新しても旧アプリは壊れない。

const CONTACT = 'https://note.com/yzrswork';
const APP_URL = 'https://apps.yzrswork.com/nurerukun/';
const UA = `nurerukun/2.0 (${APP_URL}; ${CONTACT})`;
const ALLOW_ORIGINS = [
  'https://apps.yzrswork.com',
  'https://yzrswork.github.io',
  'http://localhost:8080',
];

const MET_CACHE_TTL = 900;
const JMA_FORECAST_CACHE_TTL = 1800;
const JMA_AREA_CACHE_TTL = 86400;
const GSI_REVERSE_CACHE_TTL = 86400;
const JMA_AREA_URL = 'https://www.jma.go.jp/bosai/common/const/area.json';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);

    const u = new URL(request.url);
    if (u.pathname === '/health') {
      return json({ ok: true, sources: ['MET Norway', '気象庁', '国土地理院'] }, 200, cors);
    }
    if (u.pathname !== '/forecast') return json({ error: 'not found' }, 404, cors);

    const lat = clampCoord(u.searchParams.get('lat'), 90);
    const lon = clampCoord(u.searchParams.get('lon'), 180);
    if (lat === null || lon === null) return json({ error: 'lat/lon required (numeric)' }, 400, cors);

    const metPromise = fetchMetForecast(lat, lon, ctx);
    const jmaPromise = fetchJmaPrecipitationProbability(lat, lon, ctx);
    const [metResult, jmaResult] = await Promise.allSettled([metPromise, jmaPromise]);

    if (metResult.status !== 'fulfilled') {
      return json({ error: 'weather upstream unavailable' }, 502, cors);
    }

    const combined = metResult.value;
    combined.yzrswork = {
      jma: jmaResult.status === 'fulfilled'
        ? jmaResult.value
        : unavailableJma('upstream-unavailable'),
    };

    return json(combined, 200, {
      ...cors,
      'Cache-Control': `public, max-age=${MET_CACHE_TTL}`,
    });
  },
};

async function fetchMetForecast(lat, lon, ctx) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  return cachedJson(url, MET_CACHE_TTL, ctx, {
    'User-Agent': UA,
    'Accept': 'application/json',
  });
}

async function fetchJmaPrecipitationProbability(lat, lon, ctx) {
  try {
    const reverseUrl = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`;
    const [reverse, areaData] = await Promise.all([
      cachedJson(reverseUrl, GSI_REVERSE_CACHE_TTL, ctx),
      cachedJson(JMA_AREA_URL, JMA_AREA_CACHE_TTL, ctx),
    ]);

    const municipalityCode = String(reverse?.results?.muniCd || '');
    const area = resolveForecastArea(areaData, municipalityCode);
    if (!area) return unavailableJma('area-not-found');

    const forecastUrl = `https://www.jma.go.jp/bosai/forecast/data/forecast/${area.officeCode}.json`;
    const forecast = await cachedJson(forecastUrl, JMA_FORECAST_CACHE_TTL, ctx);
    const extracted = extractJmaProbabilities(forecast, area.class10Code);
    if (!extracted.slots.length) return unavailableJma('probability-not-found', area);

    return {
      available: true,
      municipalityCode,
      officeCode: area.officeCode,
      officeName: area.officeName,
      areaCode: area.class10Code,
      areaName: area.class10Name,
      reportDatetime: extracted.reportDatetime,
      publishingOffice: extracted.publishingOffice,
      slots: extracted.slots,
    };
  } catch {
    return unavailableJma('upstream-unavailable');
  }
}

// 気象庁のclass20コードは「全国地方公共団体コード5桁 + 枝番2桁」。
// 多くの市区町村は枝番が"00"だが、気象庁が市内を細分化している場合は連番になる
// （例: 横浜市 -> 1410011 横浜市北部 / 1410012 横浜市南部。全国で89件）。
// そのため完全一致ではなく5桁の前方一致で引く。
function findClass20Codes(areaData, jisCode) {
  return Object.keys(areaData?.class20s || {})
    .filter((code) => code.startsWith(jisCode))
    .sort();
}

export function resolveForecastArea(areaData, municipalityCode) {
  if (!/^\d{5}$/.test(municipalityCode)) return null;

  let matches = findClass20Codes(areaData, municipalityCode);

  // 政令指定都市の区は気象庁側では市単位のため、区コードから市コードへ降ろす。
  // 市コードは末尾が0で区はその連番（例: 福岡市 40130 に対し博多区 40132）。
  // 先頭3桁で丸めると福岡市の区が北九州市(40100)に化けるため、末尾0の候補を順に試す。
  if (!matches.length) {
    const base = Number(municipalityCode);
    for (let i = 1; i <= 30 && !matches.length; i++) {
      const candidate = String(base - i).padStart(5, '0');
      if (candidate.slice(0, 2) !== municipalityCode.slice(0, 2)) break; // 都道府県をまたがない
      if (!candidate.endsWith('0')) continue;
      matches = findClass20Codes(areaData, candidate);
    }
  }
  if (!matches.length) return null;

  // 細分化された市は候補が複数返る。ほとんどは同じ予報区(class10)に属するため先頭を採る。
  const class20Code = matches[0];
  const class20 = areaData.class20s[class20Code];
  const class15 = areaData.class15s?.[class20.parent];
  const class10Code = class15?.parent || (
    areaData.class10s?.[class20.parent] ? class20.parent : null
  );
  const class10 = class10Code && areaData.class10s?.[class10Code];
  const office = class10 && areaData.offices?.[class10.parent];
  if (!class10 || !office) return null;

  return {
    class20Code,
    class20Name: class20.name,
    class10Code,
    class10Name: class10.name,
    officeCode: class10.parent,
    officeName: office.officeName || office.name,
  };
}

// 気象庁は経過済みの時間帯の降水確率に空文字を返す。Number('')は0になるため、
// 素通しすると「降水確率0%」と誤って断定してしまう（塗装可否では最も危険な向きの誤り）。
// 数字表記でない値はここで捨てて、判定側にはその時間帯を渡さない。
function toProbability(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 100 ? n : null;
}

export function extractJmaProbabilities(forecast, class10Code) {
  if (!Array.isArray(forecast)) return { slots: [] };

  for (const report of forecast) {
    for (const series of report?.timeSeries || []) {
      const timeDefines = Array.isArray(series?.timeDefines) ? series.timeDefines : [];
      const area = (series?.areas || []).find(item =>
        item?.area?.code === class10Code && Array.isArray(item.pops)
      );
      if (!area || !timeDefines.length) continue;

      // 短期予報は6時間刻み、週間予報は24時間刻み。最終スロットの終端はこの間隔から補う。
      const stepMs = timeDefines.length > 1
        ? Math.max(0, Date.parse(timeDefines[1]) - Date.parse(timeDefines[0])) || 6 * 3600000
        : 6 * 3600000;

      const slots = [];
      for (let i = 0; i < timeDefines.length; i++) {
        const probability = toProbability(area.pops[i]);
        const from = timeDefines[i];
        const fromMs = Date.parse(from);
        if (probability === null || !Number.isFinite(fromMs)) continue;
        const to = timeDefines[i + 1] || new Date(fromMs + stepMs).toISOString();
        slots.push({ from, to, probability });
      }
      // 全て空文字だった報は使わず、次の報を見る
      if (!slots.length) continue;

      return {
        reportDatetime: report.reportDatetime || null,
        publishingOffice: report.publishingOffice || null,
        slots,
      };
    }
  }
  return { slots: [] };
}

function unavailableJma(reason, area) {
  return {
    available: false,
    reason,
    officeCode: area?.officeCode || null,
    officeName: area?.officeName || null,
    areaCode: area?.class10Code || null,
    areaName: area?.class10Name || null,
    slots: [],
  };
}

async function cachedJson(url, ttl, ctx, headers = {}) {
  const cache = caches.default;
  const key = new Request(url, { method: 'GET' });
  const cached = await cache.match(key);
  if (cached) return cached.json();

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', ...headers },
    cf: { cacheTtl: ttl, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`upstream ${response.status}`);

  const body = await response.text();
  const parsed = JSON.parse(body);
  const stored = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });
  const put = cache.put(key, stored);
  if (ctx?.waitUntil) ctx.waitUntil(put);
  else await put;
  return parsed;
}

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}

function clampCoord(v, max) {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n.toFixed(4);
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
