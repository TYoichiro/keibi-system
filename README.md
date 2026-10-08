# keibi-system

警備会社向けの管制業務支援システム。React + TypeScript / Hono + Node.js / PostgreSQL 18 のマルチテナントWebアプリです。

2026年10月8日、初回要件 F01〜F09 の実機能を実装しました。従来の画面をAPIへ接続し、登録・更新・配置確定をDBへ保存します。

## 利用できる機能

| 画面 | 実際に動作する操作 |
| --- | --- |
| ダッシュボード `/` | 自社・許可拠点の現場、公開配置、下書き、不足の集計 |
| 隊員 `/officers` | 検索、登録・編集、資格・在籍状態、変更履歴 |
| 取引先 `/clients` | 会社共通取引先の登録・編集、利用拠点の指定、変更履歴 |
| 現場 `/sites` | 拠点別現場の登録・編集、契約期間、集合場所、公開指示、内部メモ |
| 配置 `/assignments` | 勤務枠・下書き保存、人数・資格・重複等の確認、確定、改訂、破棄、取消 |
| 会社設定 `/settings` | 支店・登録枠・資格マスタ、利用者登録・招待・再招待・停止・連携変更、履歴 |
| 警備員 `/guard` | 認証した本人の確定予定、担当現場、本人情報、取消・担当解除の概要 |
| 認証 `/login`, `/account/activate`, `/account/security` | Googleログイン、7日招待の受諾、本人操作なし24時間・最長1か月のセッション、全端末ログアウト |

APIとDBで会社・拠点・役割・本人の権限を確認します。管理者のGoogle MFAは署名済みトークンの証拠がある場合のみ許可し、アプリ独自の利用者パスワードは発行しません。支店追加・登録枠の増加は本店の会社管理者に限定します。

勤怠・勤務希望・日報・教育詳細・自動通知・給与請求・帳票は次期対象です。従来の36ルートのモックは `/preview` 以下に残し、架空データを使用する参考画面と明示しています。例: `/preview/attendance`, `/preview/guard/reports`。モックの基準日は2026年10月4日のままです。

## 起動

必要環境: Node.js 24、npm 11、Docker Desktop（Linuxコンテナ）。Windows / PowerShellでは `npm.cmd` を使います。

```powershell
npm.cmd ci
npm.cmd run setup
docker compose up --build
```

`http://localhost:5173` を開きます。DB健康確認 → マイグレーション → API → フロントエンドの順に起動します。API・DBのホストポートは既定で閉じています。`npm.cmd run setup` は `.env` とDB秘密ファイルを用意し、既存ファイルを上書きしません。

実利用にはGoogle OAuthクライアントとSMTP設定が必要です。[実装・運用手順](docs/IMPLEMENTATION.md)に設定項目、秘密ファイル、`compose.auth.yaml` の使い方、初期管理者を会社・本人確認の上で招待する運営者CLIを記載しています。未設定時はGoogleログインを拒否し、架空利用者での代替ログインは用意していません。実Google往復・実メール到達は接続設定後の確認対象です。

ホスト側で開発・管理者処理をする場合は、ローカルポート用の構成を重ねます。

```powershell
docker compose -f compose.yaml -f compose.local.yaml up -d db
npm.cmd run db:migrate
npm.cmd run dev:backend
npm.cmd run dev:frontend
```

既存DBのアプリ用ユーザー初期設定・DBパスワードを再反映する場合は、DB起動後に `docker compose exec -T db sh /docker-entrypoint-initdb.d/10-app-user.sh` を実行し、`npm.cmd run db:migrate` またはComposeのマイグレーションを再実行します。秘密値はログやGitへ保存しません。

## テスト

```powershell
npx.cmd playwright install chromium --no-shell
npm.cmd run check
npm.cmd run security:audit
```

`check` は型チェック、Lint、API・DBテスト、両アプリのビルド、Playwrightのブラウザテストを実行します。テストごとに使い捨てPostgreSQL 18を起動し、架空2社・複数拠点・各役割のデータを準備します。既存DB・Composeボリュームはテストに使用しません。単独実行は `npm.cmd run test` / `npm.cmd run test:e2e`。DockerとPlaywright Chromiumが必要です。

実施した検証と限界は [開発状況](docs/DEVELOPMENT.md) を参照してください。PC・スマートフォンのスクリーンショットは `docs/mockups/live-*.png` に更新しています。

画面サンプル: 配置 [PC](docs/mockups/live-assignments-desktop.png) / [スマートフォン](docs/mockups/live-assignments-mobile.png)、隊員 [PC](docs/mockups/live-officers-desktop.png) / [スマートフォン](docs/mockups/live-officers-mobile.png)、本人予定 [スマートフォン](docs/mockups/live-guard-schedule-mobile.png)。

## 開発資料

- [AGENTS.md](AGENTS.md): 編集・検証・引き継ぎの基準。
- [開発状況・ソース構成](docs/DEVELOPMENT.md): 現在の実装、検証結果、モック段階の履歴。
- [実装・運用手順](docs/IMPLEMENTATION.md): 採用した方式、接続設定、マイグレーション、初期登録・復旧。
- [SECURITY.md](SECURITY.md): 認証、認可、テナント境界、秘密・DB権限、本番運用の残作業。
- [初回要件](docs/requirements/MVP_REQUIREMENTS.md) / [Googleログイン設計](docs/requirements/GOOGLE_AUTH_DESIGN.md): 確認済み方針と元の設計資料。
- [試験運用準備票](docs/requirements/PILOT_OPERATIONS.md) / [セキュリティチェックリスト](docs/SECURITY_CHECKLIST.md): 導入会社の運用判断・公開前の確認事項。

草案の未決項目をユーザーの確認済み回答へ書き換えてはいません。今回の「不明点は推奨方式を採用」の依頼に基づく選択は実装・運用手順に分けて記録しています。
