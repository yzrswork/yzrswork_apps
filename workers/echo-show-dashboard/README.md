# Echo Show Dashboard Worker

2026-10-05 に本番 `echo-show-dashboard` から取得した Worker を管理対象に追加し、AI 使用量の入口を拡張する。既存コードの取り込みと AI 追加を別コミットにしている。

## 既存の経路

- `GET /dashboard`: `DASHBOARD_READ_TOKEN` で認証し、`dashboard:latest` を配信する。
- `POST /dashboard/publish`: `DASHBOARD_WRITE_TOKEN` で認証し、従来の v1 Snapshot を `dashboard:latest` に保存する。検証・応答・保存先は従来どおり。
- `POST /dashboard/refresh`: `DASHBOARD_REFRESH_TOKEN` で認証し、既存 GitHub Actions を dispatch する。
- Snapshot の LKG は Butler 側が保持する。Android の現行作業ツリーは `C:\EchoShow\butler-dashboard`。この追加では Android アプリを変更しない。

## AI の送信

`POST /dashboard/ai` に、AI専用の `Authorization: Bearer <DASHBOARD_AI_WRITE_TOKEN>` と `Content-Type: application/json` を付けて次の形だけを送る。`DASHBOARD_WRITE_TOKEN` は従来の `/dashboard/publish` 専用のまま共有しない。送信時は `updatedAt` を実際の観測時刻に置き換える。

```json
{
  "source": "token-monitor",
  "updatedAt": "2026-10-05T18:57:34.8092192+09:00",
  "ai": {
    "codex": {
      "plan": "Plus",
      "status": "ok",
      "stale": false,
      "todayTokens": 6944007,
      "session": {
        "remainingPercent": 65,
        "resetsAt": "2026-10-05T13:04:01.000Z"
      },
      "weekly": {
        "remainingPercent": 52,
        "resetsAt": "2026-10-10T23:07:33.000Z"
      }
    }
  }
}
```

全項目必須。全階層で未知フィールドを拒否するため、`accountEmail`、`accountKey`、OAuth、secret 等を含む入力は保存されない。送信値をログや検証エラーに含めない。

- 本文は UTF-8 で最大 8 KiB。Content-Length がなくても読み取り量を制限する。
- `todayTokens` は 0 以上の安全な整数、残量は 0〜100 の有限数、`stale` は boolean。
- 日時はタイムゾーン付き RFC3339。実在しない日付を拒否し、小数秒は 1〜9 桁に対応する。`updatedAt` がサーバー時刻より5分以上未来なら拒否する。
- `source` は最大64文字の英数と `._-`、`status` は英字開始で最大32文字の英数と `_-`。`plan` は最大32文字の文字・数字と空白 `._+-` の表示ラベル。
- 成功は200、認証不正は401、形式不正は400、本文超過は413、Content-Type 不正は415、KV 書き込み失敗は500。

## 保存と合成

AI 入口は `dashboard:latest` を読み書きしない。検証済みの最小 JSON を `dashboard:ai` に保存する。`status == "ok"`、`stale == false`、観測から15分以内の正常データだけを `dashboard:ai:lkg` にも保存する。

正常時の保存順は AI LKG → AI latest。KV の2キー間はトランザクションではなく、片方の書き込みが失敗した場合は500を返す。既存 Snapshot の保存・配信には影響しない。

`GET /dashboard` では既存 Snapshot に次を追加する。既存の `source`、`generated_at`、TODAY、NEXT 等は保持し、KV の Snapshot 自体は更新しない。

```json
{
  "ai": {
    "source": "token-monitor",
    "updatedAt": "2026-10-05T18:57:34.8092192+09:00",
    "codex": {
      "plan": "Plus",
      "status": "ok",
      "stale": false,
      "todayTokens": 6944007,
      "session": { "remainingPercent": 65, "resetsAt": "2026-10-05T13:04:01.000Z" },
      "weekly": { "remainingPercent": 52, "resetsAt": "2026-10-10T23:07:33.000Z" }
    }
  }
}
```

AI latest が欠落・不正・読取エラー・stale・非 `ok`・15分超の場合は、正常観測として保存した AI LKG を `codex.stale: true` で返す。`updatedAt` は元の観測時刻を保持する。LKG が利用できず latest の構造が妥当なら、その値を stale として返す。両方とも利用不能なら元の Snapshot をそのまま返す。

Butler の受信上限128 KiBを合成後に超える場合も、AI を追加せず元の Snapshot を返す。AI の合成は既存 Snapshot が取得できた場合だけで、既存404・500・認証エラーの意味を変えない。

## CODEX TEMP（任意のWindowsホスト計測）

`POST /dashboard/host` は専用 `DASHBOARD_HOST_WRITE_TOKEN` と JSON 本文（最大2 KiB）で認証する。
read / publish / AI credential では書き込めない。Windowsから送る項目は次の5種類だけで、パス・ホスト名・ファイル一覧は含めない。

```json
{
  "schemaVersion": 1,
  "source": "windows-codex-temp",
  "measuredAt": "2026-10-10T09:00:00.000Z",
  "codexTemp": { "bytes": 6912, "status": "ok" }
}
```

上記は契約説明用の例。実際の送信値は実測値に置き換える。
`bytes` は0〜16 TiBの整数。`ok` / `no-matches` のみ数値を許可し、`no-matches` は0限定。
`partial` / `access-denied` / `timeout` / `error` は明示的 `null` 必須。欠損・未知項目・不正な日付・未来時刻は400。
同じまたは古い観測時刻は409。成功200、認証401、サイズ413、Content-Type415、KV障害500。

KVはCASを提供しないため、観測を `dashboard:host:valid:<逆順時刻>` または
`dashboard:host:failure:<逆順時刻>` の不変キーに保存する（保存期限30日）。並列の古いPOSTが後から完了しても新しい観測キーを上書きしない。
GETは各prefixの先頭1件だけを参照する。KVの分散反映は即時保証ではなく、ネイティブ側でも時刻の巻き戻りを防ぐ。
TODAY / AI / 他KVキーを書き換えない。

`GET /dashboard` に任意の `host` を追加する。形はPOSTと同じで、トップレベルにboolean `stale` を追加する。
有効観測から15分超、または後続の失敗観測がある場合は前回有効値を `stale: true` として返す。
前回有効値がなければ失敗値（bytes:null）またはhost省略。host障害は既存TODAY/AIの応答を無効にしない。
元の応答にhostがなく取得もできない場合は元の本文をそのまま返す。合成後128 KiB上限を維持する。

Windows処理・5分周期統合・表示は `yzrswork/techo5` の `docs/yzrs-operational-polish-03.md` を参照。
新しいsecretの登録と本番配備は明示的なクラウド承認境界。秘密値はチャットや引数に含めず、既存DPAPI＋標準入力の手順を使う。

## 検証とリリース手順

```sh
npm test
npm run build
npm run check
npm run test:echo-dashboard
npx wrangler@4.119.0 deploy --dry-run --config workers/echo-show-dashboard/wrangler.toml
```

テストはメモリー内 KV と GitHub dispatch のモックを使用し、認証情報・本番への書き込み・実通信を必要としない。通常のリポジトリ CI でも AI と既存 Commerce のテストを実行する。

`wrangler.toml` は既存の Worker 名・KV・compatibility date を使用し、`keep_vars` で既存の GitHub dispatch 変数を保持する。`DASHBOARD_AI_WRITE_TOKEN` は Worker Secret として別途設定し、Windows の Token Monitor sender だけに保持する。既存の `DASHBOARD_WRITE_TOKEN` / read / refresh secret は変更しない。PR 作成では本番デプロイを実施しない。Butler 上の AI 表示 UI と Token Monitor の自動送信設定は、この Worker 追加の対象に含めない。
