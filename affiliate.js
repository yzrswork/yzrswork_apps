// このファイルは scripts/build.mjs が site/catalog.json から生成する。直接編集しない。
(function (global) {
  const ASSOCIATE_TAG = "yzrs_apps-22";
  const PRODUCTS = Object.freeze({"hdd-blue-search":{"kind":"search","label":"WD Blue 内蔵HDD","query":"WD Blue 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-redplus-search":{"kind":"search","label":"WD Red Plus NAS HDD","query":"WD Red Plus NAS HDD","category":"hdd","ownerReview":"approved"},"hdd-red-search":{"kind":"search","label":"WD Red 内蔵HDD","query":"WD Red 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-purple-search":{"kind":"search","label":"WD Purple 監視カメラ HDD","query":"WD Purple 監視カメラ HDD","category":"hdd","ownerReview":"approved"},"hdd-black-search":{"kind":"search","label":"WD Black 内蔵HDD","query":"WD Black 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-model-search":{"kind":"search","label":"HDD型番検索","query":"HDD","category":"hdd","ownerReview":"approved"},"mem-condition-search":{"kind":"search","label":"メモリ条件検索","query":"デスクトップ メモリ","category":"memory","ownerReview":"approved"},"build-storage-search":{"kind":"search","label":"ストレージ条件検索","query":"SSD HDD","category":"storage","ownerReview":"approved"},"build-power-search":{"kind":"search","label":"電源条件検索","query":"PC 電源","category":"power","ownerReview":"approved"},"mem-crucial-ddr4-32":{"kind":"product","label":"Crucial Pro DDR4-3200 32GB（16GB×2・CP2K16G4DFRA32A）","maker":"Crucial","model":"CP2K16G4DFRA32A","asin":"B0C29R9LNL","category":"memory","conditions":{"ddr":"DDR4","capacity":"32GB","kit":"16GBx2"},"note":"現行の2枚組キット。XMP 2.0設定とマザーボードQVLを確認。","sourceUrl":"https://www.crucial.com/memory/ddr4/cp2k16g4dfra32a","lastVerified":"2026-08-12","ownerReview":"approved","tags":[],"useCases":["game","creative","ai"],"recommendationReason":"DDR4対応のデスクトップで、32GB（16GB×2）の2枚構成を検討する際の候補です。ゲーム・制作・ローカルAIで必要容量を確認し、CPU・マザーボードの対応規格、QVL、空きスロットを照合してください。","displayOn":["mem","deals"],"relatedArticles":[],"evidence":{"level":"specification","description":"メーカー仕様に基づく候補：DDR4、32GB（16GB×2）。実使用・実測は未確認です。","sourceUrl":"https://www.crucial.com/memory/ddr4/cp2k16g4dfra32a"},"enabled":true,"ownerReviewedAt":"2026-10-02"},"mem-crucial-ddr5-32":{"kind":"product","label":"Crucial Pro DDR5-6000 32GB（16GB×2・CP2K16G60C48U5）","maker":"Crucial","model":"CP2K16G60C48U5","asin":"B0CT9BMGLF","category":"memory","conditions":{"ddr":"DDR5","capacity":"32GB","kit":"16GBx2"},"note":"Intel XMP 3.0 / AMD EXPO対応。6000 MT/sはOC設定のため、CPU仕様とマザーボードQVLを確認。","sourceUrl":"https://www.crucial.com/memory/ddr5/cp2k16g60c48u5","lastVerified":"2026-08-12","ownerReview":"approved","tags":[],"useCases":["game","creative","ai"],"recommendationReason":"DDR5対応のデスクトップで、32GB（16GB×2）の2枚構成を検討する際の候補です。ゲーム・制作・ローカルAIで必要容量を確認し、CPU・マザーボードの対応規格、QVL、空きスロットを照合してください。","displayOn":["mem","deals"],"relatedArticles":[],"evidence":{"level":"specification","description":"メーカー仕様に基づく候補：DDR5、32GB（16GB×2）。実使用・実測は未確認です。","sourceUrl":"https://www.crucial.com/memory/ddr5/cp2k16g60c48u5"},"enabled":true,"ownerReviewedAt":"2026-10-02"}});

  function isApproved(item) {
    return Boolean(item && item.ownerReview === 'approved' && item.enabled !== false);
  }

  function isCommerceProduct(product) {
  return Boolean(product?.kind === 'product' && product.ownerReview === 'approved' && product.enabled === true);
}
  function matchesMemory(product, { accepted, ddr, useCase, minGB, maxGB }) {
  const capacity = /^(\d+)GB$/.exec(product?.conditions?.capacity || '');
  return isCommerceProduct(product) && accepted === true && /^DDR[45]$/.test(ddr || '') &&
    product.displayOn?.includes('mem') && product.useCases?.includes(useCase) &&
    product.conditions?.ddr === ddr && capacity !== null &&
    Number(capacity[1]) >= minGB && Number(capacity[1]) <= maxGB;
}
  function memoryProducts(context) {
    return Object.entries(PRODUCTS).filter(([, product]) => matchesMemory(product, context))
      .map(([key, product]) => ({ key, product }));
  }

  function searchUrl(query) {
    return 'https://www.amazon.co.jp/s?k=' + encodeURIComponent(String(query || '')) +
      '&tag=' + encodeURIComponent(ASSOCIATE_TAG);
  }

  function productUrl(asin, linkId) {
    const value = String(asin || '').toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(value)) {
      throw new Error('Amazon ASINが不正です');
    }
    let url = 'https://www.amazon.co.jp/dp/' + encodeURIComponent(value) +
      '?tag=' + encodeURIComponent(ASSOCIATE_TAG);
    if (linkId) url += '&linkId=' + encodeURIComponent(String(linkId));
    return url;
  }

  function getProduct(key) {
    const item = PRODUCTS[key];
    return isApproved(item) ? item : null;
  }

  function urlFor(key, options) {
    const item = getProduct(key);
    if (!item) throw new Error('未登録のaffiliate product key: ' + key);
    if (item.kind === 'product') return productUrl(item.asin, options && options.linkId);
    if (item.kind === 'search') {
      const query = options && Object.prototype.hasOwnProperty.call(options, 'query')
        ? options.query
        : item.query;
      return searchUrl(query);
    }
    throw new Error('affiliate product kindが不正です: ' + key);
  }

  global.yzrsAffiliate = Object.freeze({
    tag: ASSOCIATE_TAG,
    products: PRODUCTS,
    evidenceLabels: Object.freeze({"used":"実使用","article":"記事で紹介","specification":"仕様から選定"}),
    memoryProducts,
    getProduct,
    searchUrl,
    productUrl,
    urlFor
  });
})(typeof window !== 'undefined' ? window : globalThis);
