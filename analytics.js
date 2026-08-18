// yzrswork_apps 共通アナリティクス
// 使い方: 下の ID を GA4 の測定ID (G-XXXXXXXXXX) に書き換えるだけ。
// 全ページがこのファイルを読み込んでいるので、ここ1か所の変更で計測が有効になる。
// 未設定 (XXXX のまま) の間は何もしない安全設計。
(function () {
  var ID = "G-V97JH95NYC";
  window.yzrsTrack = function (eventName, params) {
    if (!window.gtag) return;
    window.gtag("event", eventName, params || {});
  };
  if (ID.indexOf("XXXX") > -1) return; // 未設定なら no-op
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", ID);
})();

// bench/index.html は巨大な単一HTMLのため、Engineering Notation の
// femto(F/f)分類補正だけを小さなアプリ固有モジュールに隔離する。
if (/\/bench\/?$/.test(location.pathname)) {
  var benchEngFix = document.createElement("script");
  benchEngFix.src = "eng-notation-fix.js";
  benchEngFix.defer = true;
  document.head.appendChild(benchEngFix);
}

function yzrsAppName() {
  return location.pathname.replace(/\/$/, "").split("/").pop() || "root";
}

// アフィリエイトリンクをリンク上でも明示し、規約向けrelを揃える。
// 動的に結果へ追加されるリンクもMutationObserverで同じ扱いにする。
function yzrsPrepareAffiliateLinks(root) {
  var scope = root && root.querySelectorAll ? root : document;
  var links = [];
  if (scope.matches && scope.matches('a[href*="amazon.co.jp"]')) links.push(scope);
  links = links.concat(Array.prototype.slice.call(scope.querySelectorAll('a[href*="amazon.co.jp"]')));

  links.forEach(function (a) {
    if (a.dataset.yzrsAffiliateReady === "1") return;
    a.dataset.yzrsAffiliateReady = "1";

    var rel = new Set((a.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
    ["noopener", "noreferrer", "sponsored", "nofollow"].forEach(function (value) { rel.add(value); });
    a.setAttribute("rel", Array.from(rel).join(" "));

    var badge = document.createElement("span");
    badge.textContent = "広告";
    badge.setAttribute("aria-label", "Amazonアソシエイト広告");
    badge.style.cssText = "display:inline-block;margin-right:.45em;padding:.08em .42em;border:1px solid currentColor;border-radius:999px;font-size:.68em;font-weight:700;line-height:1.35;vertical-align:.12em;opacity:.82";
    a.insertBefore(badge, a.firstChild);
  });
}

function yzrsStartAffiliateObserver() {
  yzrsPrepareAffiliateLinks(document);
  if (!window.MutationObserver || !document.body) return;
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      if (record.type === "attributes" && record.target) {
        yzrsPrepareAffiliateLinks(record.target);
      }
      Array.prototype.forEach.call(record.addedNodes, function (node) {
        if (node && node.nodeType === 1) yzrsPrepareAffiliateLinks(node);
      });
    });
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"]
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", yzrsStartAffiliateObserver, { once: true });
} else {
  yzrsStartAffiliateObserver();
}

// 最初の実操作だけをtool_startとして送る。住所、計算値、診断文など入力内容は送らない。
var yzrsToolStarted = false;
function yzrsTrackToolStart(e) {
  if (yzrsToolStarted || !window.yzrsTrack) return;
  var target = e.target;
  if (!target || !target.closest) return;
  var control = target.closest("button, select, input[type=checkbox], input[type=radio], input[type=text], input[type=number]");
  if (!control) return;
  yzrsToolStarted = true;
  window.yzrsTrack("tool_start", {
    app_name: yzrsAppName(),
    control_type: (control.tagName || "control").toLowerCase()
  });
}
document.addEventListener("click", yzrsTrackToolStart, true);
document.addEventListener("change", yzrsTrackToolStart, true);

// 固定値として許可する結果種別。アプリから自由入力や表示文を渡さない。
var YZRS_RESULT_CATEGORIES = Object.freeze({
  electronics: Object.freeze([
    "electronics_kit",
    "ohm",
    "led_resistor",
    "color_code",
    "voltage_divider",
    "timer_555",
    "battery_runtime",
    "engineering_notation",
    "solder_temperature",
    "solder_troubleshooting",
    "solder_tools",
    "pinout_board",
    "terminal_reference"
  ]),
  pc: Object.freeze([
    "memory_recommendation",
    "hdd_recommendation",
    "hdd_model_check",
    "pc_build_summary",
    "usb_c_check",
    "usb_c_recommendation"
  ]),
  diy: Object.freeze([
    "adhesive_recommendation",
    "material_identification",
    "paint_weather_result",
    "tap_hole",
    "clearance_hole",
    "wood_screw_hole"
  ]),
  troubleshooting: Object.freeze(["troubleshooting_step"])
});

var yzrsResultCompleted = Object.create(null);
window.yzrsTrackResult = function (resultType, category) {
  var allowed = YZRS_RESULT_CATEGORIES[category];
  if (!allowed || allowed.indexOf(resultType) === -1 || !window.yzrsTrack) return;

  var params = {
    app_name: yzrsAppName(),
    result_type: resultType,
    category: category
  };
  window.yzrsTrack("result_view", params);

  if (!yzrsResultCompleted[resultType]) {
    yzrsResultCompleted[resultType] = true;
    window.yzrsTrack("tool_complete", params);
  }
};

function yzrsIsAmazonLink(a) {
  try {
    return /^(?:www\.)?amazon\.co\.jp$/i.test(new URL(a.href, location.href).hostname);
  } catch (_) {
    return false;
  }
}

function yzrsLinkDomain(a) {
  try {
    var hostname = new URL(a.href, location.href).hostname.toLowerCase();
    return hostname.replace(/^www\./, "").slice(0, 80) || "other";
  } catch (_) {
    return "other";
  }
}

function yzrsDestinationType(a, domain, relatedSlug) {
  if (relatedSlug) return "related_tool";
  if (domain === "amazon.co.jp") return "amazon";
  if (domain === "note.com") return "note";
  return "external";
}

// アフィリエイトリンクと関連ツール導線のクリック計測。
// URL、検索語、表示ラベル、自由入力はイベントへ送らない。
document.addEventListener("click", function (e) {
  var a = e.target && e.target.closest && e.target.closest("a");
  if (!a || !window.yzrsTrack) return;

  var relatedSlug = a.getAttribute("data-related-slug");
  if (relatedSlug) {
    window.yzrsTrack("related_tool_click", {
      app_name: yzrsAppName(),
      destination_slug: relatedSlug
    });
  }

  var domain = yzrsLinkDomain(a);
  var destinationType = yzrsDestinationType(a, domain, relatedSlug);
  var isAmazon = yzrsIsAmazonLink(a);

  if (isAmazon) {
    var productKey = a.getAttribute("data-product-key");
    var itemKey = productKey && /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(productKey)
      ? productKey
      : "unclassified";
    window.yzrsTrack("affiliate_click", {
      app_name: yzrsAppName(),
      item_key: itemKey,
      link_type: /\/dp\//.test(a.href) ? "product" : "search"
    });
  }

  // Related links are same-origin and are measured by related_tool_click only.
  try {
    if (new URL(a.href, location.href).origin === location.origin) return;
  } catch (_) {
    return;
  }
  window.yzrsTrack("outbound_click", {
    app_name: yzrsAppName(),
    link_domain: domain,
    destination_type: destinationType
  });
}, true);
