// このファイルは scripts/build.mjs が site/catalog.json から生成する。直接編集しない。
(function (global) {
  const ASSOCIATE_TAG = "yzrs_apps-22";
  const PRODUCTS = Object.freeze({"hdd-blue-search":{"kind":"search","label":"WD Blue 内蔵HDD","query":"WD Blue 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-redplus-search":{"kind":"search","label":"WD Red Plus NAS HDD","query":"WD Red Plus NAS HDD","category":"hdd","ownerReview":"approved"},"hdd-red-search":{"kind":"search","label":"WD Red 内蔵HDD","query":"WD Red 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-purple-search":{"kind":"search","label":"WD Purple 監視カメラ HDD","query":"WD Purple 監視カメラ HDD","category":"hdd","ownerReview":"approved"},"hdd-black-search":{"kind":"search","label":"WD Black 内蔵HDD","query":"WD Black 内蔵HDD","category":"hdd","ownerReview":"approved"},"hdd-model-search":{"kind":"search","label":"HDD型番検索","query":"HDD","category":"hdd","ownerReview":"approved"},"mem-condition-search":{"kind":"search","label":"メモリ条件検索","query":"デスクトップ メモリ","category":"memory","ownerReview":"approved"},"build-storage-search":{"kind":"search","label":"ストレージ条件検索","query":"SSD HDD","category":"storage","ownerReview":"approved"},"build-power-search":{"kind":"search","label":"電源条件検索","query":"PC 電源","category":"power","ownerReview":"approved"},"mem-crucial-ddr4-32":{"kind":"product","label":"Crucial Pro DDR4-3200 32GB（16GB×2・CP2K16G4DFRA32A）","maker":"Crucial","model":"CP2K16G4DFRA32A","asin":"B0C29R9LNL","category":"memory","conditions":{"ddr":"DDR4","capacity":"32GB","kit":"16GBx2"},"note":"現行の2枚組キット。XMP 2.0設定とマザーボードQVLを確認。","sourceUrl":"https://www.crucial.com/memory/ddr4/cp2k16g4dfra32a","lastVerified":"2026-08-12","ownerReview":"approved","tags":[],"useCases":["game","creative","ai"],"recommendationReason":"DDR4対応のデスクトップで、32GB（16GB×2）の2枚構成を検討する際の候補です。ゲーム・制作・ローカルAIで必要容量を確認し、CPU・マザーボードの対応規格、QVL、空きスロットを照合してください。","displayOn":["mem","deals"],"relatedArticles":[],"evidence":{"level":"specification","description":"メーカー仕様に基づく候補：DDR4、32GB（16GB×2）。実使用・実測は未確認です。","sourceUrl":"https://www.crucial.com/memory/ddr4/cp2k16g4dfra32a"},"enabled":true,"ownerReviewedAt":"2026-10-02","specSummary":"DDR4 / 32GB / 16GB×2 / 3200 MT/s"},"mem-crucial-ddr5-32":{"kind":"product","label":"Crucial Pro DDR5-6000 32GB（16GB×2・CP2K16G60C48U5）","maker":"Crucial","model":"CP2K16G60C48U5","asin":"B0CT9BMGLF","category":"memory","conditions":{"ddr":"DDR5","capacity":"32GB","kit":"16GBx2"},"note":"Intel XMP 3.0 / AMD EXPO対応。6000 MT/sはOC設定のため、CPU仕様とマザーボードQVLを確認。","sourceUrl":"https://www.crucial.com/memory/ddr5/cp2k16g60c48u5","lastVerified":"2026-08-12","ownerReview":"approved","tags":[],"useCases":["game","creative","ai"],"recommendationReason":"DDR5対応のデスクトップで、32GB（16GB×2）の2枚構成を検討する際の候補です。ゲーム・制作・ローカルAIで必要容量を確認し、CPU・マザーボードの対応規格、QVL、空きスロットを照合してください。","displayOn":["mem","deals"],"relatedArticles":[],"evidence":{"level":"specification","description":"メーカー仕様に基づく候補：DDR5、32GB（16GB×2）。実使用・実測は未確認です。","sourceUrl":"https://www.crucial.com/memory/ddr5/cp2k16g60c48u5"},"enabled":true,"ownerReviewedAt":"2026-10-02","specSummary":"DDR5 / 32GB / 16GB×2 / 6000 MT/s"},"solder-hakko-fx600a":{"kind":"product","label":"HAKKO FX600A 温調式はんだごて","maker":"HAKKO","model":"FX600A","asin":"B076KMS5CV","category":"soldering","conditions":{"power":"50W","temperature":"200-500C","tipSeries":"T18"},"specSummary":"50W / 200–500℃ / セラミックヒーター / T18シリーズ","note":"YZRS実使用品。FX-600系の温調式ペン型。作業対象に合わせてT18シリーズのこて先を選択。","sourceUrl":"https://www.hakko.com/japan/products/hakko_fx600_spec.html","lastVerified":"2026-10-05","ownerReview":"approved","tags":["soldering","temperature-control"],"useCases":["maker","repair"],"recommendationReason":"電子工作や修理で、固定温度式ではなく温度調整できるペン型はんだごてを選ぶ際の候補です。作業対象に合わせてT18シリーズのこて先を選べ、YZRSでも実使用しています。","displayOn":["kit","handa","deals"],"relatedArticles":[{"label":"電子工作vol.2 — 工具の話","url":"https://note.com/yzrswork/n/nd08cb43b6ca4"}],"evidence":{"level":"used","description":"YZRS実使用品。メーカー公開のFX-600仕様（50W、200〜500℃、セラミックヒーター、T18-B標準）と既存記事のFX600A使用記録に基づく推薦です。","sourceUrl":"https://www.hakko.com/japan/products/hakko_fx600_spec.html"},"enabled":true,"ownerReviewedAt":"2026-10-05"},"tool-engineer-paw01":{"kind":"product","label":"ENGINEER PAW-01 マルチワイヤーストリッパー","maker":"ENGINEER","model":"PAW-01","asin":"B072BYT2V3","category":"wiring","conditions":{"wireArea":"0.05-8mm2","awg":"AWG30-8","cutter":"3.2mm"},"specSummary":"0.05–8mm² / AWG30–8 / 電線径自動調整 / ワイヤーカッター","note":"YZRS実使用品。特殊な被覆材では剥けない場合があり、シースは対象外。対象線材への適合を確認。","sourceUrl":"https://www.nejisaurus.engineer.jp/product-page/paw-01-%E3%83%9E%E3%83%AB%E3%83%81%E3%83%AF%E3%82%A4%E3%83%A4%E3%83%BC%E3%82%B9%E3%83%88%E3%83%AA%E3%83%83%E3%83%91%E3%83%BC-1","lastVerified":"2026-10-05","ownerReview":"approved","tags":["wire-stripper","wiring"],"useCases":["maker","repair"],"recommendationReason":"電子工作で複数径の電線を扱い、芯線を傷つけにくく被覆を剥きたいときの候補です。電線径自動調整と微調整機構があり、細線から比較的太い線まで一本で対応しやすい工具です。","displayOn":["kit","deals"],"relatedArticles":[{"label":"電子工作vol.2 — 工具の話","url":"https://note.com/yzrswork/n/nd08cb43b6ca4"}],"evidence":{"level":"used","description":"YZRS実使用品。メーカー仕様の対応範囲0.05〜8mm² / AWG30〜8、自動調整・微調整機構と既存記事の使用記録に基づく推薦です。","sourceUrl":"https://www.nejisaurus.engineer.jp/product-page/paw-01-%E3%83%9E%E3%83%AB%E3%83%81%E3%83%AF%E3%82%A4%E3%83%A4%E3%83%BC%E3%82%B9%E3%83%88%E3%83%AA%E3%83%83%E3%83%91%E3%83%BC-1"},"enabled":true,"ownerReviewedAt":"2026-10-05"},"hdd-wd-blue-4tb-wd40ezax-ajp":{"kind":"product","label":"WD Blue 4TB WD40EZAX-AJP","maker":"Western Digital","model":"WD40EZAX-AJP","asin":"B0CKLCK9SW","category":"hdd","conditions":{"capacity":"4TB","formFactor":"3.5-inch","interface":"SATA","recording":"CMR","rpm":"5400","cache":"256MB"},"specSummary":"4TB / 3.5インチ / SATA / 5400RPM / CMR / 256MBキャッシュ","note":"Amazon Japan向けSKUはWD40EZAX-AJP。メーカー仕様Authorityは基幹型番WD40EZAX。NAS・RAID常時運用向けとしては推薦せず、用途に応じてRed Plus等を確認。","sourceUrl":"https://www.westerndigital.com/en-ie/products/internal-drives/wd-blue-desktop-sata-hdd?sku=WD40EZAX","lastVerified":"2026-10-05","ownerReview":"approved","tags":["hdd","cmr","4tb"],"useCases":["storage","archive"],"recommendationReason":"一般的なデスクトップPCで大容量データ保存用HDDを選ぶ際の候補です。4TB・CMRのWD Blueで、OSや高速作業領域よりも大容量保存・アーカイブ用途を想定します。","displayOn":["hdd","build","deals"],"relatedArticles":[],"evidence":{"level":"specification","description":"メーカー仕様に基づく候補：WD40EZAXは4TB、3.5インチ、SATA、5400RPM、CMR、256MBキャッシュ。実使用・実測は未確認です。","sourceUrl":"https://www.westerndigital.com/en-ie/products/internal-drives/wd-blue-desktop-sata-hdd?sku=WD40EZAX"},"enabled":true,"ownerReviewedAt":"2026-10-05"},"solder-goot-sd83":{"kind":"product","label":"goot SD-83 鉛入りヤニ入りはんだ","maker":"goot","model":"SD-83","asin":"B0C8YYM78X","category":"soldering","conditions":{"composition":"Sn60/Pb40","diameter":"1.0mm","length":"3.0m","rosin":"core"},"specSummary":"Sn60/Pb40 / φ1.0mm / 約3.0m / ヤニ入り","note":"YZRS実使用品。鉛入りはんだ。作業中は十分に換気し、作業場所で飲食せず、作業後は石けんで手を洗う。高温の溶融はんだにも注意。","sourceUrl":"https://www.goot.jp/products/detail/sd_83","lastVerified":"2026-10-05","ownerReview":"approved","tags":["solder","lead-containing"],"useCases":["maker","repair"],"recommendationReason":"鉛入りはんだを使用する電子工作で、φ1.0mmの少量ヤニ入りはんだを選ぶ際の候補です。YZRSで実使用しており、一般的な電子工作や小規模な修理に使いやすい仕様です。","displayOn":["kit","handa","deals"],"relatedArticles":[{"label":"電子工作vol.3 — 消耗品と部品ストック","url":"https://note.com/yzrswork/n/n65791c58ad52"}],"evidence":{"level":"used","description":"YZRS実使用品。メーカー仕様のSn60/Pb40、φ1.0mm、約3.0m、ヤニ入りという仕様と既存記事の使用記録に基づく推薦です。","sourceUrl":"https://www.goot.jp/products/detail/sd_83"},"enabled":true,"ownerReviewedAt":"2026-10-05"}});

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
