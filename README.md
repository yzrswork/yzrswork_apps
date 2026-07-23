# yzrswork_apps

や印工務店(yzrswork)の道具箱。電子工作と自作PCのための実用ツールを、単一HTML製のPWAとしてGitHub Pagesで配布する公開リポジトリ。

## 公開URL

- 正式URL(Cloudflare Pages): https://apps.yzrswork.com/
- 旧URL(GitHub Pages、並行稼働中): https://yzrswork.github.io/yzrswork_apps/
- note: https://note.com/yzrswork

## 収録ツール

| ツール | 説明 | パス |
|---|---|---|
| 装備ナビ | 電子工作の工具と部品ストックをステップ別にチェック | `kit/` |
| 工房の電卓 | LED抵抗、カラーコード、555タイマー、電池駆動時間 | `bench/` |
| はんだ付けナビ | はんだの種類と作業から適正なこて先温度。トラブル診断と道具選びつき | `handa/` |
| ピンアサインナビ | Raspberry Pi、Arduino Uno、ESP32のピン配置を色分け表示。落とし穴つき | `pinout/` |
| 配線ナビ(初級) | 初心者がつまずく部品の端子と極性を色分け表示。ジャック、DCジャック、タクトスイッチ、3PDT、可変抵抗、トグル、電解コンデンサ、LED、ダイオード、トランジスタ、三端子レギュレータ。テスターでの確かめ方つき | `haisen/` |
| メモリ選びナビ | ソケットからDDR規格、用途から容量を選ぶ | `mem/` |
| HDD選びナビ | WDの色とCMR/SMR判定 | `hdd/` |
| 自作PC構成プランナー | 構成サマリーと電源容量の目安 | `build/` |
| USB-C見分けナビ | 手持ちのUSB-Cケーブルの能力の見分け方と用途からの選び方。W数、転送速度、映像出力 | `usbc/` |
| 直し方ナビ | トラブル診断(Yahoo!メール、Windows共有、自作PCビープ、Obsidian同期) | `fixit/` |
| 接着剤選びナビ | くっつけたい素材2つから接着剤タイプと推奨製品を診断。見分け方つき | `glue/` |
| 塗れるくん | 住所から外壁塗装、DIY塗装ができるタイミングを気温、湿度等で判定。PWA | `nurerukun/` |
| ねじ下穴ナビ | タップ下穴、バカ穴、木ねじ下穴の径をねじサイズから早見 | `neji/` |
| プライバシーポリシー | GA4、広告、Amazonアソシエイトについて | `privacy/` |
| 運営者について | や印工務店、サイトの成り立ち、お問い合わせ | `about/` |

## 構成

- 各ツールは1フォルダ = 単一HTML + manifest + sw.js(PWA最小構成)。外部ライブラリなし
- リポジトリ直下の `index.html` がツール一覧のランディング
- `analytics.js` が全ツール共通のGA4計測(ID未設定時はno-op)
- `.nojekyll` でGitHub PagesのJekyll処理を無効化
- `shared/tokens.css` が全ツール共通のデザイントークン(paper系)。各ツールは `<link>` で読み込む(重複定義しない)
- `scripts/build.mjs` が各ツールの `app.json` から `sw.js` / `manifest.webmanifest` / `<head>`定型部分を生成する(`npm run build`)。生成物は必ずコミットする(Cloudflare Pages / GitHub Pagesともビルドレスでリポジトリ直下を配信するため)。`npm run build:check` はドリフト検知用(CIで実行)
- `_template/` が新規アプリのひな形。色、フォントは shared/tokens.css を使い、`<head>`は可能なら app.json + build.mjs に乗せる

## GitHub Pages

Settings -> Pages -> Source: **Deploy from a branch** -> Branch: **main** / **/(root)** -> Save。

## ライセンス

各ツールの詳細は各フォルダのindex.htmlを参照。

## AdSense 承認後の ads.txt 追加手順

承認前の中身のあるads.txtは審査上不利になるため、承認が下りるまでは意図的にファイルを置かない。

1. AdSense 管理画面で発行された `pub-XXXXXXXXXXXXXXXX`(パブリッシャーID)を控える
2. リポジトリ直下(`apps.yzrswork.com/ads.txt` として配信される場所)に `ads.txt` を新規作成し、以下の1行を記載する

   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```

3. push して Cloudflare Pages の自動デプロイを待つ
4. `https://apps.yzrswork.com/ads.txt` にアクセスして内容を確認する
