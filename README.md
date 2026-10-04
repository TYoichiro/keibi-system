# keibi-system

ReactのSPAとHonoのAPIを、npm workspacesで1つのリポジトリにまとめています。
フロントエンドはReact + Vite + TypeScript、バックエンドはHono + Node.js + TypeScriptです。
DBにはPostgreSQL 18を使い、3つのサービスをDocker Composeで起動します。
バックエンドからDBへの接続には`pg`（node-postgres）のコネクションプールを使います。

## 構成

```text
.
├── apps/
│   ├── frontend/         # React + Vite + TypeScript
│   │   └── src/
│   └── backend/          # Hono + Node.js + TypeScript
│       └── src/          # app.ts: API / db.ts: PostgreSQL接続
├── compose.yaml         # 開発用のサービス定義
├── Dockerfile.dev       # Node.js 24の共通開発イメージ
├── eslint.config.js
├── tsconfig.base.json
├── package.json         # workspacesと共通コマンド
└── package-lock.json    # リポジトリ全体の依存関係
```

## Dockerで開発する

Docker Engine / Docker DesktopとDocker Composeが必要です。
ホストへのNode.js・npmのインストールは不要です。

初回はリポジトリのルートで秘密ファイルを生成します。Windows / PowerShellの例です。

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:24-alpine node scripts/setup-env.mjs
```

Node.jsがある場合は`npm.cmd run setup`（macOS / Linuxでは`npm run setup`）でも生成できます。
WindowsでDocker経由で生成した場合は、ホスト側で秘密ディレクトリのアクセス権を制限します。
ホストの`npm.cmd run setup`で生成した場合は、この処理も自動で行います。

```powershell
icacls .secrets /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F"
```

LinuxのDockerで生成する場合は、ホスト側で扱えるよう`--user "$(id -u):$(id -g)"`を付けてください。
生成処理は`.env`と`.secrets/`の既存ファイルを上書きしません。

その後、起動します。

```bash
docker compose up --build
```

| サービス | URL |
| --- | --- |
| フロントエンド | http://localhost:5173 |
| APIのヘルスチェック | http://localhost:5173/api/health |

既定では、APIとDBのポートをホストに公開しません。フロントエンドの公開先はループバックのみです。
APIの直接確認やDBクライアントでの接続が必要な場合だけ、追加設定を使います。

```bash
docker compose -f compose.yaml -f compose.local.yaml up -d --wait
```

この場合、APIは`127.0.0.1:3000`、DBは`127.0.0.1:5432`に公開されます。
既定の公開範囲に戻すには`docker compose up -d --wait`を実行してください。

フロントエンドの画面で「サーバーとデータベースに接続できました。」と表示されれば、
React → Hono → PostgreSQLの接続が成功しています。
ブラウザの`/api/*`へのリクエストを、Viteの開発プロキシが`backend:3000`へ転送します。
PostgreSQLのヘルスチェック成功後にHonoを起動し、Honoのヘルスチェック成功後にViteを起動します。
`GET /api/health`はDBに`SELECT 1`を実行し、成功時はHTTP 200で
`{"status":"ok","database":"ok"}`、DB接続失敗時はHTTP 503を返します。

`apps/frontend/src`と`apps/backend/src`はホストからコンテナにマウントしています。
ソースの変更はフロントエンドではHMR、バックエンドでは自動再起動で反映します。
フロントエンドの`index.html`と`vite.config.ts`もマウントしています。
依存関係・TypeScript設定・その他のファイルを変更した場合は、
`docker compose up --build`でイメージを再ビルドしてください。
依存関係はイメージ内に保持するため、ホストの`node_modules`や古い依存ボリュームに影響されません。

バックグラウンドで起動する場合と、終了する場合は次のコマンドを使います。

```bash
docker compose up --build -d --wait
docker compose logs -f
docker compose down
```

`docker compose down`で停止してもDBのデータは名前付きボリューム`postgres_data`に残ります。

### ポートなどの変更

`setup`で生成された`.env`を編集します。秘密ファイルの内容を`.env`やソースに転記しないでください。

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `FRONTEND_PORT` | `5173` | ホスト側のフロントエンド公開ポート |
| `BACKEND_PORT` | `3000` | `compose.local.yaml`使用時のホスト側API公開ポート |
| `POSTGRES_HOST` | `127.0.0.1` | ローカル実行時のDB接続先。Dockerでは`db`に固定 |
| `POSTGRES_PORT` | `5432` | `compose.local.yaml`使用時のDB公開ポートとローカル実行時の接続ポート |
| `POSTGRES_DB` | `keibi` | DB名 |
| `POSTGRES_USER` | `keibi` | DB管理者名。APIには使用しません |
| `POSTGRES_APP_USER` | `keibi_app` | 権限を制限したAPI用DBユーザー名 |
| `POSTGRES_APP_PASSWORD_FILE` | `.secrets/postgres_app_password` | ローカル実行時のDBパスワードファイル |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 許可するブラウザの送信元。完全一致で判定 |
| `RATE_LIMIT_POINTS` | `120` | 接続元あたりのリクエスト上限 |
| `RATE_LIMIT_DURATION` | `60` | レート制限の集計期間（秒） |
| `MAX_BODY_BYTES` | `1048576` | APIリクエスト本文の上限（1 MiB） |
| `CHOKIDAR_USEPOLLING` | `true` | Docker Desktop / WSL2向けのファイル変更検知 |

コンテナ内のポートはフロントエンドが`5173`、APIが`3000`、DBが`5432`で固定です。
フロントエンドの公開ポートを変更した場合は、`ALLOWED_ORIGINS`も合わせて変更してください。
API・DBのホスト側ポートを変更しても、コンテナ間のプロキシ設定を変更する必要はありません。
Linuxでは`CHOKIDAR_USEPOLLING=false`にするとファイル監視のCPU負荷を抑えられます。

パスワードは`setup`が管理者用・アプリ用に別々の乱数で生成します。
Docker Compose secrets経由で必要なコンテナにだけ渡し、環境変数にはパスワードを渡しません。
`.env`と`.secrets/`はGit・Dockerビルド対象から除外しています。
`POSTGRES_DB`・`POSTGRES_USER`はDBボリュームの初期化時に使われるため、既存DBでは変更だけでは更新されません。

以前の管理者接続の構成から移行する場合や、秘密ファイルのパスワードを変更した場合は、
DBデータを残したまま次の処理でDB側の権限・パスワードを反映します。

```bash
docker compose up -d --wait db
docker compose exec -T db sh /docker-entrypoint-initdb.d/10-app-user.sh
docker compose up --build -d --wait
```

### PostgreSQLに接続する

DBクライアントから接続する場合は`compose.local.yaml`を使い、アプリ用ユーザー名と
`.secrets/postgres_app_password`のパスワードを指定します。
コンテナ内の`psql`でも接続できます。既定のDB名・ユーザー名の場合は次のコマンドを使います。

```bash
docker compose exec db psql -U keibi -d keibi
```

業務用テーブルはまだ作成していません。テーブル設計が決まった段階で、
スキーマ変更を管理するマイグレーションを追加します。
テーブル作成・変更は管理者で実行し、API用ユーザーにはデータ操作の権限だけを付与します。

## 型チェック・Lint・セキュリティテスト・ビルド

起動後、別のターミナルで実行します。

```bash
docker compose exec backend npm run check
```

個別に実行する場合は次のコマンドを使います。

```bash
docker compose exec backend npm run typecheck
docker compose exec backend npm run lint
docker compose exec backend npm run build
docker compose exec backend npm run test
docker compose exec backend npm run security:audit
```

ビルド結果はコンテナ内の`apps/frontend/dist`と`apps/backend/dist`に生成します。
このCompose構成は開発用です。本番配信ではフロントエンドの静的ファイル配信と
APIへのルーティングをデプロイ先に合わせて設定してください。

## 依存関係の追加

ホストにNode.jsがない場合も、次のコマンドでワークスペースに追加できます。
Windows / PowerShellでの例です。

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:24-alpine npm install <package> --workspace @keibi/frontend
docker run --rm -v "${PWD}:/app" -w /app node:24-alpine npm install <package> --workspace @keibi/backend
docker compose up --build
```

LinuxではホストユーザーのUID/GIDで実行して、生成ファイルの所有権を維持します。

```bash
# フロントエンドに追加する例
docker run --rm --user "$(id -u):$(id -g)" -e npm_config_cache=/tmp/npm-cache \
  -v "$PWD:/app" -w /app node:24-alpine npm install <package> --workspace @keibi/frontend

# バックエンドに追加する例
docker run --rm --user "$(id -u):$(id -g)" -e npm_config_cache=/tmp/npm-cache \
  -v "$PWD:/app" -w /app node:24-alpine npm install <package> --workspace @keibi/backend

# package.json / package-lock.jsonの変更をコンテナに反映
docker compose up --build
```

ワークスペースごとのロックファイルは作成せず、ルートの`package-lock.json`を管理します。

## React・Honoをローカルで実行する場合

Node.js 24とnpm 11以上を使います。`.nvmrc`も用意しています。
DBだけDockerで起動できます。

```bash
docker compose -f compose.yaml -f compose.local.yaml up -d --wait db
```

DB設定を変更した場合は、ルートの`.env`に設定してください。
バックエンドの`dev`・`start`コマンドはルートの`.env`を読み込みます。

```bash
npm ci
```

Windows / PowerShellで`npm.ps1`の実行ポリシーエラーが出る場合は、`npm.cmd ci`や
`npm.cmd run dev:backend`のように`npm.cmd`を使ってください。

2つのターミナルで、それぞれ起動します。

```bash
npm run dev:backend
npm run dev:frontend
```

この場合、Viteは`http://localhost:3000`にAPIリクエストを転送します。
必要に応じて`API_PROXY_TARGET`環境変数で転送先を指定できます。
`npm run check`で型チェック・Lint・セキュリティテスト・ビルドを実行します。

## セキュリティの土台

HTTPヘッダー、送信元・CSRFチェック、本文サイズ制限、接続元によるレート制限、
内部情報を含まないエラー応答、設定値の検証を組み込んでいます。
入力検証用の`validateJson()`と、Argon2idの`hashPassword()`・`verifyPassword()`も利用できます。
利用例と本番公開前に必要な認証・認可・HTTPS設定は[SECURITY.md](SECURITY.md)を参照してください。
GitHub Actionsでチェックと依存パッケージ監査を実行し、Dependabotで更新を確認する設定も追加しています。

## 参考

- [Reactでアプリを作成する](https://react.dev/learn/build-a-react-app-from-scratch)
- [Viteの開発サーバー設定](https://vite.dev/config/server-options)
- [HonoのNode.js構成](https://hono.dev/docs/getting-started/nodejs)
- [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
- [PostgreSQL公式Dockerイメージ](https://hub.docker.com/_/postgres)
- [Composeの起動順序とヘルスチェック](https://docs.docker.com/compose/how-tos/startup-order/)
- [node-postgresのコネクションプール](https://node-postgres.com/features/pooling)
