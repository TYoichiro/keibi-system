# セキュリティ構成

このリポジトリはローカル開発の基盤です。現在の公開APIは接続確認用の`GET /api/health`だけです。
業務API、ログイン、ユーザー・役割ごとのアクセス制御はまだ実装していません。

ログイン方式はGoogleログイン（OAuth 2.0 + OIDC）に確定しました。利用者のパスワード・ハッシュ・TOTP秘密・Google復旧コードは自システムで入力・保持しません。内部利用者IDと会社・拠点・役割、検証済みGoogle識別子との関連付け、アプリセッションは管理します。具体的な実装条件は[Googleログイン設計](docs/requirements/GOOGLE_AUTH_DESIGN.md)を参照してください。

開発・運用で確認する事項は[セキュリティチェックリスト](docs/SECURITY_CHECKLIST.md)にまとめています。
優先度と完了条件を含む今後の対策一覧であり、実装済みの対策を示すものではありません。

会社IDを含む関連付け、RLS、配置の同時確定、監査記録の権限に関する今後の設計は、[初回のデータ設計案](docs/requirements/MVP_DATA_DESIGN.md)を参照してください。設計段階の案であり、既存DBの権限やAPIの対策を変更したものではありません。

## 組み込み済みの対策

- Honoの`secureHeaders`でAPIにCSP、クリックジャッキング対策、MIME推測防止などを設定。
- APIはキャッシュ禁止。リクエストIDはサーバーが生成し、エラーを追跡可能にする。
- ブラウザのOriginは`ALLOWED_ORIGINS`との完全一致で検証。cross-siteリクエストを拒否。
- 更新系メソッドはOriginを必須とし、JSONを含め送信元を検証。HonoのCSRF対策も併用。
- 既定1 MiBの本文サイズ上限、120回/60秒の頻度上限、HTTPリクエスト・ヘッダー受信時間の上限。
- 設定値はZodで起動時に検証。不正な設定・短いDB秘密情報では起動しない。
- HTTPエラーは定型JSON。ログには本文・Cookie・Authorization・クエリ文字列・例外メッセージを出力しない。
- PostgreSQL管理者とAPI用ユーザーを分離。API用ユーザーは管理者権限、DB・ロール・テーブル作成権限を持たない。
- DBのTCP接続はSCRAM認証を必須とする。旧ボリュームのTCP trust認証も移行スクリプトで変更する。
- DBは専用の内部ネットワークに配置。既定でAPI・DBのホスト側ポートを閉じる。
- Nodeコンテナは非root、Linux capabilitiesをすべて削除、権限昇格を禁止。ソースのマウントは読み取り専用。
- Dockerイメージの依存パッケージインストールも非rootで実行する。
- DBの管理者用・API用パスワードを別々に乱数生成し、Docker Compose secretsとして渡す。
- `.secrets/`はGitとDockerビルドから除外。ローカル生成時はUnixの権限を制限し、Windowsでは現在のユーザーとSYSTEMにアクセスを限定する。
- Viteのファイル配信でも秘密ディレクトリ・環境変数ファイル・秘密鍵を拒否する。
- CIで型チェック、Lint、セキュリティテスト、ビルド、`npm audit`を実行。ActionsはコミットSHAで固定。

Compose secretsの実体はローカルのファイルです。ディスク上の暗号化・外部秘密管理サービスを代替しません。
Docker Desktop・ホストの管理者は秘密ファイルを読み取れるため、ホスト自体のアクセス制御も維持してください。
秘密ファイルは初回セットアップ後の再実行では上書きしません。ローテーション時はファイルを更新し、
READMEのDB権限・パスワード反映処理を実行してからAPIを再起動します。

## 入力検証を使う

`apps/backend/src/security/validation.ts`の`validateJson()`をルートに指定します。
JSON以外は415、不正なJSON・スキーマ違反は400です。`z.strictObject()`で未知のキーも拒否します。

```ts
import { z } from 'zod';
import { validateJson } from './security/validation.js';

const schema = z.strictObject({
  name: z.string().trim().min(1).max(100),
});

app.post('/api/example', validateJson(schema), (c) => {
  const input = c.req.valid('json');
  // 認証・認可の実装後に、検証済みの値を業務処理へ渡す。
  return c.json({ name: input.name });
});
```

更新系リクエストには許可済みOriginが必要です。ブラウザはOriginを付与します。
CLI・バッチ・Webhookは別の認証設計を行い、必要な専用ルートだけ明示的に対応してください。
Origin検証は認証の代替ではありません。

SQLは`pool.query('SELECT ... WHERE id = $1', [id])`のようにパラメーターを使います。
ユーザー入力をSQLやテーブル名へ直接連結しないでください。

## Google認証を実装する際の条件

- 全利用者をGoogleで認証し、未招待・停止した利用者を拒否する。Google認証成功だけで会社への所属や役割を付与しない。
- 会社管理者が登録した本人Googleメール宛てに、発行から7日間有効な一度限りの招待リンクを送る。生トークンは保存せずハッシュを保存し、期限到達・再招待後の旧リンク・使用済みの招待を拒否する。
- Google関連付け変更は会社管理者が本人確認の上で承認する。会社管理者自身の変更は別の会社管理者、ほかにいなければ運営者が承認する。旧関連付け・全アプリセッションを失効して新招待で連携する。最初の管理者登録と全管理者利用不能時の復旧・交代は運営者が会社・本人を確認して対応し、理由・確認・承認・結果を監査する。通常業務APIの最後の管理者保護を維持する。
- Hono側でAuthorization Code + PKCE（S256）、開始ブラウザに対応する一度限りの`state`・`nonce`を検証する。GoogleのIDトークンは署名・issuer・audience・期限等を検証してから使う。
- Googleの正規化issuerと`sub`を内部利用者へ関連付ける。メールの一致だけで既存利用者へ自動関連付けしない。個人Gmailと会社Workspaceだけを許可し、検証済みメールとWorkspaceの`hd`等を確認する。GmailでもWorkspaceでもない外部メールのGoogleアカウントは初回の対象外として拒否する。`hd`だけで会社所属を付与しない。
- Googleの二段階認証・回復はGoogle側で管理する。会社管理者の二段階認証は必須、管制担当・閲覧者・警備員は推奨とする。アプリ独自のパスワード・OTP・復旧コードを作らない。OIDC成功だけで会社管理者のMFA必須条件を満たしたとは判断せず、技術的な確認・強制方法と確認不能時の扱いを実装前に具体化する。
- Googleトークンをブラウザへ渡さず、初回は`openid email`のみを要求し、refresh tokenを取得・保存しない。OAuthクライアント秘密はサーバー側の秘密管理へ置く。
- 専用GET callbackへの外部遷移は`state`等で保護し、このルート以外のOrigin・CSRF対策を緩めない。コード・招待を含むURLをプロキシや監視のログへ出さない。
- 本システムのセッションは全員共通で本人の操作なし24時間・ログインから最長1か月とし、先に到達した期限でサーバー側から失効させる。自動更新はアイドル期限を延ばさず、本人の操作も絶対期限を延ばさない。停止・全端末失効も管理する。アプリのログアウトとGoogle全体のログアウトを区別し、Google側の停止や連携解除がアプリセッションへ即反映されるとは仮定しない。

`apps/backend/src/security/password.ts`と対応テストは過去の基盤として残っていますが、業務ルートから未使用です。Google専用方針では利用者認証に採用せず、将来の認証実装時に不要な依存と合わせて整理します。この資料改訂ではバックエンド・依存関係を変更していません。DB・インフラ用パスワードの秘密管理は引き続き必要です。

## 本番公開に向けて必要な実装

- HTTPS終端、公開するホスト名、信頼するリバースプロキシ、リクエスト制限・タイムアウトを設定する。
- Vite開発サーバーを公開せず、ビルドした静的ファイルを配信する。本番HTMLにもセキュリティヘッダーとCSPを設定する。
- Vite開発用CSPはHMRに必要なinline script/styleとローカルWebSocketを許可している。本番配信ではこの例外を外す。
- 確定したGoogle認証、7日間の招待と承認担当・管理者復旧担当、操作なし24時間・最長1か月のセッション期限を実装する。会社管理者のGoogle側MFAを強制・確認できる方法、本人確認記録・不達等の招待/復旧の詳細手順、重要操作の再認証条件を決める。アプリCookieは`HttpOnly`・`Secure`・`SameSite=Lax`を基本案とし、既存Origin・HonoのCSRF対策を維持して、セッションに対応するCSRFトークン検証を追加する。
- 業務APIに認証と役割・所属・対象データごとの認可を実装し、許可がない場合は拒否する。
- 支店追加・警備員登録枠の増加は、会社管理者の役割に加えて本店所属をAPIで確認する。取引先は会社共通として保持し、管制担当・閲覧者への一覧・詳細・候補・件数は所属拠点に関係する取引先だけに限定する。会社共通であることだけを自社全件閲覧の根拠にしない。共通取引先の編集担当と異動後の履歴閲覧は確認後に適用する。
- ログイン試行はアカウント単位と接続元単位で制限する。複数APIインスタンスでは共有ストアや入口側でも制限する。
- 本番DBへのTLS接続、DBバックアップと復元確認、秘密情報の保管・ローテーション、監視を設定する。

現在のレート制限はプロセス内メモリーと実際のTCP接続元を使います。`X-Forwarded-For`などは信頼しません。
Vite経由のブラウザは同じプロキシ接続元として集計されます。本番の入口が決まった段階で、
信頼するプロキシだけから接続元を取得する設定と、複数インスタンス間の集計を追加してください。

本番モードはHTTPSのOriginだけを受け付け、APIにHSTSを付けます。
HTTPS証明書や静的ファイル配信まで自動で構成するものではありません。

## 検証

```bash
npm run check
npm run security:audit
```

セキュリティテストではヘッダー、送信元・CSRF、容量・頻度制限、偽装した転送ヘッダー、
JSON入力、エラー情報の秘匿、設定値、既存の未使用パスワードヘルパーを確認しています。
Google認証・招待・関連付け・セッション・業務認可のテストはまだありません。
依存パッケージ監査で脆弱性が検出された場合は、互換性を確認して更新してください。

## 参考

- [Hono Secure Headers](https://hono.dev/docs/middleware/builtin/secure-headers)
- [Hono CSRF](https://hono.dev/docs/middleware/builtin/csrf)
- [Hono Validation](https://hono.dev/docs/guides/validation)
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
- [PostgreSQLの権限](https://www.postgresql.org/docs/current/ddl-priv.html)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [GoogleのIDトークンとメール所有権の検証](https://developers.google.com/identity/sign-in/web/backend-auth)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/rfc9700)
