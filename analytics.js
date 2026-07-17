// yzrswork_apps 共通アナリティクス
// 使い方: 下の ID を GA4 の測定ID (G-XXXXXXXXXX) に書き換えるだけ。
// 全ページがこのファイルを読み込んでいるので、ここ1か所の変更で計測が有効になる。
// 未設定 (XXXX のまま) の間は何もしない安全設計。
(function () {
  var ID = "G-V97JH95NYC";
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

// アフィリエイトリンクのクリック計測。
// data-track-label を付けたリンクはそのラベルを、無ければリンクテキストをitem_labelとして送る。
document.addEventListener("click", function (e) {
  var a = e.target && e.target.closest && e.target.closest('a[href*="amazon.co.jp"]');
  if (!a || !window.gtag) return;
  gtag("event", "outbound_click", {
    link_url: a.href,
    link_domain: "amazon.co.jp",
    item_label: a.getAttribute("data-track-label") || (a.textContent || "").trim().slice(0, 100),
    app_name: location.pathname.replace(/\/$/, "").split("/").pop() || "root"
  });
}, true);
