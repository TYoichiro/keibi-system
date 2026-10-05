# keibi-system

警備会社向けのクラウド型管制業務支援システムを開発しています。
会社ごとに利用できるマルチテナントWebアプリを目指し、必要最低限の機能から段階的に実装します。
現在は見た目を確認する段階で、ダッシュボード・配置・現場・隊員・勤怠・設定の6画面のモックを作成済みです。

ReactのSPAとHonoのAPIを、npm workspacesで1つのリポジトリにまとめています。
フロントエンドはReact + Vite + TypeScript、バックエンドはHono + Node.js + TypeScriptです。
DBにはPostgreSQL 18を使い、3つのサービスをDocker Composeで起動します。
バックエンドからDBへの接続には`pg`（node-postgres）のコネクションプールを使います。

## 現在の開発状況

更新日: 2026年10月5日（日本時間）

| 区分 | 状況 |
| --- | --- |
| 画面 | 主要6画面のモックを作成。設定は会社・拠点、管制・勤怠、通知、利用者・権限の4カテゴリ |
| 画面操作 | 検索、絞り込み、ページ送り、詳細切り替え、設定値のプレビューなどを確認可能 |
| 表示確認 | PC・スマートフォンで確認済み。画面サンプルを`docs/mockups/`に保存 |
| データ | TypeScript内の架空のサンプル。主な基準日は2026年10月4日で、現在日付には連動しない |
| API・DB | HonoとPostgreSQLの接続基盤、および接続確認用の`GET /api/health`を実装 |
| 未実装 | ログイン、会社ごとのデータ分離、権限制御、業務テーブル・API、登録・更新・保存、実際の通知・出力 |

会社・拠点の表示や設定画面の権限表はモックです。現時点でマルチテナント対応や権限制御が完成しているわけではありません。
各画面の具体的な操作範囲は、下の「画面のモック」に記載しています。

## AI開発・引き継ぎ資料

| 資料 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | AIが作業するときの方針、編集の基準、確認するコマンド |
| [開発状況・実装ガイド](docs/DEVELOPMENT.md) | 作成済みの画面、ソースの配置、データの関係、検証履歴、未決事項と今後の実装候補 |
| [SECURITY.md](SECURITY.md) | API・DBの既存の対策と、認証・認可や本番公開に向けた実装範囲 |

次の作業では、まず本READMEと`AGENTS.md`、`docs/DEVELOPMENT.md`を参照してください。
画面や機能を追加・変更した際は、動作する部分と表示のみの部分が分かるように、これらの資料も更新します。

## 画面のモック

### ダッシュボード

現在のトップ画面は、警備会社の管制業務を想定した画面確認用のモックです。
会社・拠点、本日の現場数と配置人数、未配置の現場、上番状況、連絡事項、1週間の配置見通しを表示します。
データは2026年10月4日を基準にした架空のサンプルです。

現場の検索と「未配置あり」の絞り込みを確認できます。
サイドバーと「配置表を開く」から配置・管理の画面に移動できます。
認証、会社ごとのデータ分離、登録・更新、API連携は今後実装します。
サンプルデータは`apps/frontend/src/data/dashboard.ts`で変更できます。

画面サンプル: [PC](docs/mockups/dashboard-desktop.png) / [スマートフォン](docs/mockups/dashboard-mobile.png)

### 配置・管理

http://localhost:5173/assignments で現場別の配置表を確認できます。
必要人数・配置隊員・現場責任者・未配置枠と、配置可能な隊員のシフト・資格を表示します。
現場名を選ぶと、右側の「選択中の現場」に集合場所、配置条件、配置メモを表示します。

不足あり・配置完了・勤務帯での絞り込み、現場・取引先・隊員の検索、配置可能な隊員の検索が動作します。
隊員の配置・配置の確定・配置表の出力は表示のみです。登録・保存やAPIへの送信は行いません。
配置表のサンプルはダッシュボードと同じ現場データを使い、隊員名や現場詳細は`apps/frontend/src/data/assignments.ts`で管理します。

画面サンプル: [PC](docs/mockups/assignments-desktop.png) / [スマートフォン](docs/mockups/assignments-mobile.png)

### 現場管理

http://localhost:5173/sites で現場一覧と選択した現場の詳細を確認できます。
登録現場は16件で、稼働中の12件はダッシュボード・配置表と共通です。
準備中・休止中・終了した現場も含み、警備種別、勤務時間、人数、契約期間を一覧に表示します。
詳細には所在地、集合場所、配置条件、担当者・連絡先、現場メモを表示します。

現場・取引先・所在地の検索、状態・警備種別・契約更新予定による絞り込み、8件ずつのページ送り、現場詳細の切り替えが動作します。
`/sites?site=S013`のように現場IDを指定して詳細を開くこともできます。
登録・編集・一覧出力は表示のみです。サンプルの住所・氏名・電話番号・契約情報は架空のデータです。
現場管理のサンプルは`apps/frontend/src/data/siteManagement.ts`で管理します。

画面サンプル: [PC](docs/mockups/sites-desktop.png) / [スマートフォン](docs/mockups/sites-mobile.png)

### 隊員管理

http://localhost:5173/officers で隊員一覧と選択した隊員の詳細を確認できます。
登録隊員40名（在籍37名・休職2名・退職1名）を表示し、配置済みの32名・配置可能な5名は配置表と共通です。
一覧には雇用区分、保有資格、本日の配置、在籍状態を表示し、詳細には勤務可能時間、対応エリア、連絡先、教育記録、管制メモを表示します。

隊員・ID・配置現場・対応エリアの検索、在籍状態・配置可否・資格・雇用区分・教育予定未登録による絞り込み、8名ずつのページ送り、隊員詳細の切り替えが動作します。
`/officers?officer=G033`のように隊員IDを指定して詳細を開くこともできます。
配置現場の詳細と本日の勤怠へ移動できます。登録・編集・一覧出力は表示のみです。
氏名・連絡先・資格・教育記録は架空のサンプルで、`apps/frontend/src/data/personnel.ts`で管理します。

画面サンプル: [PC](docs/mockups/officers-desktop.png) / [スマートフォン](docs/mockups/officers-mobile.png)

### 勤怠管理

http://localhost:5173/attendance で日別の勤怠一覧と打刻・報告の詳細を確認できます。
2026年10月4日9:30時点のサンプルは、勤務中29名・上番前2名・下番済み1名です。
前日（10月3日）のサンプルにも切り替えられ、下番未報告や夜勤の翌日打刻を確認できます。
勤務予定と報告された上番・下番時刻を分けて表示し、勤務実績は下番済みの勤怠のみ休憩を除いて集計します。

日付切り替え、隊員・ID・現場の検索、勤怠状態・要確認・現場・勤務帯による絞り込み、8名ずつのページ送り、勤怠詳細の切り替えが動作します。
右側の確認対象を選ぶと、打刻時刻や休憩予定の変更メモを表示します。
`/attendance?officer=G032`のように隊員IDを指定して本日の勤怠詳細を開くこともできます。
隊員情報・現場詳細へ移動できます。打刻修正・勤怠確定・出力は表示のみで、保存やAPI送信は行いません。
架空の勤怠サンプルは`apps/frontend/src/data/attendance.ts`で管理します。

画面サンプル: [PC](docs/mockups/attendance-desktop.png) / [スマートフォン](docs/mockups/attendance-mobile.png)

### 設定

http://localhost:5173/settings で会社・拠点と管制業務の設定を確認できます。
PCではサイドバー下部、スマートフォンでは上部メニューの「設定」から開けます。

- 会社・拠点: 会社名、連絡先、所在地、本社の拠点情報。在籍隊員37名は隊員管理と共通です。
- 管制・勤怠: 標準の勤務時間・休憩時間、上番・下番確認のタイミング、管制画面の表示。
- 通知設定: 配置不足・上番・下番・教育予定の通知、アプリ内・メールでの受け取り方法。
- 利用者・権限: 架空の利用者4名と所属範囲、管理者・管制担当・閲覧者の権限の表示例。

カテゴリ切り替え、入力値・選択肢・スイッチの変更、「元に戻す」、利用者の検索・権限による絞り込みを確認できます。
`/settings?section=operations`、`/settings?section=notifications`、`/settings?section=members`でカテゴリを直接開けます。
会社共通の設定と本社向けの設定を区別して表示します。入力した値は画面内だけのプレビューで、他の業務画面には反映されず、再読み込みで初期値に戻ります。
保存・拠点追加・利用者招待・権限変更は表示のみで、API送信やメール送信は行いません。実際の認証・権限制御は今後実装します。
会社情報・アカウント・権限・設定値は架空のサンプルで、`apps/frontend/src/data/settings.ts`で管理します。

画面サンプル:

| カテゴリ | PC | スマートフォン |
| --- | --- | --- |
| 会社・拠点 | [画面](docs/mockups/settings-desktop.png) | [画面](docs/mockups/settings-mobile.png) |
| 管制・勤怠 | [画面](docs/mockups/settings-operations-desktop.png) | [画面](docs/mockups/settings-operations-mobile.png) |
| 通知設定 | [画面](docs/mockups/settings-notifications-desktop.png) | [画面](docs/mockups/settings-notifications-mobile.png) |
| 利用者・権限 | [画面](docs/mockups/settings-members-desktop.png) | [画面](docs/mockups/settings-members-mobile.png) |

### 画面を起動する

画面だけを確認する場合は、Node.js環境で次のコマンドを実行してください。APIとDBの起動は不要です。

```powershell
npm.cmd ci
npm.cmd run dev:frontend
```

ブラウザで http://localhost:5173 を開きます。Docker環境でも同じ画面を表示します。

## 構成

```text
.
├── apps/
│   ├── frontend/         # React + Vite + TypeScript
│   │   └── src/
│   └── backend/          # Hono + Node.js + TypeScript
│       └── src/          # app.ts: API / db.ts: PostgreSQL接続
├── docs/
│   ├── DEVELOPMENT.md    # 開発状況・コード構成・引き継ぎ
│   └── mockups/          # PC・スマートフォンの画面サンプル
├── AGENTS.md             # AI開発向けの作業ガイド
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

ブラウザで`/api/health`を開き、`{"status":"ok","database":"ok"}`が返れば、
Hono → PostgreSQLの接続が成功しています。ダッシュボードのモックはAPIに接続せず表示できます。
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
