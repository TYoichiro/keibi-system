# keibi-system

警備会社向けのクラウド型管制業務支援システムを開発しています。
会社ごとに利用できるマルチテナントWebアプリを目指し、必要最低限の機能から段階的に実装します。
現在は見た目を確認する段階で、管理者・管制向けの9画面と、現場へ行く警備員向けの14画面のモックを作成済みです。

ReactのSPAとHonoのAPIを、npm workspacesで1つのリポジトリにまとめています。
フロントエンドはReact + Vite + TypeScript、バックエンドはHono + Node.js + TypeScriptです。
DBにはPostgreSQL 18を使い、3つのサービスをDocker Composeで起動します。
バックエンドからDBへの接続には`pg`（node-postgres）のコネクションプールを使います。

## 現在の開発状況

更新日: 2026年10月8日（日本時間）

| 区分 | 状況 |
| --- | --- |
| 画面 | 管理者・管制向け9画面（設定は4カテゴリ）と、警備員ポータル14画面 |
| 画面操作 | 検索、絞り込み、ページ送り、詳細切り替え、勤務希望・日報・申請・設定などの入力プレビューを確認可能 |
| 表示確認 | PC・スマートフォンで確認済み。画面サンプルを`docs/mockups/`に保存 |
| データ | TypeScript内の架空のサンプル。主な基準日は2026年10月4日で、現在日付には連動しない |
| API・DB | HonoとPostgreSQLの接続基盤、および接続確認用の`GET /api/health`を実装 |
| 未実装 | ログイン、会社ごとのデータ分離、権限制御、業務テーブル・API、登録・更新・保存、実際の通知・出力 |

会社・拠点の表示や設定画面の権限表はモックです。現時点でマルチテナント対応や権限制御が完成しているわけではありません。
各画面の具体的な操作範囲は、下の「画面のモック」に記載しています。
管理画面ヘッダーの「警備員画面」から警備員ポータルへ、警備員画面の「管理者モック」から管理画面へ移動できます。この切り替えは表示確認用で、認証・権限の切り替えではありません。

## AI開発・引き継ぎ資料

| 資料 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | AIが作業するときの方針、編集の基準、確認するコマンド |
| [開発状況・実装ガイド](docs/DEVELOPMENT.md) | 作成済みの画面、ソースの配置、データの関係、検証履歴、未決事項と今後の実装候補 |
| [初回実装の要件書 草案](docs/requirements/MVP_REQUIREMENTS.md) | 初回に実装する機能、業務ルール、利用者ごとの権限表、実装前の確認事項 |
| [初回のデータ設計案](docs/requirements/MVP_DATA_DESIGN.md) | 会社・利用者・隊員・現場・配置の関係図、拠点ごとの登録枠、保存項目、会社境界、配置変更と重複防止の設計案 |
| [実装前レビュー・不足資料の案内](docs/requirements/IMPLEMENTATION_READINESS.md) | 考慮不足と実装への影響、未決事項D01〜D16、判断する時期。補足資料の入口 |
| [状態遷移・変更時の影響](docs/requirements/MVP_STATE_TRANSITIONS.md) | 改訂・破棄・取消・日時境界、退職・資格・現場・異動と確定済み予定の扱い |
| [API契約案](docs/requirements/MVP_API_CONTRACT.md) | 業務APIの入力・公開項目・エラー・更新競合・再送結果の契約案 |
| [画面仕様案](docs/requirements/MVP_SCREEN_SPEC.md) | 23モックの初回採否、不足する認証・編集操作、入力・通信失敗・スマートフォンの確認条件 |
| [試験運用準備票](docs/requirements/PILOT_OPERATIONS.md) | 発行・MFA復旧・変更連絡・障害復旧・保持削除の記入票と公式参考資料 |
| [AI Agentへの実装引き継ぎ](docs/requirements/AI_IMPLEMENTATION_HANDOFF.md) | 将来の実装依頼テンプレート、段階ごとの成果と着手条件、受入シナリオ |
| [SECURITY.md](SECURITY.md) | API・DBの既存の対策と、認証・認可や本番公開に向けた実装範囲 |
| [セキュリティチェックリスト](docs/SECURITY_CHECKLIST.md) | 警備業務の個人情報・現場情報を守るための60項目、優先度、完了条件、公開前の検証例 |

次の作業では、まず本READMEと`AGENTS.md`、`docs/DEVELOPMENT.md`を参照してください。
2026年10月8日のレビューで補足した資料は提案・確認用であり、未決の業務条件やAPI仕様を承認済みにしたものではありません。現在は資料準備までとし、実装開始は別途の依頼を受けてから行います。
画面や機能を追加・変更した際は、動作する部分と表示のみの部分が分かるように、これらの資料も更新します。

## 管理者・管制向けの画面のモック

### ダッシュボード

現在のトップ画面は、警備会社の管制業務を想定した画面確認用のモックです。
会社・拠点、本日の現場数と配置人数、未配置の現場、勤務状況、連絡事項、1週間の配置見通しを表示します。
「管制の確認事項」から、要確認の勤怠、勤務希望の申請・未提出、日報・申し送り、契約書類、教育予定を確認できます。件数は各画面のサンプルから集計します。
データは2026年10月4日を基準にした架空のサンプルです。

現場の検索と「未配置あり」の絞り込みを確認できます。
サイドバーや各カードから関連画面に移動できます。現場の詳細と連絡事項は、該当する現場・報告を選択して開きます。
認証、会社ごとのデータ分離、登録・更新、API連携は今後実装します。
サンプルデータは`apps/frontend/src/data/dashboard.ts`で変更できます。

画面サンプル: [PC](docs/mockups/dashboard-desktop.png) / [スマートフォン](docs/mockups/dashboard-mobile.png)

### 配置・管理

http://localhost:5173/assignments で現場別の配置表を確認できます。
必要人数・配置隊員・現場責任者・未配置枠と、配置可能な隊員のシフト・資格を表示します。
現場名を選ぶと、右側の「選択中の現場」に集合場所、配置条件、配置メモを表示します。
`/assignments?site=S002`で現場を指定でき、`/assignments?filter=shortage`で不足の現場を表示します。
隊員名から隊員詳細へ、現場詳細から現場管理へ移動できます。絞り込み後の選択中の現場も表示対象に合わせます。

不足あり・配置完了・勤務帯での絞り込み、現場・取引先・隊員の検索、配置可能な隊員の検索が動作します。
隊員の配置・配置の確定・配置表の出力は表示のみです。登録・保存やAPIへの送信は行いません。
配置表のサンプルはダッシュボードと同じ現場データを使い、隊員名や現場詳細は`apps/frontend/src/data/assignments.ts`で管理します。

画面サンプル: [PC](docs/mockups/assignments-desktop.png) / [スマートフォン](docs/mockups/assignments-mobile.png)

### 現場管理

http://localhost:5173/sites で現場一覧と選択した現場の詳細を確認できます。
登録現場は16件で、稼働中の12件はダッシュボード・配置表と共通です。
準備中・休止中・終了した現場も含み、警備種別、勤務時間、人数、契約期間を一覧に表示します。
詳細には所在地、集合場所、配置条件、担当者・連絡先、現場メモを表示します。
取引先名から取引先詳細へ移動できます。稼働中の現場では、本日の配置表も現場を選択して開けます。

現場・取引先・所在地の検索、状態・警備種別・契約更新予定による絞り込み、8件ずつのページ送り、現場詳細の切り替えが動作します。
`/sites?site=S013`のように現場IDを指定して詳細を開くこともできます。
登録・編集・一覧出力は表示のみです。サンプルの住所・氏名・電話番号・契約情報は架空のデータです。
現場管理のサンプルは`apps/frontend/src/data/siteManagement.ts`で管理します。

画面サンプル: [PC](docs/mockups/sites-desktop.png) / [スマートフォン](docs/mockups/sites-mobile.png)

### 取引先管理

http://localhost:5173/clients で取引先8社の窓口、社内担当者、締め・支払条件、契約書類の確認状況を表示します。
取引先と現場の関係は現場管理の16件を共用し、詳細から関連現場へ移動できます。
検索、契約書類の確認待ちによる絞り込み、詳細選択が動作します。
`/clients?client=C002`で取引先を指定し、`/clients?filter=pending`で契約書類の確認待ちを表示できます。
登録・編集・出力は表示のみです。契約書類の添付・保管や請求計算は実装していません。
連絡先・取引条件・書類の確認状況は架空のサンプルで、`apps/frontend/src/data/clients.ts`で管理します。

画面サンプル: [PC](docs/mockups/clients-desktop.png) / [スマートフォン](docs/mockups/clients-mobile.png)

### 隊員管理

http://localhost:5173/officers で隊員一覧と選択した隊員の詳細を確認できます。
登録隊員40名（在籍37名・休職2名・退職1名）を表示し、配置済みの32名・配置可能な5名は配置表と共通です。
一覧には雇用区分、保有資格、本日の配置、在籍状態を表示し、詳細には勤務可能時間、対応エリア、連絡先、教育記録、管制メモを表示します。

隊員・ID・配置現場・対応エリアの検索、在籍状態・配置可否・資格・雇用区分・教育予定未登録による絞り込み、8名ずつのページ送り、隊員詳細の切り替えが動作します。
`/officers?officer=G033`のように隊員IDを指定して詳細を開くこともできます。
配置現場の詳細、本日の勤怠、在籍隊員の勤務希望へ移動できます。
`/officers?filter=education`で教育予定未登録の隊員を表示します。登録・編集・一覧出力は表示のみです。
氏名・連絡先・資格・教育記録は架空のサンプルで、`apps/frontend/src/data/personnel.ts`で管理します。

画面サンプル: [PC](docs/mockups/officers-desktop.png) / [スマートフォン](docs/mockups/officers-mobile.png)

### シフト・勤務希望

http://localhost:5173/shifts で在籍隊員37名の10月4日〜10日の勤務希望を表示します。
本日の配置済み32名・勤務可能5名は既存の配置・隊員データと共通です。
翌日以降は勤務可・休み希望・未提出の表示例で、確認待ちの休暇・勤務時間の申請2件を含みます。
検索、未提出・申請確認待ちによる絞り込み、8名ずつのページ送り、詳細選択が動作します。
`/shifts?officer=G033`で隊員を指定し、`/shifts?filter=requests`で確認待ちの申請、`/shifts?filter=pending`で未提出の隊員を表示します。
提出依頼・申請確認の記録は表示のみです。翌日以降の配置表・週間配置見通しとは連動しません。
架空の勤務希望は`apps/frontend/src/data/shiftPlanning.ts`で管理します。

画面サンプル: [PC](docs/mockups/shifts-desktop.png) / [スマートフォン](docs/mockups/shifts-mobile.png)

### 勤怠管理

http://localhost:5173/attendance で日別の勤怠一覧と打刻・報告の詳細を確認できます。
2026年10月4日9:30時点のサンプルは、勤務中29名・上番前2名・下番済み1名です。
前日（10月3日）のサンプルにも切り替えられ、下番未報告や夜勤の翌日打刻を確認できます。
勤務予定と報告された上番・下番時刻を分けて表示し、勤務実績は下番済みの勤怠のみ休憩を除いて集計します。

日付切り替え、隊員・ID・現場の検索、勤怠状態・要確認・現場・勤務帯による絞り込み、8名ずつのページ送り、勤怠詳細の切り替えが動作します。
右側の確認対象を選ぶと、打刻時刻や休憩予定の変更メモを表示します。
`/attendance?officer=G032`のように隊員IDを指定して本日の勤怠詳細を開くこともできます。
`/attendance?filter=review`で要確認の勤怠を表示できます。
隊員情報・現場詳細へ移動できます。打刻修正・勤怠確定・出力は表示のみで、保存やAPI送信は行いません。
架空の勤怠サンプルは`apps/frontend/src/data/attendance.ts`で管理します。

画面サンプル: [PC](docs/mockups/attendance-desktop.png) / [スマートフォン](docs/mockups/attendance-mobile.png)

### 日報・申し送り

http://localhost:5173/reports で申し送り・勤務希望・警備日報・事故や苦情の報告6件を表示します。
担当者、対応期限、未対応・確認中・対応済みの状態、次の対応、対応履歴を確認できます。
ダッシュボードの連絡事項3件と同じID・内容を使い、報告から関連する現場・隊員・勤務希望へ移動できます。
検索、種別・対応状況による絞り込み、詳細選択が動作します。
`/reports?report=R004`で報告を指定し、`/reports?filter=open`で未対応の報告を表示します。共通ヘッダーの通知アイコンからも開けます。
登録・対応記録・対応完了・出力は表示のみで、報告の送信や状態の保存は行いません。
架空の報告・対応履歴は`apps/frontend/src/data/reports.ts`で管理します。

画面サンプル: [PC](docs/mockups/reports-desktop.png) / [スマートフォン](docs/mockups/reports-mobile.png)

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

## 警備員向けの画面のモック

http://localhost:5173/guard で警備員ポータルを開けます。
会社の警備員本人が、勤務前の予定確認から現場での出退勤・報告まで使うことを想定しています。
スマートフォンでは下部の「ホーム・勤務予定・出退勤・日報・マイページ」と右上のメニュー、PCでは専用サイドバーから全機能に移動できます。

サンプル利用者は東京セキュリティ本社の田中 和也さん（`G004`）です。
担当現場は新宿西口 道路舗装工事（`S002`）。氏名・現場・配置隊員・勤務時間・勤怠・本人の報告・資格・教育記録は、管理画面と同じサンプルを参照します。
基準日時は2026年10月4日09:30のままです。翌日以降の配置は未確定として表示し、勤務希望と区別します。

| 画面 | URL | 主な表示・確認操作 | PC | スマートフォン |
| --- | --- | --- | --- | --- |
| ログイン | `/guard/login` | 会社コード・メール・パスワードの表示例、サンプル画面への移動 | [画像](docs/mockups/guard-login-desktop.png) | [画像](docs/mockups/guard-login-mobile.png) |
| ホーム | `/guard` | 本日の勤務・出退勤・連絡・確認事項・持ち物チェック | [画像](docs/mockups/guard-desktop.png) | [画像](docs/mockups/guard-mobile.png) |
| 勤務予定 | `/guard/schedule` | 日付選択、本人の勤務・配置待ち、現場情報への移動 | [画像](docs/mockups/guard-schedule-desktop.png) | [画像](docs/mockups/guard-schedule-mobile.png) |
| 現場情報 | `/guard/site` | 集合場所・アクセス模式図・指示・配置隊員・連絡先の確認 | [画像](docs/mockups/guard-site-desktop.png) | [画像](docs/mockups/guard-site-mobile.png) |
| 出退勤・勤務実績 | `/guard/attendance` | 本日の打刻表示、休憩入力、10/3・4の勤務記録の切り替え | [画像](docs/mockups/guard-attendance-desktop.png) | [画像](docs/mockups/guard-attendance-mobile.png) |
| 勤務希望 | `/guard/shifts` | 10/4〜10/10の勤務可・休み希望・未提出、希望時間・補足の入力 | [画像](docs/mockups/guard-shifts-desktop.png) | [画像](docs/mockups/guard-shifts-mobile.png) |
| 各種申請 | `/guard/requests` | 休暇・勤務時間変更・打刻修正・交通費や経費のフォーム、申請履歴 | [画像](docs/mockups/guard-requests-desktop.png) | [画像](docs/mockups/guard-requests-mobile.png) |
| 日報・申し送り | `/guard/reports` | 本人の報告の絞り込み、管制の確認履歴 | [画像](docs/mockups/guard-reports-desktop.png) | [画像](docs/mockups/guard-reports-mobile.png) |
| 日報・申し送りの入力 | `/guard/reports/new` | 業務内容・異常の有無・申し送りの入力と内容プレビュー | [画像](docs/mockups/guard-report-editor-desktop.png) | [画像](docs/mockups/guard-report-editor-mobile.png) |
| 事故・トラブル報告 | `/guard/incident` | 発生日時・場所・負傷や物損・対応状況の入力、本人の報告履歴 | [画像](docs/mockups/guard-incident-desktop.png) | [画像](docs/mockups/guard-incident-mobile.png) |
| お知らせ | `/guard/notices` | 本人向けの現場連絡・勤務連絡・社内共有、未読絞り込み・確認済みプレビュー | [画像](docs/mockups/guard-notices-desktop.png) | [画像](docs/mockups/guard-notices-mobile.png) |
| 教育・資格 | `/guard/education` | 本人の資格・受講記録、研修予定・資料名の表示例 | [画像](docs/mockups/guard-education-desktop.png) | [画像](docs/mockups/guard-education-mobile.png) |
| 連絡先・ヘルプ | `/guard/contact` | 管制・現場担当者の連絡先、よくある質問の開閉 | [画像](docs/mockups/guard-contact-desktop.png) | [画像](docs/mockups/guard-contact-mobile.png) |
| マイページ | `/guard/profile` | 本人の所属・連絡先・通知設定の入力プレビュー | [画像](docs/mockups/guard-profile-desktop.png) | [画像](docs/mockups/guard-profile-mobile.png) |

`/guard/requests?kind=correction`で打刻修正のフォーム、`/guard/reports?report=R004`で本人の報告、`/guard/notices?notice=N003`で社内の教育案内を直接開けます。
申請履歴・本人向け連絡の一部・研修予定・資料名は独立した架空の表示例で、管理画面に登録されたデータではありません。

入力・チェック・確認状態は画面内だけのプレビューで、移動・再読み込みで初期値に戻ります。
提出・保存・下番報告・発信などのモックボタンは「送信・保存・発信は行っていません」と表示するだけです。
ファイル選択はファイル名の確認のみで、読込・アップロード・保管は行いません。アクセス図は模式図で、実際の地図・経路案内は未実装です。
ログイン・パスワード再設定・打刻・申請・日報送信・通知配信・資料の閲覧やダウンロードは実装していません。
本人向けの表示範囲は固定サンプルの抽出です。管理画面へのアクセス防止や会社・利用者の認可は、本実装時にAPI側で設計・実装します。

## 画面を起動する

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
