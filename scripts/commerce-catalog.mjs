import { createHash } from 'node:crypto';
import { EVIDENCE_LABELS, isCommerceProduct } from '../shared/commerce-policy.js';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length;
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(value).toISOString().slice(0, 10) === value;
const DYNAMIC_FIELDS = ['price', 'savingBasis', 'savings', 'savingsPercent', 'savingsJPY', 'dealDetails', 'availability', 'detailPageURL', 'fetchedAt', 'expiresAt'];

export function validateCommerceCatalog(catalog) {
  const errors = [];
  const config = catalog.site.commerce;
  if (!config || config.schemaVersion !== 1 || config.marketplace !== 'www.amazon.co.jp' ||
      config.credentialVersion !== '3.3' || config.canonical !== `${catalog.site.baseUrl}deals/` ||
      typeof config.enabled !== 'boolean' || typeof config.liveApiApproved !== 'boolean' ||
      typeof config.amazonSupportApproved !== 'boolean') errors.push('site.commerce configuration invalid');
  if (config?.saleGate?.minPercent !== 10 || config?.saleGate?.minJPY !== 500) errors.push('SALE policy requires Owner-approved 10% and 500 JPY');
  if (config?.enabled && (!config.liveApiApproved || !config.amazonSupportApproved || !https(config.endpoint))) {
    errors.push('Commerce publication requires API/support gates and HTTPS endpoint');
  }
  if (config?.enabled && JSON.stringify(config.webDisplayOn) !== '["deals"]') errors.push('Production commerce display requires normal Deals web page only');
  if (config?.endpoint !== null && !https(config?.endpoint)) errors.push('Commerce endpoint invalid');
  const seen = new Set();
  for (const [key, p] of Object.entries(catalog.site.affiliate.products)) {
    if (p.kind !== 'product') continue;
    if (DYNAMIC_FIELDS.some(field => Object.hasOwn(p, field))) errors.push(`${key}: dynamic Amazon values forbidden in Product Master`);
    if (!['pending', 'approved', 'rejected'].includes(p.ownerReview) || !/^[A-Z0-9]{10}$/.test(p.asin || '') ||
        typeof p.enabled !== 'boolean' || !strings(p.tags) || !strings(p.useCases) || !strings(p.displayOn) ||
        !Array.isArray(p.relatedArticles) || !p.relatedArticles.every(a => nonempty(a.label) && https(a.url))) {
      errors.push(`${key}: static product schema invalid`);
    }
    if (p.enabled && p.ownerReview !== 'approved') errors.push(`${key}: enabled requires individual Owner approval`);
    if (p.ownerReview === 'approved') {
      let validDay = false;
      try { validDay = day(p.ownerReviewedAt); } catch { /* invalid date */ }
      if (![p.maker, p.model, p.label, p.category, p.recommendationReason].every(nonempty) || !validDay ||
          !p.useCases?.length || !p.displayOn?.length || !Object.hasOwn(EVIDENCE_LABELS, p.evidence?.level || '') ||
          !nonempty(p.evidence?.description) || !https(p.evidence?.sourceUrl)) errors.push(`${key}: individual review/evidence incomplete`);
    }
    if (p.displayOn?.includes('mem') && (!/^DDR[45]$/.test(p.conditions?.ddr || '') ||
        !/^\d+GB$/.test(p.conditions?.capacity || '') || !/^\d+GBx2$/.test(p.conditions?.kit || ''))) {
      errors.push(`${key}: mem capacity/DDR/kit conditions required`);
    }
    if (isCommerceProduct(p)) {
      if (seen.has(p.asin)) errors.push(`${key}: enabled ASIN duplicated`);
      seen.add(p.asin);
      if (p.displayOn.some(slug => !['deals', ...catalog.apps.map(a => a.slug)].includes(slug))) errors.push(`${key}: unknown displayOn`);
    }
  }
  return errors;
}

export function commerceProjection(catalog) {
  const errors = validateCommerceCatalog(catalog);
  if (errors.length) throw new Error(errors.join('\n'));
  const products = Object.fromEntries(Object.entries(catalog.site.affiliate.products).filter(([, p]) => isCommerceProduct(p)));
  const config = { ...catalog.site.commerce, associateTag: catalog.site.affiliate.associateTag };
  const revision = createHash('sha256').update(JSON.stringify({ config, products })).digest('hex');
  return { revision, config, products };
}
