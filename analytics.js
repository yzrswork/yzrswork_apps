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
      Array.prototype.forEach.call(record.addedNodes, function (node) {
        if (node && node.nodeType === 1) yzrsPrepareAffiliateLinks(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
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
  if (!control || !control.closest("main, .wrap")) return;
  yzrsToolStarted = true;
  window.yzrsTrack("tool_start", {
    app_name: yzrsAppName(),
    control_type: (control.tagName || "control").toLowerCase()
  });
}
document.addEventListener("click", yzrsTrackToolStart, true);
document.addEventListener("change", yzrsTrackToolStart, true);

// アフィリエイトリンクと関連ツール導線のクリック計測。
// data-track-label を付けたリンクはその固定ラベルを使い、自由入力は送らない。
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

  if (a.href.indexOf("amazon.co.jp") === -1) return;
  var label = a.getAttribute("data-track-label") || "amazon-link";
  var linkType = /\/dp\//.test(a.href) ? "product" : "search";
  window.yzrsTrack("affiliate_click", {
    app_name: yzrsAppName(),
    item_label: label.slice(0, 100),
    link_type: linkType
  });
  window.yzrsTrack("outbound_click", {
    link_url: a.href,
    link_domain: "amazon.co.jp",
    item_label: label.slice(0, 100),
    app_name: yzrsAppName()
  });
}, true);
