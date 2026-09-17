// このファイルは scripts/build.mjs が site/catalog.json から生成する。直接編集しない。
(function (global) {
  const ASSOCIATE_TAG = "yzrs_apps-22";
  const PRODUCTS = Object.freeze({"hdd-blue-search":{"kind":"search","label":"WD Blue 内蔵HDD","query":"WD Blue 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-redplus-search":{"kind":"search","label":"WD Red Plus NAS HDD","query":"WD Red Plus NAS HDD","category":"hdd","ownerReview":"approved"},"hdd-red-search":{"kind":"search","label":"WD Red 内蔵HDD","query":"WD Red 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-purple-search":{"kind":"search","label":"WD Purple 監視カメラ HDD","query":"WD Purple 監視カメラ HDD","category":"hdd","ownerReview":"approved"},"hdd-black-search":{"kind":"search","label":"WD Black 内蔵HDD","query":"WD Black 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-model-search":{"kind":"search","label":"HDD型番検索","query":"HDD","category":"hdd","ownerReview":"approved"},"mem-condition-search":{"kind":"search","label":"メモリ条件検索","query":"デスクトップ メモリ","category":"memory","ownerReview":"approved"}});

  function isApproved(item) {
    return Boolean(item && item.ownerReview === 'approved');
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
    getProduct,
    searchUrl,
    productUrl,
    urlFor
  });
})(typeof window !== 'undefined' ? window : globalThis);
