"""OGP画像 (icons/og-<slug>.png, 1200x630) をHTMLテンプレから一括描画する。

デザイン: B案「スペックラベル」(2026-11-04 確定)
  左 = カテゴリ札 + 日本語タイトル + 英語名(セリフ体イタリック) + ブランド
  右 = CHECK POINTS (キーワード3つ) + URL
  配色は shared/tokens.css のハイブリッド配色に合わせる。

noteのリンクカードは左右を約12%ずつクロップするため、要素はすべて横170〜1030pxに収めている。

使い方:
  pip install playwright pillow && python -m playwright install chromium
  python scripts/og-images.py            # 全アプリ
  python scripts/og-images.py mem hdd    # 指定アプリだけ
描画後は各 app.json (dealsは site/catalog.json) の ogImage の ?v= を更新し、npm run build を実行する。
フォントは描画時に Google Fonts から読み込む(ネット接続が必要)。
"""
import html
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"

# slug, カテゴリ, タイトル("|"で改行), 英語名, CHECK POINTS(3つ)
# タイトル内の [xx] は小さなバッジとして描画する。
APPS = [
    ("mem",    "PC BUILD",    "メモリ選びナビ",          "Memory Picker",       ["Socket", "Use", "Dual-channel"]),
    ("hdd",    "PC BUILD",    "HDD選びナビ",             "HDD Picker",          ["WD Color", "CMR / SMR", "Model check"]),
    ("build",  "PC BUILD",    "自作PC|構成プランナー",    "PC Build Planner",    ["DDR", "PSU", "Checklist"]),
    ("usbc",   "GADGET",      "USB-C|見分けナビ",         "USB-C Cable Advisor", ["Power", "Speed", "Video"]),
    ("fixit",  "TROUBLE",     "直し方ナビ",              "Fix-it Navigator",    ["Q&A", "Diagnose", "Fix"]),
    ("bench",  "ELECTRONICS", "工房の電卓",              "Maker's Bench",       ["Ohm's law", "LED", "Color code"]),
    ("kit",    "ELECTRONICS", "装備ナビ",                "Maker's Starter Kit", ["Tools", "Parts", "Shopping list"]),
    ("handa",  "ELECTRONICS", "はんだ付けナビ",          "Soldering Guide",     ["Temperature", "Trouble", "Tools"]),
    ("haisen", "ELECTRONICS", "配線ナビ[初級]",           "Wiring Basics",       ["Pins", "Polarity", "Tester"]),
    ("pinout", "ELECTRONICS", "ピンアサインナビ",        "Pinout Reference",    ["Raspberry Pi", "Arduino", "ESP32"]),
    ("glue",   "DIY",         "接着剤選びナビ",          "Glue Picker",         ["Material", "Type", "Tips"]),
    ("neji",   "DIY",         "ねじ下穴ナビ",            "Pilot Hole Guide",    ["Tap drill", "Clearance", "Wood screw"]),
    ("deals",  "DEALS",       "YZRS DEALS",              "Gear Picks",          ["Use", "Reason", "Spec"]),
]

CHECK = "&#10003;"
TITLE_BOX = 500   # タイトル列の文字組み幅(px)
TITLE_MAX = 96    # タイトル最大サイズ(px)

TEMPLATE = """<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Noto+Sans+JP:wght@700;900&family=EB+Garamond:ital,wght@1,500&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
*{box-sizing:border-box}
:root{--paper2:#EEF1F4;--ink:#1B2530;--muted:#5D6B78;--line:#D5DBE2;--tc:#B5451B;--act:#3F5F7A;--actd:#2B4256;--tint:#E9EFF4}
body{background:var(--paper2);font-family:"Noto Sans JP",sans-serif;color:var(--ink)}
.card{position:absolute;left:170px;top:85px;width:860px;height:460px;background:#fff;border-radius:18px;overflow:hidden;
 box-shadow:0 1px 2px rgba(27,37,48,.06),0 18px 40px rgba(27,37,48,.08);display:grid;grid-template-columns:1fr 262px}
.l{padding:34px 36px 30px 40px;display:flex;flex-direction:column}
.cat{align-self:flex-start;font-family:"DM Mono",monospace;font-size:19px;letter-spacing:.14em;color:#fff;background:var(--act);padding:6px 12px;border-radius:6px}
h1{margin:auto 0 0;font-weight:900;line-height:1.1;white-space:nowrap;letter-spacing:.01em}
h1 .badge{display:inline-block;font-size:.42em;font-weight:700;color:var(--muted);border:2px solid var(--line);border-radius:8px;padding:2px 10px;margin-left:.35em;vertical-align:.45em;line-height:1.3}
.en{margin:8px 0 auto;font-family:"EB Garamond",serif;font-style:italic;font-weight:500;font-size:40px;line-height:1.1;color:var(--tc)}
.brand{font-family:"DM Mono",monospace;font-size:19px;letter-spacing:.12em;color:var(--muted)}
.brand b{color:var(--ink);font-weight:500}
.r{background:var(--tint);padding:36px 26px 30px;display:flex;flex-direction:column;border-left:1.5px dashed #B9C7D4}
.rh{font-family:"DM Mono",monospace;font-size:16px;letter-spacing:.16em;color:var(--act);margin-bottom:10px}
.it{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:1.5px solid #D3DDE7;font-weight:700;font-size:25px;color:var(--actd);white-space:nowrap}
.ck{width:30px;height:30px;border-radius:50%;background:var(--tc);color:#fff;font-size:18px;display:grid;place-items:center;flex:none}
.url{margin-top:auto;font-family:"DM Mono",monospace;font-size:17px;color:var(--muted)}
</style></head><body>
<div class="card">
  <div class="l">
    <span class="cat">{cat}</span>
    <h1 style="font-size:{fs}px">{title}</h1>
    <div class="en">{en}</div>
    <div class="brand"><b>YZRS WORK</b> / 作る人の道具箱</div>
  </div>
  <div class="r">
    <div class="rh">CHECK POINTS</div>
    {items}
    <div class="url">apps.yzrswork.com</div>
  </div>
</div>
<script>
  // 念のため: 項目が列幅を超えたら縮小
  window.fit = () => document.querySelectorAll('.it').forEach(el => {
    let s = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && s > 16) { s -= 1; el.style.fontSize = s + 'px'; }
  });
</script>
</body></html>"""


def em_width(text):
    """全角=1em、ASCII=0.62em としておおよその文字幅を返す。"""
    return sum(0.62 if ord(ch) < 128 else 1.0 for ch in text)


def render_title(title):
    lines = title.split("|")
    widths = []
    out = []
    for ln in lines:
        badge = ""
        if "[" in ln:
            ln, rest = ln.split("[", 1)
            badge_text = rest.rstrip("]")
            badge = f'<span class="badge">{html.escape(badge_text)}</span>'
            widths.append(em_width(ln) + 0.42 * em_width(badge_text) + 0.7)
        else:
            widths.append(em_width(ln))
        out.append(html.escape(ln) + badge)
    fs = min(TITLE_MAX, int(TITLE_BOX / max(widths)))
    if len(lines) > 1:
        fs = min(fs, 76)
    return "<br>".join(out), fs


def build(app):
    slug, cat, title, en, checks = app
    title_html, fs = render_title(title)
    items = "".join(f'<div class="it"><span class="ck">{CHECK}</span>{html.escape(c)}</div>' for c in checks)
    return (TEMPLATE.replace("{cat}", html.escape(cat)).replace("{fs}", str(fs))
            .replace("{title}", title_html).replace("{en}", html.escape(en)).replace("{items}", items))


def main(only):
    targets = [a for a in APPS if not only or a[0] in only]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        for app in targets:
            page.set_content(build(app), wait_until="networkidle")
            page.evaluate("document.fonts.ready.then(() => window.fit())")
            page.wait_for_timeout(150)
            dest = OUT / f"og-{app[0]}.png"
            page.screenshot(path=str(dest))
            print("rendered", dest.relative_to(ROOT))
        browser.close()


if __name__ == "__main__":
    main(set(sys.argv[1:]))
