# 塗れるくん 複合天気プロキシ (Cloudflare Worker)

塗れるくんで使う次のデータをまとめてブラウザへ返すWorker。

- MET Norway: 地点別の気温・湿度・降水量・風速
- 気象庁: 予報区域別の時間帯降水確率
- 国土地理院: 座標から市区町村コードを取得

MET Norwayの従来レスポンス形式は維持し、`yzrswork.jma`に気象庁データを追加する。Workerと静的アプリを別々に更新しても旧アプリが壊れない構成。

## 地域判定

1. 国土地理院の逆ジオコーダで座標から5桁の市区町村コードを取得
2. 気象庁の地域階層データで、市区町村を一次細分区域と予報担当官署へ変換
3. 担当官署の府県天気予報から、該当する一次細分区域の降水確率を抽出

政令指定都市の区は、気象庁側の市単位コードへフォールバックする。気象庁側の取得や地域判定に失敗した場合もMET Norwayの地点予報は返し、`yzrswork.jma.available`を`false`にする。

## キャッシュ

| データ | TTL |
|---|---:|
| MET Norway地点予報 | 15分 |
| 気象庁府県天気予報 | 30分 |
| 気象庁地域階層 | 24時間 |
| 国土地理院の逆ジオコード結果 | 24時間 |

## デプロイ

このディレクトリで実行する。

```powershell
npx wrangler deploy
```

現在の本番Worker:

`https://nurerukun-weather.yzrswork.workers.dev`

## 動作確認

```text
https://nurerukun-weather.yzrswork.workers.dev/health
https://nurerukun-weather.yzrswork.workers.dev/forecast?lat=35.6812&lon=139.7671
```

`/forecast`のレスポンスで次を確認する。

- `properties.timeseries`: MET Norwayの地点予報
- `yzrswork.jma.available`: 気象庁データの取得可否
- `yzrswork.jma.areaName`: 判定された一次細分区域
- `yzrswork.jma.slots`: 時間帯別の降水確率

## 利用条件と表示

- MET Norway: CC BY 4.0。識別可能なUser-Agentとキャッシュプロキシを使用
- 気象庁: 公共データ利用規約に従い、アプリ側で出典と加工を明記
- 国土地理院: 住所・地域判定の提供元としてアプリ側に表示
