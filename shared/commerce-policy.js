// Pure policy shared by the build, Worker and browser. No Amazon credentials/data.
export const MAX_AGE_MS = 3_600_000;
export const EVIDENCE_LABELS = Object.freeze({ used: '実使用', article: '記事で紹介', specification: '仕様から選定' });

export function isCommerceProduct(product) {
  return Boolean(product?.kind === 'product' && product.ownerReview === 'approved' && product.enabled === true);
}

export function matchesMemory(product, { accepted, ddr, useCase, minGB, maxGB }) {
  const capacity = /^(\d+)GB$/.exec(product?.conditions?.capacity || '');
  return isCommerceProduct(product) && accepted === true && /^DDR[45]$/.test(ddr || '') &&
    product.displayOn?.includes('mem') && product.useCases?.includes(useCase) &&
    product.conditions?.ddr === ddr && capacity !== null &&
    Number(capacity[1]) >= minGB && Number(capacity[1]) <= maxGB;
}

export function safeAmazonUrl(value, asin, tag) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.amazon.co.jp' &&
      !url.username && !url.password && !url.port &&
      url.pathname === `/dp/${asin}` && url.searchParams.getAll('tag').length === 1 &&
      url.searchParams.get('tag') === tag ? url.href : null;
  } catch { return null; }
}

export function validSavings(offer) {
  return Boolean(offer && Number.isFinite(offer.savingBasis) && offer.savingBasis > offer.price &&
    Number.isFinite(offer.savingsJPY) && offer.savingsJPY > 0 &&
    Number.isFinite(offer.savingsPercent) && offer.savingsPercent > 0 && offer.savingsPercent <= 100 &&
    typeof offer.savingBasisLabel === 'string' && offer.savingBasisLabel.trim().length > 0 && offer.savingBasisLabel.length <= 100 &&
    Math.abs(offer.savingBasis - offer.price - offer.savingsJPY) <= 1 &&
    Math.abs(offer.savingsJPY / offer.savingBasis * 100 - offer.savingsPercent) <= 1);
}

export function offerState(offer, now) {
  if (!offer || !Number.isFinite(now) || offer.availability !== 'available' ||
      offer.currency !== 'JPY' || !Number.isFinite(offer.price) || offer.price <= 0 ||
      typeof offer.primeExclusive !== 'boolean' || !Number.isFinite(offer.fetchedAt) ||
      !Number.isFinite(offer.expiresAt) || offer.fetchedAt > now || offer.expiresAt <= offer.fetchedAt ||
      offer.expiresAt > offer.fetchedAt + MAX_AGE_MS) return 'no-offer';
  const deal = offer.deal;
  if (deal !== null && (!deal || deal.active !== true ||
      (deal.startAt !== null && !Number.isFinite(deal.startAt)) ||
      (deal.endAt !== null && !Number.isFinite(deal.endAt)) ||
      (deal.startAt !== null && deal.endAt !== null && deal.startAt >= deal.endAt) ||
      (deal.endAt !== null && offer.expiresAt > deal.endAt))) return 'no-offer';
  if (offer.primeExclusive && !deal) return 'no-offer';
  // Once freshness is lost, a later scheduled end is not a claim about current state.
  if (deal?.endAt !== null && Number.isFinite(deal?.endAt) && deal.endAt <= now &&
      deal.endAt <= offer.fetchedAt + MAX_AGE_MS) return 'expired';
  if (now >= offer.expiresAt || now - offer.fetchedAt >= MAX_AGE_MS) return 'stale';
  if (deal && deal.startAt !== null && deal.startAt > now) return 'no-offer';
  return 'fresh';
}

export function saleEligible(product, offer, now, config) {
  if (!isCommerceProduct(product) || !product.displayOn?.includes('deals') ||
      offerState(offer, now) !== 'fresh' || offer.asin !== product.asin ||
      !safeAmazonUrl(offer.detailPageURL, product.asin, config?.associateTag)) return false;
  // Expired/future deal economics cannot re-enter through the savings branch.
  return offer.deal?.active === true || (validSavings(offer) &&
    offer.savingsPercent >= config?.saleGate?.minPercent && offer.savingsJPY >= config?.saleGate?.minJPY
  );
}
