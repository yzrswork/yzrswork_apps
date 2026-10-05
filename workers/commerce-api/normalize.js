import { MAX_AGE_MS, safeAmazonUrl } from '../../shared/commerce-policy.js';
import { MAX_IMAGE_AGE_MS, validProductImage } from '../../shared/product-image-policy.js';

const aliases = value => typeof value === 'string' ? value.replaceAll('_', '') : '';
const money = value => value?.currency === 'JPY' && Number.isFinite(value.amount) && value.amount > 0 ? value.amount : null;
const timestamp = value => value == null ? null : typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;

export function normalizeItem(item, product, config, fetchedAt, now) {
  let image = null;
  const empty = status => ({ status, fetchedAt, expiresAt: fetchedAt + MAX_AGE_MS, offer: null, image });
  if (!item || item.asin !== product.asin) return empty('not-accessible');
  const url = safeAmazonUrl(item.detailPageURL, product.asin, config.associateTag);
  if (!url) return empty('unsafe-url');
  const primary = item.images?.primary?.medium;
  image = validProductImage({ url: primary?.url, width: primary?.width, height: primary?.height,
    fetchedAt, expiresAt: fetchedAt + MAX_IMAGE_AGE_MS }, now);
  const listings = item.offersV2?.listings;
  if (!Array.isArray(listings) || !listings.length) return empty('no-offer');
  const candidates = listings.filter(l => l.condition?.value === 'New' && l.isBuyBoxWinner === true);
  if (candidates.length !== 1) return empty('unsafe-offer');
  const listing = candidates[0];
  if (listing.violatesMAP !== false || ![null, undefined, 'LIGHTNINGDEAL'].includes(listing.type == null ? listing.type : aliases(listing.type))) return empty('unsafe-offer');
  if (!['INSTOCK', 'INSTOCKSCARCE'].includes(aliases(listing.availability?.type))) return empty('unavailable');
  const price = money(listing.price?.money);
  if (price === null) return empty('no-price');
  let deal = null, primeExclusive = false, expiresAt = fetchedAt + MAX_AGE_MS;
  const details = listing.dealDetails;
  if (details != null) {
    if (typeof details !== 'object' || Array.isArray(details)) return empty('unsafe-deal');
    const access = aliases(details.accessType);
    // Early-access price transitions require live JP validation. Do not infer them.
    if (!['ALL', 'PRIMEEXCLUSIVE'].includes(access)) return empty('unsafe-deal');
    const startAt = timestamp(details.startTime), endAt = timestamp(details.endTime);
    if (Number.isNaN(startAt) || Number.isNaN(endAt) || (startAt !== null && endAt !== null && startAt >= endAt)) return empty('unsafe-deal');
    if (endAt !== null && endAt <= now) return empty('expired');
    if (startAt !== null && startAt > now) return empty('not-started');
    if (details.percentClaimed != null && (typeof details.percentClaimed !== 'number' || details.percentClaimed < 0 || details.percentClaimed >= 100)) return empty('unsafe-deal');
    primeExclusive = access === 'PRIMEEXCLUSIVE';
    deal = { active: true, startAt, endAt };
    if (endAt !== null) expiresAt = Math.min(expiresAt, endAt);
  } else if (aliases(listing.type) === 'LIGHTNINGDEAL') return empty('unsafe-deal');
  const basis = listing.price.savingBasis, savings = listing.price.savings;
  const savingBasis = money(basis?.money), savingsJPY = money(savings?.money), percentage = savings?.percentage;
  const validSavings = savingBasis > price && savingsJPY > 0 && Number.isFinite(percentage) && percentage > 0 && percentage <= 100 &&
    Math.abs(savingBasis - price - savingsJPY) <= 1 && Math.abs(savingsJPY / savingBasis * 100 - percentage) <= 1 &&
    typeof basis.savingBasisTypeLabel === 'string' && basis.savingBasisTypeLabel.trim().length > 0 && basis.savingBasisTypeLabel.length <= 100;
  if (expiresAt <= now) return empty('stale');
  return { status: 'fresh', fetchedAt, expiresAt, image, offer: {
    asin: product.asin, price, currency: 'JPY', availability: 'available', detailPageURL: url,
    fetchedAt, expiresAt, primeExclusive, deal,
    savingBasis: validSavings ? savingBasis : null, savingBasisLabel: validSavings ? basis.savingBasisTypeLabel : null,
    savingsJPY: validSavings ? savingsJPY : null, savingsPercent: validSavings ? percentage : null,
  } };
}
