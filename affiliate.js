// このファイルは scripts/build.mjs が site/catalog.json から生成する。直接編集しない。
(function (global) {
  const ASSOCIATE_TAG = "yzrs_apps-22";
  const PRODUCTS = {"hdd-blue-search":{"kind":"search","label":"WD Blue 内蔵HDD","query":"WD Blue 内蔵HDD","category":"hdd","ownerReview":"pending"},"hdd-redplus-search":{"kind":"search","label":"WD Red Plus NAS HDD","query":"WD Red Plus NAS HDD","category":"hdd","ownerReview":"pending"},"hdd-red-search":{"kind":"search","label":"WD Red 内蔵HDD","query":"WD Red 内蔵HDD","category":"hdd","ownerReview":"pending"},"hdd-purple-search":{"kind":"search","label":"WD Purple 監視カメラ HDD","query":"WD Purple 監視カメラ HDD","category":"hdd","ownerReview":"pending"},"hdd-black-search":{"kind":"search","label":"WD Black 内蔵HDD","query":"WD Black 内蔵HDD","category":"hdd","ownerReview":"pending"},"hdd-model-search":{"kind":"search","label":"HDD型番検索","query":"HDD","category":"hdd","ownerReview":"pending"},"mem-condition-search":{"kind":"search","label":"メモリ条件検索","query":"デスクトップ メモリ","category":"memory","ownerReview":"pending"},"mem-team-ddr4-32":{"kind":"product","label":"TEAMGROUP ELITE PLUS DDR4-3200 32GB（16GB×2）","maker":"TEAMGROUP","model":"TPRD432G3200HC22DC01","asin":"B093GNJS1T","category":"memory","conditions":{"ddr":"DDR4","capacity":"32GB","kit":"16GBx2"},"note":"永久保証。3200動作はCPU・マザー・BIOS設定に依存するため、QVLと実動作速度を確認。","sourceUrl":"https://www.teamgroupinc.com/jp/product-detail/memory/TEAMGROUP/elite-plus-u-dimm-ddr4-red/elite-plus-u-dimm-ddr4-red-TPRD432G3200HC22DC01/","lastVerified":"2026-08-12","ownerReview":"pending"},"mem-crucial-ddr4-32":{"kind":"product","label":"Crucial Pro DDR4-3200 32GB（16GB×2・CP2K16G4DFRA32A）","maker":"Crucial","model":"CP2K16G4DFRA32A","asin":"B0C29R9LNL","category":"memory","conditions":{"ddr":"DDR4","capacity":"32GB","kit":"16GBx2"},"note":"現行の2枚組キット。XMP 2.0設定とマザーボードQVLを確認。","sourceUrl":"https://www.crucial.com/memory/ddr4/cp2k16g4dfra32a","lastVerified":"2026-08-12","ownerReview":"pending"},"mem-crucial-ddr5-32":{"kind":"product","label":"Crucial Pro DDR5-6000 32GB（16GB×2・CP2K16G60C48U5）","maker":"Crucial","model":"CP2K16G60C48U5","asin":"B0CT9BMGLF","category":"memory","conditions":{"ddr":"DDR5","capacity":"32GB","kit":"16GBx2"},"note":"Intel XMP 3.0 / AMD EXPO対応。6000 MT/sはOC設定のため、CPU仕様とマザーボードQVLを確認。","sourceUrl":"https://www.crucial.com/memory/ddr5/cp2k16g60c48u5","lastVerified":"2026-08-12","ownerReview":"pending"}};

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
    return PRODUCTS[key] || null;
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
    getProduct,
    searchUrl,
    productUrl,
    urlFor
  });
})(typeof window !== 'undefined' ? window : globalThis);
