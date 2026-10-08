# セキュリティ構成

更新日: 2026年10月8日（日本時間）

初回要件のGoogle認証、招待、セッション、会社・拠点・役割・本人の認可、業務DB・APIを実装した。設定・初期管理者・復旧・採用した方式は [実装・運用手順](docs/IMPLEMENTATION.md)、常設テストと検証限界は [開発状況](docs/DEVELOPMENT.md) を参照する。

## APIの安全対策

- Hono `secureHeaders` によるCSP、クリックジャッキング対策、MIME推測防止。APIはキャッシュ禁止。
- サーバー生成のリクエストIDと定型エラー。本文・Cookie・Authorization・クエリ文字列・例外メッセージ・Googleコード・招待トークンをHTTPログへ出さない。
- `ALLOWED_ORIGINS` の完全一致検証とcross-site拒否。更新系はOrigin必須、Hono CSRFに加えてセッションに対応するCSRFトークンを検証する。
- Google開始は許可されたOriginまたは同一アプリのRefererを確認。外部Googleからの専用GET callbackだけを例外とし、一度限りのstate・開始ブラウザcookie・nonce・PKCEで保護する。
- 本文サイズ既定1 MiB、頻度既定120回/60秒、HTTP本文・ヘッダー受信時間の上限。転送ヘッダーを信頼せず実TCP接続元で集計する。
- Zodによる設定・入力検証、未知のキー拒否、UUID・日付範囲・人数・文字列長の制限。SQLの値はパラメーターで渡す。

現在の頻度制限はプロセス内メモリー。Vite経由はプロキシ接続元で集計される。本番の信頼するプロキシ設定と複数インスタンス間の共有制限は別途必要。

## Google・招待・セッション

全利用者はGoogle OAuth 2.0 / OIDCで認証する。独自の利用者パスワード、ハッシュ、TOTP秘密、Google復旧コードを入力・保持しない。Googleのパスワード・二段階認証・回復はGoogle側へ委任する。未使用の `src/security/password.ts` は旧基盤として残るが利用者認証から呼ばない。

- Authorization Code + S256 PKCE。state・nonce・OAuthブラウザcookieは10分、一度限り。Googleトークンの署名・issuer・audience・azp・期限・nonce・検証済みメールを確認する。
- 許可アカウントは個人Gmail系、または署名済み `hd` を持つWorkspace。`issuer + sub` と内部利用者を関連付ける。メールやドメインだけで会社・権限を付与しない。
- 会社管理者は署名済み `amr` に `mfa` がある場合のみ許可。欠落・確認不能は拒否。Google側のSecurity Bundle設定と実受信の確認が必要。自己申告・手入力の例外を用意しない。
- 要求scopeは `openid email`。refresh tokenを取得・保存せず、Googleトークンをブラウザへ渡さない。クライアント秘密はサーバー側の秘密ファイルから読む。
- 招待は管理者が登録した本人Googleメール宛て、7日、一度限り。生トークンはDBに保存せずハッシュのみ。期限切れ、使用済み、再招待前のリンクを拒否する。配送待ち・送信失敗は画面にも表示する。
- Google関連付け変更は会社管理者の本人確認記録と承認が必要。管理者自身は別管理者が承認し、ほかにいなければ運営者CLIで対応する。旧識別子と全セッションを失効させ、新招待で連携する。
- 最初の会社管理者登録と全管理者利用不能の復旧は運営者CLIのみ。担当者・理由・会社確認と本人確認の証跡参照を必須とし監査する。通常APIでは最後の有効管理者を停止・降格できない。
- アプリcookieは `HttpOnly`, `SameSite=Lax`, `/api` パス。本番は `Secure`。サーバーDBにはセッションcookieのハッシュだけを保持する。
- 本人操作なし24時間、ログインからJST暦で最長1か月。GETや自動取得で延長せず、明示操作も絶対期限を延ばさない。月末は翌月末同時刻へ丸める。
- 認証後とテナントトランザクション内で現在のセッション・所属・役割・隊員対応を再確認する。停止、退職、権限変更、全端末失効を古い認証結果で迂回させない。

アプリのログアウトはGoogle全体のログアウトと別。Google側の停止が既存アプリセッションへ即時反映されるとは仮定しない。実Google往復・実SMTP配送は設定後の確認対象で、合成署名・代替交換/メールでのテスト成功と区別する。

## テナント境界とDB権限

- マイグレーション・運営者処理の管理者DBユーザーと、API用ユーザーを分離。APIは管理者秘密を受け取らない。
- マイグレーションはチェックサムとadvisory lock付き。API用ロールが管理者と同一、DB・スキーマ・業務テーブルの所有者という誤設定は適用前に拒否する。
- APIロールにSUPERUSER・BYPASSRLS・DB/ロール/テーブル作成を許可しない。業務テーブルにRLSを強制し、会社IDを含む外部キーで他社の関連付けを防ぐ。
- `auth_oauth_transactions`, `google_identities`, `app_sessions` はAPIの直接アクセスを拒否。限定した `SECURITY DEFINER` 関数に固定search_pathを指定し、PUBLIC実行権限を除く。
- `withTenant` は認証済み所属を再確認し、トランザクション内だけ会社・拠点・役割・本人のDBコンテキストを設定する。コネクションプールへ設定を残さない。
- 会社管理者、管制担当、閲覧者、警備員ごとにAPIも認可する。所属拠点外・他社のID指定、一覧・候補・集計・履歴・再送結果にも制限を適用する。
- 支店追加・枠増加は本店管理者だけ。共通取引先の編集は管理者、管制担当・閲覧者の参照は利用関係を持つ所属拠点に限定する。
- 警備員は本人の確定予定と担当期間中の公開現場情報だけ。未確定版・内部メモ・別隊員情報を返さない。取消・担当解除・終了後の詳細取得も拒否する。
- 公開済み勤務版・配置はDBトリガーで変更を拒否し、勤務重複は排他制約で拒否。監査・再送記録はAPIにUPDATE/DELETEを与えない。
- 更新は `expectedVersion` と入力に対応する `Idempotency-Key` で競合・二重作成を防ぐ。同じ結果の再取得にも現在の認可を適用する。

## 秘密とローカル基盤

- DBのTCP接続はSCRAM。DBは内部ネットワーク、API・DBのホストポートは既定で閉じる。ローカル追加ポートは127.0.0.1だけ。
- 非rootのNodeコンテナ、capabilities削除、権限昇格禁止、ソース読み取り専用。npm依存インストールも非root。
- `.secrets/` と `.env`、テスト一時ファイル・traceをGit/ビルドから除外。Viteは秘密ディレクトリ・環境ファイル・秘密鍵を配信しない。
- setupはDB管理者/API秘密を別々に乱数生成し、既存値を上書きしない。Unix権限とWindowsユーザー/SYSTEM ACLを制限する。
- `compose.auth.yaml` でGoogle/SMTP秘密だけをAPIへ追加する。管理者DB秘密はmigrationサービスだけに渡す。

Compose secretsの実体はローカルファイルであり、ディスク暗号化・外部秘密管理サービスを代替しない。ホスト自体のアクセス制御も必要。DB秘密の変更はREADMEの権限・パスワード再反映手順でDBへ適用し、APIを再起動する。秘密値をコード・ドキュメント・ログ・回答へ転記しない。

## 検証と本番運用

```powershell
npm.cmd run check
npm.cmd run security:audit
```

常設テストは隔離したPostgreSQLと制限付きAPIユーザーを用い、Google署名・OAuth state/nonce、MFA、7日招待、期限・全端末失効、停止・役割変更、CSRF、入力制限、会社・拠点・本人境界、更新競合・再送、公開履歴・同時確定・資格・勤務重複を確認する。Playwrightは保存から再読込、配置の公開・改訂・取消、通信切断後の二重登録防止、変更履歴、PC/スマートフォンの画面を確認する。CIにもDockerテスト・Chromium準備・依存監査を組み込む。

本番HTTPS終端・静的ファイル配信・CSP、信頼プロキシと分散頻度制限、DB TLS、バックアップ復元、監視、秘密ローテーション、運用の保存削除期間は別途整備する。Vite開発サーバーを本番公開しない。本番モードのHTTPS Origin/HSTSだけで本番基盤が整ったとは扱わない。[セキュリティチェックリスト](docs/SECURITY_CHECKLIST.md)と[試験運用準備票](docs/requirements/PILOT_OPERATIONS.md)は運用確認に使用する。

## 参考

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google Security Bundle](https://developers.google.com/identity/siwg/security-bundle)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/rfc9700)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Hono Secure Headers](https://hono.dev/docs/middleware/builtin/secure-headers)
- [Hono CSRF](https://hono.dev/docs/middleware/builtin/csrf)
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
