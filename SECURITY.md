# セキュリティ構成

このリポジトリはローカル開発の基盤です。現在の公開APIは接続確認用の`GET /api/health`だけです。
業務API、ログイン、ユーザー・役割ごとのアクセス制御はまだ実装していません。

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

## パスワード保存の処理を使う

`apps/backend/src/security/password.ts`にはArgon2idの非同期処理を用意しています。
19 MiBのメモリー、反復2回、並列度1を使い、ライブラリが毎回異なるsaltを生成します。
パスワードは15〜128文字を受け付け、空白・Unicodeを保持します。

```ts
import { hashPassword, verifyPassword } from './security/password.js';

const storedHash = await hashPassword(password);
const matches = await verifyPassword(storedHash, enteredPassword);
```

DBに保存するのはハッシュだけです。`storedHash`はDBから取得し、リクエストから受け取らないでください。
このヘルパーにはユーザー登録、ログイン、セッション、MFA、権限チェックは含まれません。

## 本番公開に向けて必要な実装

- HTTPS終端、公開するホスト名、信頼するリバースプロキシ、リクエスト制限・タイムアウトを設定する。
- Vite開発サーバーを公開せず、ビルドした静的ファイルを配信する。本番HTMLにもセキュリティヘッダーとCSPを設定する。
- Vite開発用CSPはHMRに必要なinline script/styleとローカルWebSocketを許可している。本番配信ではこの例外を外す。
- ログイン方式とMFA、セッション期限・失効、`HttpOnly`・`Secure`・`SameSite` Cookie、CSRF対策を決める。
- 業務APIに認証と役割・所属・対象データごとの認可を実装し、許可がない場合は拒否する。
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
JSON入力、エラー情報の秘匿、設定値、パスワードハッシュを確認しています。
依存パッケージ監査で脆弱性が検出された場合は、互換性を確認して更新してください。

## 参考

- [Hono Secure Headers](https://hono.dev/docs/middleware/builtin/secure-headers)
- [Hono CSRF](https://hono.dev/docs/middleware/builtin/csrf)
- [Hono Validation](https://hono.dev/docs/guides/validation)
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
- [PostgreSQLの権限](https://www.postgresql.org/docs/current/ddl-priv.html)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
