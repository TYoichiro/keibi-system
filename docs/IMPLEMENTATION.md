# 初回機能の実装・運用手順

更新日: 2026年10月8日（日本時間）

最新の実装依頼に基づき、初回要件 F01〜F09 の認証・業務API・DB保存・画面接続と常設テストを追加した。不明点は推奨方式を採用するという指示に従い、下記の細部を選択した。過去の草案にある「今回は実装しない」「確認待ち」は資料作成時点の記録であり、現在の実装状況は本資料と [DEVELOPMENT](DEVELOPMENT.md) を参照する。

## 実機能と参考画面

| URL | 操作範囲 |
| --- | --- |
| `/login`, `/guard/login` | Google OAuth 2.0 / OIDC で本人認証。利用許可・連携済み識別子を確認 |
| `/account/activate` | メール招待の内容・期限確認、本人Googleメールと照合して初回連携 |
| `/account/reset`, `/account/mfa` | Google側の回復・二段階認証設定への案内 |
| `/account/security` | 本人のGoogle連携情報、現在端末・全端末のログアウト |
| `/` | 保存された現場・公開配置・下書き・不足人数の集計 |
| `/officers`, `/officers/new`, `/officers/edit` | 隊員検索・詳細・登録・編集・在籍状態・資格基本情報・履歴 |
| `/clients`, `/clients/new`, `/clients/edit` | 会社共通取引先の登録・編集・拠点利用関係・履歴。編集は会社管理者のみ |
| `/sites`, `/sites/new`, `/sites/edit` | 拠点別現場・契約期間・集合場所・公開指示・内部メモの登録・編集・履歴 |
| `/assignments`, `/assignments/new`, `/assignments/edit` | 日別勤務枠、下書き・確定・改訂・破棄・取消、版・条件確認 |
| `/settings` | 本店管理者の支店追加・対象拠点の増枠、資格マスタ |
| `/settings?section=members` | 管理者の利用者事前登録・招待・再招待・停止・役割所属変更・Google連携変更承認 |
| `/settings?section=history` | 業務変更と、管理者限定の会社・利用者変更履歴。操作者・理由・変更内容を確認 |
| `/guard`, `/guard/schedule`, `/guard/site`, `/guard/contact`, `/guard/profile` | ログインした本人の確定予定・過去取消概要・公開期間内の担当現場・本人基本情報 |
| `/preview` 以下 | 従来のモック。例 `/preview/attendance`, `/preview/guard/reports`。架空サンプルのみで保存しない |

勤怠・勤務希望・日報・教育の詳細管理・通知既読・給与請求・帳票出力は、確認済みの初回範囲の外にある。通常ナビゲーションには初回機能を表示し、旧36ルートの見本は `/preview` 以下へ分離した。実機能では固定G004やフロントエンドのサンプルを認可・件数の根拠にしない。

## 採用した細部

| 論点 | 実装した方式 |
| --- | --- |
| 管理者のMFA | Googleが署名したIDトークンの `amr` に `mfa` がある場合のみ許可。欠落時は `AUTH_POLICY_REQUIRED`。自己申告・運営者の手入力による迂回を設けない |
| 許可アカウント | 検証済みGoogleメールのGmail系ドメイン、または署名検証済み `hd` を持つWorkspace。メールから会社・役割を自動作成しない |
| 1か月の計算 | ログイン完了のJST翌月同日時。該当日がない場合は翌月末同時刻。絶対期限を操作で延長しない |
| 本人操作 | 明示的なブラウザの操作を `/api/auth/activity` に通知。GET・バックグラウンド再取得ではアイドル期限を延長しない。失効後の操作で復活させない |
| 初期登録・復旧 | 運営者CLIのみ。担当者名、会社確認・本人確認の証跡参照、理由を必須とし監査に保存 |
| 招待配信 | SMTP。未設定は配送待ち、失敗は送信失敗として表示。招待トークンの生値をDB・業務応答・監査・標準出力へ保存しない。再招待で新リンクを発行 |
| 共有取引先 | 会社管理者のみ編集。利用可能な拠点を管理者が明示登録。利用関係に現場が残る間は解除を拒否 |
| 現場責任者・確認 | 配置隊員から責任者を1名。確定時に勤務可能・移動休息の両確認を必須。改訂作成時は確認をリセット |
| 資格 | 会社設定の資格基本情報を用い、確認済み・有効状態・必要人数を判定。夜勤全体が有効期間内か確認。法的資格適合の証明書発行機能はない |
| 契約・資格終了日 | JST当日を含む。翌日00:00終了は期間内、翌日06:00までの夜勤は期間外 |
| 過剰配置 | 必要人数以上を許可。下書きで不足を表示し、不足した状態の確定は拒否 |
| 過去日時 | 初回登録・確定は未来の勤務を対象とする。開始後の変更は会社管理者のみ。終了後の通常改訂・取消は拒否し、別途訂正手順の対象とする |
| 影響のあるマスタ変更 | 未終了公開勤務を無効にする退職・休職・資格変更・現場停止・契約短縮等は拒否。先に配置の改訂・取消で解消する |
| 所属異動 | 通常画面の隊員・現場所属変更を制限。隊員に利用者対応や勤務履歴がある場合、現場に勤務履歴がある場合の異動は専用手順の対象。過去勤務の所属を付け替えない |
| 本人の現場詳細 | 確定・担当中で予定終了より前に取得可能。終了・取消・担当解除後は日時・現場名・状態の概要のみ |
| 入替・改訂 | 改訂案の作成・失敗では旧公開版を維持。入替で外れた本人には旧日時の担当解除概要を返す |
| 取消後の再開 | 取消履歴を保持し、新しい勤務枠の下書きから登録する |
| 同時処理 | 初回の規模に合わせ会社単位のトランザクションロックで更新を順序付ける。勤務重複はPostgreSQLの排他制約でも拒否 |
| 更新競合・再送 | `expectedVersion` と操作ごとのUUID `Idempotency-Key`。同じキー・入力の再送は同じ結果。異なる入力は拒否。再取得・結果照会時も現在権限を確認 |
| 変更の連絡 | 確定・取消は本人予定へ反映する。電話等による本人への連絡は別途行う。自動通知の送信完了とは表示しない |

これらは今回採用した実装条件であり、導入会社による法的資格判断・試験運用の責任者・保存期間・障害復旧のRPO/RTOまで確定したという意味ではない。

## Google・メールの接続設定

1. Google CloudにWebアプリのOAuthクライアントを用意する。個人Gmailを許可するため、組織内限定のクライアントだけで運用しない。
2. 承認済みリダイレクトURIを `http://localhost:5173/api/auth/google/callback` に完全一致で登録する。本番ではアプリのHTTPS URLに置き換える。
3. GoogleのSecurity Bundleで `amr` / `auth_time` が提供されるための設定・アプリ要件を確認する。認証要求には両claimsを含める。管理者に `mfa` が返らなければアプリはログインを許可しない。
4. `.env` に `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `GOOGLE_REDIRECT_URI` と `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_FROM` を設定する。クライアント秘密とSMTP秘密はそれぞれ `.secrets/google_client_secret`, `.secrets/smtp_password` に保存する。
5. ホスト起動では既定の秘密ファイルパスを使用する。Dockerでは `compose.auth.yaml` を重ね、APIへGoogle・SMTP秘密のみを渡す。DB管理者秘密はマイグレーション・運営者処理だけに渡す。

```powershell
npm.cmd ci
npm.cmd run setup
docker compose -f compose.yaml -f compose.auth.yaml up --build
```

Google/SMTPを未設定でも基盤・健康確認・見本画面は起動する。Google開始は接続未設定として拒否する。未設定のまま実利用者のログインや招待配送が成功したとは扱わない。

GoogleのMFA claims・設定条件は [Google OpenID Connect公式資料](https://developers.google.com/identity/openid-connect/openid-connect) と [Security Bundle公式資料](https://developers.google.com/identity/siwg/security-bundle) に基づく。実Google環境からのclaims受信・メール到達は接続設定後に確認する。

## マイグレーションと初期管理者

Docker起動では `migrate` サービスがDBの健康確認後にマイグレーションを適用し、完了してからAPIが起動する。既存データを消去せず、適用済みSQLのチェックサムを検証する。

ホストから管理者処理を行う場合はDBのローカルポートを開く。バックエンドの公開ポートは起動構成に合わせる。

```powershell
docker compose -f compose.yaml -f compose.local.yaml up -d db
npm.cmd run db:migrate
npm.cmd run auth:operator -- bootstrap --operator "運営担当者名" --reason "初回登録" --identity-evidence "本人確認の管理番号" --company-evidence "会社確認の管理番号" --invitation-email "本人のGoogleメール" --company-code "TEST_CO" --company-name "架空警備株式会社" --display-name "初期管理者名"
```

`bootstrap` は新しい会社・本店・10人枠・招待待ち管理者を作り、本人Googleメールに招待を送る。SMTP設定が必須であり、実行結果は会社ID・所属ID・送信結果だけを表示する。失敗時も保存した招待の送信状態を確認し、新しい招待を発行する。Googleアカウントを作成する手順ではない。

運営者の `recover` は `--company-id`, `--membership-id`, `--mode`, `--confirmed-unavailable true` と上記の担当者・理由・会社本人確認・新招待先を必須とする。`sole-admin-account-replacement` は別の有効管理者がいない場合のみ、`all-admins-unavailable` は全管理者利用不能を運営者が確認した場合に使う。旧Google連携とセッションを失効させ、内部利用者IDと履歴を維持する。通常のGoogle連携変更は会社設定画面で別管理者が承認する。

## テストデータと実行

```powershell
npx.cmd playwright install chromium --no-shell
npm.cmd run check
npm.cmd run security:audit
```

`npm.cmd run test` と `npm.cmd run test:e2e` はそれぞれ使い捨てのPostgreSQL 18コンテナを起動し、マイグレーションと制限付きAPI用ユーザーを用意する。Docker Desktopの起動が必要。既存DB・既存Composeボリュームへテストデータを投入しない。終了時にコンテナと一時ファイルを片付ける。

`apps/backend/test/fixtures.ts` の架空2社・本店支店・各役割・隊員・現場・共有取引先を使用する。各拠点の隊員は10人以内。通常のコードでは固定利用者のログイン経路を追加せず、テストDBにだけ合成Google識別子と事前認証済みセッションを作る。OAuth異常系は合成鍵で署名したトークン・交換境界を使って検証する。

勤務の画面基準日は2026年10月4日、試験用のサーバー時刻は10月3日09:00 JSTを基本とし、期限・開始終了境界のテストでは時計を制御する。実運用の期限判定はサーバーの実時刻を使用する。

API・DBテストとブラウザテストは常設で再実行できる。Googleへの実往復・実メール配送・実運用データでの負荷・バックアップ復元・本番HTTPS配信の検証とは区別する。PC/スマートフォンの実機能画像は `docs/mockups/live-*.png` に更新する。
