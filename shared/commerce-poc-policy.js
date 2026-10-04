import { isCommerceProduct } from './commerce-policy.js';

// Owner's bounded authorization; catalog remains the only Product Master.
const approved = Object.freeze({
  'mem-crucial-ddr4-32': ['CP2K16G4DFRA32A', 'B0C29R9LNL', 'DDR4'],
  'mem-crucial-ddr5-32': ['CP2K16G60C48U5', 'B0CT9BMGLF', 'DDR5'],
});
export function isPoCContract(contract) {
  const { config, products } = contract || {};
  return config?.enabled === false && config.liveApiApproved === false && config.amazonSupportApproved === false &&
    config.endpoint === null && config.marketplace === 'www.amazon.co.jp' && config.credentialVersion === '3.3' &&
    config.associateTag === 'yzrs_apps-22' && config.saleGate?.minPercent === 10 && config.saleGate?.minJPY === 500 &&
    typeof contract.revision === 'string' && /^[a-f0-9]{64}$/.test(contract.revision) &&
    Object.keys(products || {}).length === 2 && Object.entries(approved).every(([key, [model, asin, ddr]]) => {
      const p = products[key];
      return isCommerceProduct(p) && p.maker === 'Crucial' && p.model === model && p.asin === asin &&
        p.conditions?.ddr === ddr && p.conditions.capacity === '32GB' && p.conditions.kit === '16GBx2' &&
        p.ownerReviewedAt === '2026-10-02' && p.evidence?.level === 'specification' &&
        JSON.stringify(p.useCases) === JSON.stringify(['game', 'creative', 'ai']) &&
        JSON.stringify(p.displayOn) === JSON.stringify(['mem', 'deals']);
    });
}
export function isLoopbackOrigin(value) {
  try { const u = new URL(value); return u.protocol === 'http:' && u.hostname === '127.0.0.1' &&
    u.port !== '' && u.origin === value; } catch { return false; }
}
