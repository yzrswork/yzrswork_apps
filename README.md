# yzrswork_apps

や印工務店(yzrswork)のアプリたち。単一HTML製のPWAを GitHub Pages で配布する公開リポジトリ。
電子工作 x メイカー x AIの掛け算で、小さく便利なニッチツールを並べていく。

## 公開URL

- 一覧(ランディング): https://yzrswork.github.io/yzrswork_apps/
- 塗れるくん: https://yzrswork.github.io/yzrswork_apps/nurerukun/

## 収録アプリ

| アプリ | 説明 | パス |
|---|---|---|
| 塗れるくん | 住所から外壁塗装の可否(気温・湿度・露点・降水・風)を判定 | `nurerukun/` |

## 構成

- 各アプリは1フォルダ = 単一HTML + `manifest.json` + `sw.js`(PWA最小構成)。外部ライブラリなし
- リポジトリ直下の `index.html` がアプリ一覧のランディング
- `.nojekyll` を置き、GitHub Pages の Jekyll 処理を無効化(アンダースコア始まりのパス等をそのまま配信)

## GitHub Pages の有効化(初回のみ)

Settings -> Pages -> Build and deployment -> Source: **Deploy from a branch** -> Branch: **main** / **/(root)** -> Save。
数十秒で上記URLが有効になる。

## ライセンス・運用メモ

- Open-Meteo の無料枠は非商用向け。アフィリエイトを入れる場合の扱いは公開前に確認(必要なら気象庁データへ差し替え)
- 各アプリの詳細・判定ロジックは各フォルダの README を参照
