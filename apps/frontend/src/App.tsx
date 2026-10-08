import { useEffect, useRef, useState } from 'react';
import Icon from './components/Icon';
import type { IconName } from './components/Icon';
import { dashboardDate, notices, sites, weeklyAssignments } from './data/dashboard';
import AssignmentsPage from './pages/AssignmentsPage';
import SitesPage from './pages/SitesPage';
import OfficersPage from './pages/OfficersPage';
import AttendancePage from './pages/AttendancePage';
import SettingsPage from './pages/SettingsPage';
import ClientsPage from './pages/ClientsPage';
import ShiftsPage from './pages/ShiftsPage';
import ReportsPage from './pages/ReportsPage';
import AuthMockPage from './pages/AuthMockPage';
import MockEditorPage from './pages/MockEditorPage';
import GuardLayout from './components/GuardLayout';
import GuardHomePage from './pages/guard/GuardHomePage';
import { GuardAttendancePage, GuardSchedulePage, GuardSitePage } from './pages/guard/GuardDutyPages';
import { GuardIncidentPage, GuardReportEditorPage, GuardReportsPage, GuardRequestsPage, GuardShiftsPage } from './pages/guard/GuardSubmissionPages';
import { GuardContactPage, GuardEducationPage, GuardLoginPage, GuardNoticesPage, GuardProfilePage } from './pages/guard/GuardPersonalPages';
import { attendanceRecords } from './data/attendance';
import { clients } from './data/clients';
import { officers } from './data/personnel';
import { shiftPlans } from './data/shiftPlanning';
import { reports } from './data/reports';
import type { ComponentType } from 'react';

const mockPages: Record<string, { title: string; component: ComponentType } | undefined> = {
  '/login': { title: 'ログイン', component: AuthMockPage },
  '/account/activate': { title: '利用開始の設定', component: AuthMockPage },
  '/account/reset': { title: 'パスワード再設定', component: AuthMockPage },
  '/account/mfa': { title: '管理者の多要素認証', component: AuthMockPage },
  '/account/security': { title: '認証情報の変更', component: AuthMockPage },
  '/officers/new': { title: '隊員登録', component: MockEditorPage },
  '/officers/edit': { title: '隊員編集', component: MockEditorPage },
  '/clients/new': { title: '取引先登録', component: MockEditorPage },
  '/clients/edit': { title: '取引先編集', component: MockEditorPage },
  '/sites/new': { title: '現場登録', component: MockEditorPage },
  '/sites/edit': { title: '現場編集', component: MockEditorPage },
  '/assignments/new': { title: '勤務枠の作成', component: MockEditorPage },
  '/assignments/edit': { title: '配置編集・確認', component: MockEditorPage },
  '/assignments': { title: '配置・管理', component: AssignmentsPage },
  '/sites': { title: '現場管理', component: SitesPage },
  '/officers': { title: '隊員管理', component: OfficersPage },
  '/attendance': { title: '勤怠管理', component: AttendancePage },
  '/settings': { title: '設定', component: SettingsPage },
  '/clients': { title: '取引先管理', component: ClientsPage },
  '/shifts': { title: 'シフト・勤務希望', component: ShiftsPage },
  '/reports': { title: '日報・申し送り', component: ReportsPage },
  '/guard': { title: '警備員ホーム', component: GuardHomePage },
  '/guard/login': { title: '警備員ログイン', component: GuardLoginPage },
  '/guard/schedule': { title: '勤務予定', component: GuardSchedulePage },
  '/guard/site': { title: '現場情報', component: GuardSitePage },
  '/guard/attendance': { title: '出退勤・勤務実績', component: GuardAttendancePage },
  '/guard/shifts': { title: '勤務希望', component: GuardShiftsPage },
  '/guard/requests': { title: '各種申請', component: GuardRequestsPage },
  '/guard/reports': { title: '日報・申し送り', component: GuardReportsPage },
  '/guard/reports/new': { title: '日報・申し送りの入力', component: GuardReportEditorPage },
  '/guard/incident': { title: '事故・トラブル報告', component: GuardIncidentPage },
  '/guard/notices': { title: 'お知らせ', component: GuardNoticesPage },
  '/guard/education': { title: '教育・資格', component: GuardEducationPage },
  '/guard/contact': { title: '連絡先・ヘルプ', component: GuardContactPage },
  '/guard/profile': { title: 'マイページ', component: GuardProfilePage },
};

const navigation: { icon: IconName; label: string; href: string; next?: boolean }[] = [
  { icon: 'dashboard', label: 'ダッシュボード', href: '/' },
  { icon: 'calendar', label: '配置・管理', href: '/assignments' },
  { icon: 'building', label: '現場管理', href: '/sites' },
  { icon: 'building', label: '取引先管理', href: '/clients' },
  { icon: 'users', label: '隊員管理', href: '/officers' },
  { icon: 'calendar', label: 'シフト・勤務希望', href: '/shifts', next: true },
  { icon: 'clock', label: '勤怠管理', href: '/attendance', next: true },
  { icon: 'message', label: '日報・申し送り', href: '/reports', next: true },
];

const initialSites = sites.filter((site) => site.type !== 'event');
const required = initialSites.reduce((total, site) => total + site.required, 0);
const assigned = initialSites.reduce((total, site) => total + site.assigned, 0);
const publishedSites = initialSites.filter((site) => site.assigned >= site.required);
const publishedOfficers = publishedSites.reduce((total, site) => total + site.assigned, 0);
const working = sites.reduce((total, site) => total + site.working, 0);
const unassignedSites = initialSites.filter((site) => site.assigned < site.required);

function Sidebar({ activePath }: { activePath: string }) {
  const activeItem = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      activeItem.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activePath]);
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="KEIBI ホーム">
        <span className="brand-mark"><Icon name="shield" size={26} /></span>
        <span className="brand-name">KEIBI<span>クラウド管制システム</span></span>
      </a>
      <button className="tenant-selector" type="button" title="会社・拠点の切り替え（表示サンプル）">
        <span className="tenant-icon"><Icon name="building" size={19} /></span>
        <span className="tenant-name">東京セキュリティ<span>本社</span></span>
        <Icon name="chevrons" size={15} />
      </button>
      <span className="nav-caption">初回の業務 / 次期の参考</span>
      <nav aria-label="メインナビゲーション" className="main-nav">
        {navigation.map((item) => (
          <a key={item.label} href={item.href} ref={item.href === activePath ? activeItem : undefined} className={`nav-item${item.href === activePath ? ' is-active' : ''}`} aria-current={item.href === activePath ? 'page' : undefined}>
            <Icon name={item.icon} size={20} /><span>{item.label}</span>
            {item.next && <span className="scope-nav-tag">次期</span>}
            {item.href === activePath && <span className="nav-active-dot" />}
          </a>
        ))}
        <a href="/settings" className={`nav-item mobile-settings-link${activePath === '/settings' ? ' is-active' : ''}`} ref={activePath === '/settings' ? activeItem : undefined} aria-current={activePath === '/settings' ? 'page' : undefined}><Icon name="settings" size={20} /><span>設定</span></a>
      </nav>
      <div className="sidebar-bottom">
        <div className="support-note">
          <span className="support-icon"><Icon name="headphones" size={22} /></span>
          <strong>お困りのことはありますか？</strong>
          <p>操作や運用についてご相談ください。</p>
          <button type="button">サポートに問い合わせ<Icon name="arrow-up-right" size={14} /></button>
        </div>
        <a href="/settings" className={`nav-item settings-button${activePath === '/settings' ? ' is-active' : ''}`} aria-current={activePath === '/settings' ? 'page' : undefined}><Icon name="settings" size={20} /><span>設定</span>{activePath === '/settings' && <span className="nav-active-dot" />}</a>
        <div className="sidebar-user">
          <span className="avatar avatar-dark">田</span>
          <span className="user-name">田中 太郎<span>管制担当者</span></span>
          <a className="icon-button" href="/account/security" aria-label="認証情報変更・ログアウトの画面案"><Icon name="more" size={19} /></a>
        </div>
      </div>
    </aside>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="topbar">
      <div className="breadcrumb"><Icon name="home" size={16} /><span className="breadcrumb-divider">/</span><span>{title}</span></div>
      <div className="header-actions">
        <a href="/guard" className="portal-preview-link"><Icon name="shield" size={16} /><span>警備員画面</span></a>
        <span className="mock-label"><span />プレビューモック</span><span className="header-divider" />
        <a href="/login" className="icon-button" aria-label="ログイン画面の見本"><Icon name="shield" size={20} /></a>
        <a href="/account/security" className="icon-button" aria-label="認証情報変更・ログアウトの画面案"><Icon name="settings" size={20} /></a>
        <span className="avatar avatar-light" aria-label="田中 太郎">田</span>
      </div>
    </header>
  );
}

function Overview() {
  const metrics: { label: string; icon: IconName; color: string; value: number; denominator?: number; unit: string; note: string; detail: string; detailIcon: IconName; href: string }[] = [
    { label: '本日の対象現場', icon: 'building', color: 'blue', value: initialSites.length, unit: '件', note: '初回：交通誘導・施設警備', detail: 'すべての現場を確認', detailIcon: 'arrow-right', href: '/sites' },
    { label: '公開中の確定配置', icon: 'users', color: 'teal', value: publishedOfficers, unit: '名', note: `${publishedSites.length}勤務枠 · 人数充足の表示例`, detail: '公開中の配置を確認', detailIcon: 'check-circle', href: '/assignments?filter=complete' },
    { label: '調整中の下書き', icon: 'calendar', color: 'violet', value: unassignedSites.length, unit: '件', note: `${assigned - publishedOfficers}名を仮配置 · 本人非公開`, detail: '下書きを確認', detailIcon: 'arrow-right', href: '/assignments?filter=shortage' },
    { label: '下書きの不足人数', icon: 'user-plus', color: 'amber', value: required - assigned, unit: '名', note: '人数がそろってから確定します', detail: '不足の現場を確認', detailIcon: 'alert', href: '/assignments?filter=shortage' },
  ];
  return (
    <section className="overview-grid" aria-label="本日の業務サマリー">
      {metrics.map((metric) => (
        <article className={`metric-card metric-${metric.color}`} key={metric.label}>
          <div className="metric-heading"><span>{metric.label}</span><span className="metric-icon"><Icon name={metric.icon} size={19} /></span></div>
          <div className="metric-value"><strong>{metric.value}</strong>{metric.denominator && <span className="metric-denominator">/ {metric.denominator}</span>}<span className="metric-unit">{metric.unit}</span></div>
          <p className="metric-note">{metric.note}</p>
          <a href={metric.href} className="metric-detail"><Icon name={metric.detailIcon} size={14} /><span>{metric.detail}</span></a>
        </article>
      ))}
    </section>
  );
}

function SiteAssignments() {
  const [filter, setFilter] = useState<'all' | 'unassigned'>('all');
  const [query, setQuery] = useState('');
  const filteredSites = (filter === 'unassigned' ? unassignedSites : initialSites).filter((site) => `${site.name} ${site.client}`.includes(query.trim()));
  const visibleSites = filteredSites.slice(0, 6);
  return (
    <section className="panel assignments-panel" aria-labelledby="assignments-title">
      <div className="panel-heading">
        <div className="panel-title"><span className="section-icon"><Icon name="calendar" size={19} /></span><h2 id="assignments-title">本日の勤務枠・公開状況</h2><span className="count-label">{initialSites.length}件</span></div>
        <a href="/assignments" className="text-button">配置表を開く<Icon name="arrow-up-right" size={15} /></a>
      </div>
      <div className="table-toolbar">
        <div className="table-tabs" role="group" aria-label="現場の表示切り替え">
          <button type="button" className={filter === 'all' ? 'is-selected' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>すべて<span>{initialSites.length}</span></button>
          <button type="button" className={filter === 'unassigned' ? 'is-selected' : ''} aria-pressed={filter === 'unassigned'} onClick={() => setFilter('unassigned')}>未配置あり<span className="tab-warning-count">{unassignedSites.length}</span></button>
        </div>
        <label className="site-search"><Icon name="search" size={16} /><input aria-label="現場名・取引先で検索" placeholder="現場名・取引先で検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <p className="table-scroll-hint">左右にスクロールして配置状況を確認できます<Icon name="arrow-right" size={12} /></p>
      <div className="table-scroll">
        <table className="sites-table">
          <thead><tr><th scope="col">現場名 / 取引先</th><th scope="col">勤務時間</th><th scope="col">配置人数</th><th scope="col">状況</th><th scope="col"><span className="sr-only">詳細</span></th></tr></thead>
          <tbody>
            {visibleSites.map((site) => {
              const needsAssignment = site.assigned < site.required;
              return (
                <tr key={site.id}>
                  <td><div className="site-name-cell"><span className={`site-type-icon type-${site.type}`}><Icon name={site.type === 'traffic' ? 'traffic' : site.type === 'event' ? 'flag' : 'building'} size={18} /></span><span><strong>{site.name}</strong><span className="site-client">{site.client}<span className="site-type-label">{site.category}</span></span></span></div></td>
                  <td><span className="work-time">{site.hours}</span><span className="shift-type">{site.shift}</span></td>
                  <td><div className={`assignment-count${needsAssignment ? ' has-shortage' : ''}`}><strong>{site.assigned}</strong><span>/ {site.required}名</span>{needsAssignment && <span className="shortage-label">−{site.required - site.assigned}</span>}</div><div className={`assignment-progress${needsAssignment ? ' has-shortage' : ''}`}><span style={{ width: `${site.assigned / site.required * 100}%` }} /></div></td>
                  <td><span className={`status-badge status-${needsAssignment ? 'warning' : 'active'}`}><span />{needsAssignment ? '下書き・非公開' : '確定・公開中'}</span></td>
                  <td><a className="icon-button row-action" href={`/assignments?site=${site.id}`} aria-label={`${site.name}の勤務枠を確認`}><Icon name="chevron-right" size={16} /></a></td>
                </tr>
              );
            })}
            {visibleSites.length === 0 && <tr><td colSpan={5} className="empty-results">該当する現場がありません。</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span>{filteredSites.length}件中 {visibleSites.length}件を表示</span><span className="table-footer-note"><span className="live-dot" />サンプルデータ</span></div>
    </section>
  );
}

function Attendance() {
  return (
    <section className="panel attendance-panel" aria-labelledby="attendance-title">
      <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="activity" size={19} /></span><h2 id="attendance-title">隊員の稼働状況</h2></div><a href="/attendance" className="text-button">勤怠を見る<Icon name="arrow-up-right" size={13} /></a></div>
      <div className="attendance-body">
        <div className="attendance-chart" role="img" aria-label="配置済み32名のうち勤務中29名、上番前2名、下番済み1名">
          <svg viewBox="0 0 160 160" aria-hidden="true"><circle className="donut-track" cx="80" cy="80" r="65" /><circle className="donut-working" cx="80" cy="80" r="65" pathLength="100" strokeDasharray="90.625 9.375" /><circle className="donut-waiting" cx="80" cy="80" r="65" pathLength="100" strokeDasharray="6.25 93.75" strokeDashoffset="-90.625" /></svg>
          <div className="donut-center"><span>勤務中</span><strong>{working}<small>名</small></strong><span className="donut-rate">{Math.round(working / sites.reduce((sum, site) => sum + site.assigned, 0) * 100)}<small>%</small></span></div>
        </div>
        <div className="attendance-legend">
          <div><span className="legend-label"><i className="legend-dot dot-teal" />勤務中</span><strong>{working}<small>名</small></strong></div>
          <div><span className="legend-label"><i className="legend-dot dot-amber" />上番前</span><strong>2<small>名</small></strong></div>
          <div><span className="legend-label"><i className="legend-dot dot-gray" />下番済み</span><strong>1<small>名</small></strong></div>
        </div>
      </div>
      <div className="attendance-note"><Icon name="check-circle" size={15} /><span>上番予定を過ぎた未報告者はいません</span></div>
    </section>
  );
}

function Notices() {
  return (
    <section className="panel notices-panel" aria-labelledby="notices-title">
      <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="message" size={19} /></span><h2 id="notices-title">連絡事項</h2><span className="unread-count">2</span></div><a href="/reports" className="icon-button" aria-label="日報・申し送りをすべて表示"><Icon name="arrow-up-right" size={17} /></a></div>
      <div className="notice-list">
        {notices.map((notice) => (
          <article className="notice-item" key={notice.id}>
            <span className={`notice-indicator${notice.unread ? ' is-unread' : ''}`} />
            <div><div className="notice-meta"><span className={`notice-category category-${notice.categoryColor}`}>{notice.category}</span><time>{notice.time}</time></div><h3><a href={`/reports?report=${notice.id}`}>{notice.title}</a></h3><p>{notice.description}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WeeklyOutlook() {
  return (
    <section className="panel weekly-panel" aria-labelledby="weekly-title">
      <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="chart" size={19} /></span><h2 id="weekly-title">今週の配置見通し</h2><span className="weekly-range">10/4 − 10/10</span></div><div className="weekly-key"><span><i className="legend-dot dot-teal" />配置済み</span><span><i className="legend-dot dot-pale" />未配置</span></div></div>
      <div className="weekly-grid">
        {weeklyAssignments.map((day, index) => (
          <div className={`week-day${index === 0 ? ' is-today' : ''}`} key={day.date}>
            <div className="week-day-heading"><span className={day.weekday === '日' ? 'is-sunday' : day.weekday === '土' ? 'is-saturday' : ''}>{day.date}<small>（{day.weekday}）</small></span>{index === 0 && <span className="today-label">基準日</span>}</div>
            <div className="week-count"><strong>{day.assigned}</strong><span>/ {day.required}<small>名</small></span>{day.required === day.assigned && <Icon name="check-circle" size={15} />}</div>
            <div className="week-progress"><span style={{ width: `${day.assigned / day.required * 100}%` }} /></div>
            <span className={`week-caption${day.required > day.assigned ? ' needs-attention' : ''}`}>{day.required > day.assigned ? `あと${day.required - day.assigned}名` : '配置完了'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfirmationTasks() {
  const tasks: { title: string; count: number; unit: string; note: string; icon: IconName; href: string }[] = [
    { title: '勤怠の確認', count: attendanceRecords.filter((record) => record.date === dashboardDate.iso && record.reviewNote).length, unit: '件', note: '上番時刻・休憩の変更', icon: 'clock', href: '/attendance?filter=review' },
    { title: '勤務希望の申請', count: shiftPlans.filter((plan) => plan.requestPending).length, unit: '件', note: '翌日以降の配置に反映', icon: 'calendar', href: '/shifts?filter=requests' },
    { title: '日報・申し送り', count: reports.filter((report) => report.status !== 'done').length, unit: '件', note: '未対応・確認中の報告', icon: 'message', href: '/reports' },
    { title: '契約書類の確認', count: clients.filter((client) => client.documentPending).length, unit: '社', note: '取引先と更新条件を確認', icon: 'building', href: '/clients?filter=pending' },
    { title: '教育予定の未登録', count: officers.filter((officer) => officer.status === 'active' && officer.educationPending).length, unit: '名', note: '受講予定を確認', icon: 'shield', href: '/officers?filter=education' },
    { title: '勤務希望の未提出', count: shiftPlans.filter((plan) => plan.days.slice(1).includes('pending')).length, unit: '名', note: '翌日以降の予定を確認', icon: 'users', href: '/shifts?filter=pending' },
  ];
  return <section className="panel confirmation-panel" aria-labelledby="confirmation-title"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="check-circle" size={19} /></span><h2 id="confirmation-title">管制の確認事項</h2></div><span className="small-muted">対応の入口</span></div><div className="confirmation-grid">{tasks.map((task) => <a href={task.href} className="confirmation-item" key={task.title}><span className="confirmation-icon"><Icon name={task.icon} size={18} /></span><span><strong>{task.title}</strong><small>{task.note}</small></span><span className="confirmation-count">{task.count}<small>{task.unit}</small></span><Icon name="chevron-right" size={14} /></a>)}</div></section>;
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isGuard = path === '/guard' || path.startsWith('/guard/');
  const currentPage = mockPages[path];
  const Page = currentPage?.component;
  const title = currentPage?.title ?? (path === '/' ? 'ダッシュボード' : '画面が見つかりません');
  const isAuth = path === '/login' || path.startsWith('/account/');
  const isNext = navigation.some((item) => item.href === path && item.next);
  const activePath = '/' + path.split('/')[1];

  useEffect(() => {
    document.title = `${title} | KEIBI ${isGuard ? '警備員ポータル' : 'クラウド管制'}`;
  }, [title, isGuard]);

  if (!currentPage && path !== '/') return <main className="authm-page"><h1>画面が見つかりません</h1><p>URLを確認するか、モックの一覧へ戻ってください。</p><a href={isGuard ? '/guard' : '/'} className="authm-preview">ホームへ戻る<Icon name="arrow-right" size={15} /></a></main>;
  if (isAuth && Page) return <Page />;
  if (isGuard) return <GuardLayout path={path} title={title}>{Page ? <Page /> : <GuardHomePage />}</GuardLayout>;

  return (
    <div className="app-layout">
      <Sidebar activePath={currentPage ? activePath : '/'} />
      <div className="main-layout">
        <Header title={title} />
        <div className="mock-context" role="note"><Icon name="help" size={13} /><span>画面確認用のモックです。登録・保存・通知・出力は行いません。基準日時：2026/10/4 09:30</span></div>
        <div className={`scope-context${isNext ? ' is-next' : ''}`} role="note"><span className="scope-tag">{isNext ? '次期の参考' : '初回の画面案'}</span><span>{isNext ? '将来の業務フローを確認するためのサンプルです。初回は既存の連絡・記録方法を使います。' : '取引先・現場・隊員の登録 → 配置の下書き・確定 → 本人の勤務予定確認。保存・認証は未実装です。'}</span></div>
        {Page ? <Page /> : <main className="dashboard">
          <div className="page-heading">
            <div><div className="page-eyebrow"><span className="live-dot" />DAILY OVERVIEW</div><h1>ダッシュボード</h1><p>おはようございます、田中さん。本日の管制状況を確認しましょう。</p></div>
            <div className="page-actions"><div className="date-selector"><Icon name="calendar" size={17} /><time dateTime={dashboardDate.iso}>{dashboardDate.label}</time><span className="date-today">基準日</span></div><a href="/sites/new" className="primary-button"><Icon name="plus" size={17} />現場を追加</a></div>
          </div>
          <Overview />
          <div className="attention-banner" role="note">
            <span className="attention-icon"><Icon name="alert" size={19} /></span>
            <div><strong>本日、{required - assigned}名の配置が必要です</strong><span>渋谷駅前・新宿西口・世田谷区の現場で未配置があります。</span></div>
            <button type="button" className="attention-button" onClick={() => document.getElementById('assignments-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>配置状況を確認<Icon name="arrow-right" size={16} /></button>
          </div>
          <div className="scope-flow" aria-label="初回の業務フロー"><a href="/settings">1 会社・利用者を準備</a><Icon name="chevron-right" size={15} /><a href="/officers">2 隊員・現場を登録</a><Icon name="chevron-right" size={15} /><a href="/assignments">3 配置を確定</a><Icon name="chevron-right" size={15} /><a href="/guard/schedule">4 本人が予定を確認</a></div>
          <SiteAssignments />
          <details className="scope-future-panel"><summary><span className="scope-tag is-next">次期の参考</span>勤怠・報告・勤務希望などの画面案を確認</summary><p>以下は独立した架空の表示例です。初回の確定配置・本人予定と連動しません。雑踏警備も次期の参考に含みます。</p><ConfirmationTasks /><div className="operations-grid"><Attendance /><Notices /></div><WeeklyOutlook /></details>
          <footer className="dashboard-footer"><span>毎日の管制業務を、もっとスムーズに。</span><span>KEIBI<span className="footer-dot">·</span>画面確認用のサンプルデータを表示しています</span></footer>
        </main>}
      </div>
    </div>
  );
}
