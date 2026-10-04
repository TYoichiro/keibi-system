# keibi-system

ReactのSPAとHonoのAPIを、npm workspacesで1つのリポジトリにまとめています。
開発サーバーはDocker Composeで起動します。

## 構成

```text
.
├── apps/
│   ├── frontend/         # React + Vite + TypeScript
│   │   └── src/
│   └── backend/          # Hono + Node.js + TypeScript
│       └── src/
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

リポジトリのルートで実行します。

```bash
docker compose up --build
```

| サービス | URL |
| --- | --- |
| フロントエンド | http://localhost:5173 |
| APIのヘルスチェック | http://localhost:3000/api/health |

フロントエンドの画面で「サーバーに接続できました。」と表示されれば、
ReactからHonoへの接続が成功しています。
ブラウザの`/api/*`へのリクエストを、Viteの開発プロキシが`backend:3000`へ転送します。

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

### ポートなどの変更

設定を変更する場合だけ、`.env.example`をコピーします。初回起動には不要です。

```bash
cp .env.example .env
```

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `FRONTEND_PORT` | `5173` | ホスト側のフロントエンド公開ポート |
| `BACKEND_PORT` | `3000` | ホスト側のAPI公開ポート |
| `CHOKIDAR_USEPOLLING` | `true` | Docker Desktop / WSL2向けのファイル変更検知 |

コンテナ内のポートはフロントエンドが`5173`、APIが`3000`で固定です。
ホスト側のポートを変更しても、コンテナ間のプロキシ設定を変更する必要はありません。
Linuxでは`CHOKIDAR_USEPOLLING=false`にするとファイル監視のCPU負荷を抑えられます。

## 型チェック・Lint・ビルド

起動後、別のターミナルで実行します。

```bash
docker compose exec backend npm run check
```

個別に実行する場合は次のコマンドを使います。

```bash
docker compose exec backend npm run typecheck
docker compose exec backend npm run lint
docker compose exec backend npm run build
```

ビルド結果はコンテナ内の`apps/frontend/dist`と`apps/backend/dist`に生成します。
このCompose構成は開発用です。本番配信ではフロントエンドの静的ファイル配信と
APIへのルーティングをデプロイ先に合わせて設定してください。

## 依存関係の追加

ホストにNode.jsがない場合も、次のコマンドでワークスペースに追加できます。
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

## Dockerを使わずに開発する場合

Node.js 24とnpm 11以上を使います。`.nvmrc`も用意しています。

```bash
npm ci
```

2つのターミナルで、それぞれ起動します。

```bash
npm run dev:backend
npm run dev:frontend
```

この場合、Viteは`http://localhost:3000`にAPIリクエストを転送します。
必要に応じて`API_PROXY_TARGET`環境変数で転送先を指定できます。
`npm run check`で型チェック・Lint・ビルドを実行します。

## 参考

- [Reactでアプリを作成する](https://react.dev/learn/build-a-react-app-from-scratch)
- [Viteの開発サーバー設定](https://vite.dev/config/server-options)
- [HonoのNode.js構成](https://hono.dev/docs/getting-started/nodejs)
- [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)
