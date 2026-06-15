# 塗れるくん 天気プロキシ (Cloudflare Worker)

塗れるくんの天気データ(met.no / MET Norway)を、規約に準拠した形でブラウザへ渡すための無料プロキシ。

## なぜproxyを挟むのか

met.no はデータが CC BY 4.0 で **商用利用OK**。ただし API 利用規約で以下を求めている。

1. 連絡先を含む **識別可能な User-Agent** を送ること
2. **ブラウザからの直アクセスは本番非推奨**(CORS も通らない)
3. ある程度のトラフィックには **caching proxy を必ず置く** こと

ブラウザの `fetch` では User-Agent を付けられないため、Worker を1枚挟んで
「正しい UA + エッジキャッシュ + CORS」を満たし、**商用でも規約違反にならない状態**にする。
(Open-Meteo の無料版は非商用限定だったため met.no へ移行した経緯あり)

## デプロイ手順(無料・カード不要)

1. https://dash.cloudflare.com にログイン(無料アカウントを作成)
2. Workers & Pages -> Create -> Worker -> 名前を付ける(例: `nurerukun-weather`)
3. 「Edit code」を開き、`worker.js` の中身を全部貼り付けて **Deploy**
4. 発行された URL を控える
   例: `https://nurerukun-weather.<自分のサブドメイン>.workers.dev`
5. `nurerukun/index.html` 冒頭の `WEATHER_PROXY` にその URL を設定して push

現在の本番 Worker: `https://nurerukun-weather.yzrswork.workers.dev`(デプロイ済み)

## 動作確認

ブラウザかコマンドで:

```
https://<your-worker>.workers.dev/forecast?lat=35.18&lon=136.9
```

met.no の JSON が返り、レスポンスヘッダに `Access-Control-Allow-Origin` が付いていれば成功。

## 編集ポイント(worker.js 冒頭)

| 定数 | 意味 |
|---|---|
| `CONTACT` | met.no に申告する連絡先(公開URLかメール)。既定はnoteプロフィール |
| `APP_URL` | アプリのURL(User-Agentに入る) |
| `ALLOW_ORIGINS` | このproxyを使ってよいオリジン。公開サイトのオリジンを入れる(open proxy化を防ぐ) |
| `CACHE_TTL` | キャッシュ秒数(既定900=15分) |

## 帰属表示(CC BY 4.0)

アプリ側フッターに以下を明記済み:
- 提供元: MET Norway (met.no) へのリンク
- ライセンス: CC BY 4.0 へのリンク
- 加工の明示: 露点は本アプリが算出
