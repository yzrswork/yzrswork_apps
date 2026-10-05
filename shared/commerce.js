import { commerceConfig } from './commerce-config.js';
import { isCommerceProduct, MAX_AGE_MS, safeAmazonUrl, saleEligible, offerState, validSavings } from './commerce-policy.js';
import { validProductImage } from './product-image-policy.js';

export function validatePayload(payload, contract) {
  if (payload?.schemaVersion !== 1 || payload.catalogRevision !== contract.revision || payload.status !== 'ok' ||
      !Number.isFinite(payload.serverNow) || !payload.items || typeof payload.items !== 'object') return {};
  const valid = {};
  for (const [key, product] of Object.entries(contract.products)) {
    const item = payload.items[key], offer = item?.offer;
    if (!isCommerceProduct(product) || !item) continue;
    const candidateImage = validProductImage(item.image, payload.serverNow);
    const image = candidateImage && Number.isFinite(item.image.remainingMS) && item.image.remainingMS > 0 &&
      item.image.remainingMS <= candidateImage.expiresAt - payload.serverNow
      ? { ...candidateImage, remainingMS: item.image.remainingMS } : null;
    // An optional image is independent of offer validation and its shorter deadline.
    if (image) valid[key] = { image };
    if (
        !Number.isFinite(item.fetchedAt) || !Number.isFinite(item.expiresAt) || item.fetchedAt > payload.serverNow ||
        item.expiresAt > item.fetchedAt + MAX_AGE_MS) continue;
    if (['expired', 'stale', 'no-offer', 'not-accessible'].includes(item.status) && item.offer === null && item.remainingMS === 0) {
      valid[key] = { ...valid[key], status: item.status, fetchedAt: item.fetchedAt, expiresAt: item.expiresAt, remainingMS: 0, offer: null };
      continue;
    }
    if (item.status !== 'fresh' || !offer || offer.asin !== product.asin || item.expiresAt <= payload.serverNow ||
        !Number.isFinite(item.remainingMS) || item.remainingMS <= 0 || item.remainingMS > item.expiresAt - payload.serverNow ||
        offer.fetchedAt !== item.fetchedAt || offer.expiresAt !== item.expiresAt ||
        !Number.isFinite(offer.price) || offer.price <= 0 || offer.currency !== 'JPY' || offer.availability !== 'available' ||
        typeof offer.primeExclusive !== 'boolean' || !safeAmazonUrl(offer.detailPageURL, product.asin, contract.config.associateTag)) continue;
    if (offerState(offer, payload.serverNow) !== 'fresh') continue;
    const savingsValid = validSavings(offer);
    valid[key] = { ...valid[key], status: 'fresh', fetchedAt: item.fetchedAt, expiresAt: item.expiresAt, remainingMS: item.remainingMS,
      offer: { asin: offer.asin, price: offer.price, currency: 'JPY', availability: 'available',
        detailPageURL: offer.detailPageURL, fetchedAt: offer.fetchedAt, expiresAt: offer.expiresAt,
        primeExclusive: offer.primeExclusive, deal: offer.deal ? { active: true, startAt: offer.deal.startAt, endAt: offer.deal.endAt } : null,
        savingBasis: savingsValid ? offer.savingBasis : null, savingBasisLabel: savingsValid ? offer.savingBasisLabel : null,
        savingsJPY: savingsValid ? offer.savingsJPY : null, savingsPercent: savingsValid ? offer.savingsPercent : null } };
  }
  return valid;
}

export function createCommerceController({ contract = commerceConfig, document, window, navigator,
  fetcher = globalThis.fetch, monotonic = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  developmentRead = null }) {
  let state = {}, imageState = {}, timer, generation = 0, pending, pendingGeneration, refreshAgain = false, disposed = false;
  const originals = new Map();
  // A development adapter is only usable on the exact loopback page. Its entry
  // separately validates the unchanged disabled contract; public pages pass none.
  const development = developmentRead && /^http:\/\/127\.0\.0\.1:\d+$/.test(developmentRead.origin) &&
    window.location?.origin === developmentRead.origin && contract.config.enabled === false &&
    contract.config.amazonSupportApproved === false && contract.config.liveApiApproved === false &&
    contract.config.endpoint === null && typeof developmentRead.fetch === 'function';
  const webPageAllowed = !contract.config.webDisplayOn || (window.location?.origin === 'https://apps.yzrswork.com' &&
    ['/deals/', '/deals/index.html'].includes(window.location?.pathname) && contract.config.webDisplayOn.includes('deals'));
  const enabled = development || (webPageAllowed && (contract.config.enabled === true && contract.config.amazonSupportApproved === true &&
    typeof contract.config.endpoint === 'string' && contract.config.endpoint.startsWith('https://')));
  const slots = () => document.querySelectorAll('[data-commerce-slot]');

  function hideImage(anchor) {
    if (!anchor?.dataset?.commerceImage || typeof anchor.querySelector !== 'function') return;
    anchor.hidden = true;
    const img = anchor.querySelector('img');
    if (img) { img.onload = null; img.onerror = null; img.removeAttribute('src'); }
    delete anchor.dataset.imageUrl;
    if (anchor.dataset.amazonHref) anchor.href = anchor.dataset.amazonHref;
  }

  function renderImages() {
    let next = Infinity;
    if (typeof document.querySelector !== 'function') return next;
    for (const [key, product] of Object.entries(contract.products)) {
      if (!isCommerceProduct(product)) continue;
      const anchor = document.querySelector(`[data-commerce-image="${key}"]`);
      const current = imageState[key];
      if (!current || current.deadline <= monotonic()) { hideImage(anchor); delete imageState[key]; continue; }
      next = Math.min(next, current.deadline - monotonic());
      if (anchor?.dataset?.commerceImage !== key || typeof anchor.querySelector !== 'function') continue;
      const img = anchor.querySelector('img');
      if (!img) continue;
      const cta = document.querySelector(`[data-commerce-cta="${key}"]`);
      anchor.href = cta?.href || anchor.dataset.amazonHref;
      if (anchor.dataset.imageUrl === current.url) continue;
      anchor.hidden = true;
      anchor.dataset.imageUrl = current.url;
      img.width = current.width; img.height = current.height;
      img.onload = () => {
        if (anchor.dataset.imageUrl === current.url && imageState[key]?.deadline > monotonic()) anchor.hidden = false;
      };
      img.onerror = () => {
        if (anchor.dataset.imageUrl === current.url) { hideImage(anchor); delete imageState[key]; }
      };
      img.src = current.url;
    }
    return next;
  }

  function clear() {
    clearTimer(timer); state = {}; imageState = {};
    for (const slot of slots()) { slot.replaceChildren(); slot.hidden = true; }
    for (const [key] of Object.entries(contract.products)) hideImage(document.querySelector?.(`[data-commerce-image="${key}"]`));
    for (const [cta, href] of originals) if (cta.isConnected) cta.href = href;
    originals.clear();
  }

  function apply() {
    clearTimer(timer);
    for (const cta of originals.keys()) if (!cta.isConnected) originals.delete(cta);
    let next = Infinity;
    for (const slot of slots()) {
      const key = slot.dataset.commerceSlot, item = state[key];
      const cta = document.querySelector(`[data-commerce-cta="${key}"]`);
      slot.replaceChildren(); slot.hidden = true;
      if (cta && originals.has(cta)) cta.href = originals.get(cta);
      const card = slot.closest('[data-deals-card]');
      if (card) card.hidden = false;
      if (item?.offer && item.deadline <= monotonic()) {
        const status = offerState(item.offer, item.serverNow + monotonic() - item.started);
        state[key] = { status: status === 'expired' ? 'expired' : 'stale', offer: null };
      }
      const current = state[key];
      if (!current?.offer) {
        if (enabled) {
          const note = document.createElement('p');
          note.textContent = current?.status === 'expired'
            ? '取得時のセール期間は終了しました。現在の価格はAmazonで確認してください。'
            : pending && !current ? '価格情報を確認しています。' : '現在の価格情報を確認できません。Amazonで詳細を確認してください。';
          slot.append(note); slot.hidden = false;
        }
        continue;
      }
      const { offer } = current;
      if (card && saleEligible(contract.products[key], offer, item.serverNow + monotonic() - item.started, contract.config)) {
        const badge = document.createElement('p'); badge.className = 'commerce-sale'; badge.textContent = 'SALE条件を満たしています'; slot.append(badge);
      }
      const line = document.createElement('p'); line.className = 'commerce-price';
      line.textContent = `取得時の価格 ¥${new Intl.NumberFormat('ja-JP').format(offer.price)}${offer.primeExclusive ? '（Prime会員限定）' : ''}`;
      slot.append(line);
      if (offer.deal?.active) {
        const text = document.createElement('p'); text.textContent = '取得時のDeal対象'; slot.append(text);
      }
      if (validSavings(offer)) {
        const text = document.createElement('p');
        text.textContent = `${offer.savingBasisLabel}: ¥${offer.savingBasis.toLocaleString('ja-JP')} / ¥${offer.savingsJPY.toLocaleString('ja-JP')}引き（${offer.savingsPercent}%）`;
        slot.append(text);
      }
      const time = document.createElement('p'); time.className = 'commerce-time';
      time.textContent = `${new Date(item.fetchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST取得。価格・在庫はAmazonで確認してください。`;
      slot.append(time);
      const disclaimer = document.createElement('p'); disclaimer.className = 'commerce-time';
      disclaimer.textContent = '価格・在庫状況は取得日時点の情報であり、変更される場合があります。購入時にAmazon.co.jpに表示される価格・在庫状況が適用されます。';
      slot.append(disclaimer); slot.hidden = false;
      if (cta) {
        if (!originals.has(cta)) originals.set(cta, cta.href);
        cta.href = offer.detailPageURL;
      }
      next = Math.min(next, item.deadline - monotonic());
    }
    next = Math.min(next, renderImages());
    if (Number.isFinite(next)) timer = setTimer(apply, Math.max(1, next));
  }

  async function refresh() {
    if (!enabled || disposed || navigator.onLine === false || document.visibilityState === 'hidden') { clear(); return; }
    if (pending) {
      if (pendingGeneration !== generation) refreshAgain = true;
      return pending;
    }
    const current = generation, started = monotonic();
    pendingGeneration = current;
    pending = Promise.resolve().then(async () => {
      try {
        const init = { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(8000) };
        const response = development ? await developmentRead.fetch(init) : await fetcher(contract.config.endpoint, init);
        if (!response.ok) throw new Error('unavailable');
        const payload = await response.json();
        if (current !== generation || disposed || navigator.onLine === false || document.visibilityState === 'hidden') return;
        const items = validatePayload(payload, contract);
        imageState = Object.fromEntries(Object.entries(items).filter(([, item]) => item.image).map(([key, item]) => [key, {
          ...item.image, deadline: started + item.image.remainingMS,
        }]));
        state = Object.fromEntries(Object.entries(items).map(([key, item]) => [key, {
          ...item, serverNow: payload.serverNow, started, deadline: started + item.remainingMS,
        }]));
        apply();
      } catch { if (current === generation) { clear(); apply(); } }
      finally {
        pending = null;
        if (refreshAgain && !disposed) { refreshAgain = false; void refresh(); }
        else if (current === generation && !disposed) apply();
      }
    });
    apply();
    return pending;
  }

  function invalidate() { generation++; clear(); }
  function resume() { invalidate(); void refresh(); }
  function visibility() { invalidate(); if (document.visibilityState === 'visible') void refresh(); }
  function render() { apply(); if (!Object.values(state).some(item => item.deadline > monotonic())) void refresh(); }
  window.addEventListener('yzrs:recommendations-rendered', render);
  window.addEventListener('offline', invalidate);
  window.addEventListener('online', resume);
  window.addEventListener('pagehide', invalidate);
  window.addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', visibility);
  void refresh();
  return { refresh, clear: invalidate, dispose() {
    disposed = true; invalidate();
    for (const [name, handler] of [['yzrs:recommendations-rendered', render], ['offline', invalidate], ['online', resume], ['pagehide', invalidate], ['pageshow', resume]]) window.removeEventListener(name, handler);
    document.removeEventListener('visibilitychange', visibility);
  } };
}

if (typeof document !== 'undefined') createCommerceController({ document, window, navigator });
