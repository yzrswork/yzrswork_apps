# yzrswork_apps

や印工務店(yzrswork)の道具箱。電子工作と自作PCのための実用ツールを、単一HTML製のPWAとしてGitHub Pagesで配布する公開リポジトリ。

## 公開URL

- 道具箱(トップ): https://yzrswork.github.io/yzrswork_apps/
- note: https://note.com/yzrswork

## 収録ツール

| ツール | 説明 | パス |
|---|---|---|
| 装備ナビ | 電子工作の工具と部品ストックをステップ別にチェック | `kit/` |
| 工房の電卓 | LED抵抗、カラーコード、555タイマー、電池駆動時間 | `bench/` |
| メモリ選びナビ | ソケットからDDR規格、用途から容量を選ぶ | `mem/` |
| HDD選びナビ | WDの色とCMR/SMR判定 | `hdd/` |
| 自作PC構成プランナー | 構成サマリーと電源容量の目安 | `build/` |
| 直し方ナビ | トラブル診断(Yahoo!メール、Windows共有、自作PCビープ、Obsidian同期) | `fixit/` |

## 構成

- 各ツールは1フォルダ = 単一HTML + manifest + sw.js(PWA最小構成)。外部ライブラリなし
- リポジトリ直下の `index.html` がツール一覧のランディング
- `analytics.js` が全ツール共通のGA4計測(ID未設定時はno-op)
- `.nojekyll` でGitHub PagesのJekyll処理を無効化

## GitHub Pages

Settings -> Pages -> Source: **Deploy from a branch** -> Branch: **main** / **/(root)** -> Save。

## ライセンス

各ツールの詳細は各フォルダのindex.htmlを参照。
