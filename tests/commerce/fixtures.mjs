// Fabricated data only. Never deploy these fixtures or call Amazon with them.
export const START = Date.parse('2026-10-02T12:00:00Z');
export const TAG = 'fixture-22';
export function product(overrides = {}) {
  return { kind: 'product', ownerReview: 'approved', enabled: true, asin: 'B000000001', maker: 'MOCK',
    model: 'MOCK-32', label: 'MOCK ONLY メモリ', category: 'memory', tags: [], useCases: ['game', 'creative'],
    displayOn: ['mem', 'deals'], recommendationReason: 'MOCK ONLY 推薦理由', specSummary: 'DDR4 / 32GB / 16GB×2', conditions: { ddr: 'DDR4', capacity: '32GB', kit: '16GBx2' },
    ownerReviewedAt: '2026-10-02', relatedArticles: [], evidence: { level: 'specification', description: 'MOCK ONLY 仕様候補', sourceUrl: 'https://example.invalid/spec' }, ...overrides };
}
export function contract(products = { mock: product() }) {
  return { revision: 'mock-revision', products, config: { schemaVersion: 1, associateTag: TAG, enabled: true,
    liveApiApproved: true, amazonSupportApproved: true, endpoint: 'https://mock.invalid/v1/offers',
    credentialVersion: '3.3', marketplace: 'www.amazon.co.jp', saleGate: { minPercent: 10, minJPY: 500 } } };
}
export function rawItem(asin = 'B000000001') {
  return { asin, detailPageURL: `https://www.amazon.co.jp/dp/${asin}?tag=${TAG}&linkCode=ogi`,
    offersV2: { listings: [{ condition: { value: 'New' }, isBuyBoxWinner: true, violatesMAP: false,
      availability: { type: 'IN_STOCK' }, price: { money: { amount: 9000, currency: 'JPY' },
        savingBasis: { money: { amount: 10000, currency: 'JPY' }, savingBasisType: 'LIST_PRICE', savingBasisTypeLabel: '参考価格' },
        savings: { money: { amount: 1000, currency: 'JPY' }, percentage: 10 } } }] } };
}
export function fakeKV(clock) {
  const data = new Map(), puts = [], deletes = [];
  return { data, puts, deletes,
    async get(key) { const entry = data.get(key); return entry && entry.expiration * 1000 > clock() ? structuredClone(entry.value) : null; },
    async put(key, json, options) { puts.push({ key, ...options }); data.set(key, { value: JSON.parse(json), ...options }); },
    async delete(key) { deletes.push(key); data.delete(key); },
  };
}
export function harness() {
  let now = START;
  const clock = () => now;
  const env = { LIVE_API_ENABLED: 'true', COMMERCE_PUBLIC_ENABLED: 'true', CREDENTIAL_VERSION: '3.3',
    TOKEN_ROTATION_EPOCH: 'mock-epoch', AMAZON_CLIENT_ID: 'amzn1.mock-not-a-credential', AMAZON_CLIENT_SECRET: 'mock-only-secret',
    COMMERCE_AUTH: fakeKV(clock), COMMERCE_SNAPSHOTS: fakeKV(clock) };
  return { env, clock, advance: ms => { now += ms; }, sleep: async ms => { now += ms; } };
}
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
export const tokenResponse = () => json({ access_token: 'mock-only-access-token', token_type: 'bearer', expires_in: 3600 });
export const offersRequest = (origin = 'https://apps.yzrswork.com', path = '/v1/offers') => new Request(`https://worker.invalid${path}`, { headers: { Origin: origin } });
