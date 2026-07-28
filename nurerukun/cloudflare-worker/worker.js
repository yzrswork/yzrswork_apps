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

export function resolveForecastArea(areaData, municipalityCode) {
  if (!/^\d{5}$/.test(municipalityCode)) return null;

  // 通常の市区町村は5桁の全国地方公共団体コード + "00"。
  // 政令指定都市の区は気象庁側で市単位のため、先頭3桁 + "0000"へフォールバックする。
  const exactCode = municipalityCode + '00';
  const cityCode = municipalityCode.slice(0, 3) + '0000';
  const class20Code = areaData?.class20s?.[exactCode] ? exactCode
    : (areaData?.class20s?.[cityCode] ? cityCode : null);
  if (!class20Code) return null;

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

export function extractJmaProbabilities(forecast, class10Code) {
  if (!Array.isArray(forecast)) return { slots: [] };

  for (const report of forecast) {
    for (const series of report?.timeSeries || []) {
      const area = (series.areas || []).find(item =>
        item?.area?.code === class10Code && Array.isArray(item.pops)
      );
      if (!area) continue;

      const slots = [];
      for (let i = 0; i < series.timeDefines.length; i++) {
        const probability = Number(area.pops[i]);
        const from = series.timeDefines[i];
        const next = series.timeDefines[i + 1];
        const fromMs = Date.parse(from);
        if (!Number.isFinite(probability) || probability < 0 || probability > 100 || !Number.isFinite(fromMs)) continue;
        const to = next || new Date(fromMs + 6 * 3600000).toISOString();
        slots.push({ from, to, probability });
      }
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
