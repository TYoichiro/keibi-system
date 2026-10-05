import { useState } from 'react';
import Icon from '../components/Icon';
import { EmptyRows, ListPagination, StatusBadge, SummaryCards } from '../components/ManagementUI';
import type { SummaryItem } from '../components/ManagementUI';
import { normalizeSearch } from '../data/personnel';
import { reportKinds, reportOfficer, reports, reportSite, reportStatuses } from '../data/reports';
import type { ReportStatus } from '../data/reports';
import './management.css';
import './review.css';

type ReportFilter = 'all' | ReportStatus;
const pageSize = 8;

export default function ReportsPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('report');
  const initialIndex = Math.max(0, reports.findIndex((report) => report.id === requestedId));
  const [selectedId, setSelectedId] = useState(reports[initialIndex].id);
  const [filter, setFilter] = useState<ReportFilter>(params.get('filter') === 'open' ? 'open' : 'all');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(Math.floor(initialIndex / pageSize));
  const filtered = reports.filter((report) => (filter === 'all' || report.status === filter) && (kind === 'all' || report.kind === kind) && normalizeSearch(`${report.id} ${report.title} ${report.owner} ${report.reporter} ${reportSite(report)?.name ?? ''}`).includes(normalizeSearch(query)));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visible.find((report) => report.id === selectedId) ?? visible[0];
  const site = selected && reportSite(selected);
  const officer = selected && reportOfficer(selected);
  const count = (status: ReportStatus) => reports.filter((report) => report.status === status).length;
  const urgent = reports.filter((report) => report.urgent && report.status !== 'done');
  const summary: SummaryItem[] = [
    { label: '未対応', value: count('open'), unit: '件', note: '担当者による確認待ち', icon: 'message', tone: 'amber' },
    { label: '確認中', value: count('checking'), unit: '件', note: '対応結果を確認', icon: 'clock', tone: 'blue' },
    { label: '優先対応', value: urgent.length, unit: '件', note: '事故・苦情などの確認', icon: 'alert', tone: 'amber' },
    { label: '対応済み', value: count('done'), unit: '件', note: '確認履歴を参照', icon: 'check-circle', tone: 'green' },
  ];
  const tabs: { value: ReportFilter; label: string; count: number }[] = [{ value: 'all', label: 'すべて', count: reports.length }, { value: 'open', label: '未対応', count: count('open') }, { value: 'checking', label: '確認中', count: count('checking') }, { value: 'done', label: '対応済み', count: count('done') }];
  function clearFilters() { setFilter('all'); setKind('all'); setQuery(''); setPage(0); }

  return (
    <main className="dashboard reports-page review-page">
      <div className="page-heading management-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />REPORTS & HANDOVER</div><h1>日報・申し送り</h1><p>現場や隊員からの報告を集約し、担当者と対応状況を確認します。</p></div><div className="management-heading-actions"><button type="button" className="secondary-button" title="報告出力は表示サンプルです"><Icon name="download" size={16} />一覧を出力</button><button type="button" className="primary-button" title="報告の登録は表示サンプルです"><Icon name="plus" size={17} />報告を登録</button></div></div>
      <SummaryCards items={summary} label="日報・申し送りの対応サマリー" />
      <div className="management-banner banner-amber" role="note"><span className="management-banner-icon"><Icon name="alert" size={18} /></span><div><strong>優先して確認する報告が{urgent.length}件あります</strong><span>新宿西口の誘導に関するご意見。現場への確認が進行中です。</span></div><button type="button" onClick={() => { clearFilters(); setFilter('checking'); setSelectedId(urgent[0].id); }}>対応状況を見る<Icon name="arrow-right" size={15} /></button></div>
      <div className="management-workspace">
        <section className="panel review-list-panel" aria-labelledby="reports-list-title">
          <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="message" size={19} /></span><h2 id="reports-list-title">報告・連絡一覧</h2><span className="count-label">{reports.length}件</span></div><span className="small-muted">10/3〜10/4のサンプル</span></div>
          <div className="management-tabs table-tabs" role="group" aria-label="報告の対応状況で絞り込み">{tabs.map((tab) => <button type="button" key={tab.value} className={filter === tab.value ? 'is-selected' : ''} aria-pressed={filter === tab.value} onClick={() => { setFilter(tab.value); setPage(0); }}>{tab.label}<span>{tab.count}</span></button>)}</div>
          <div className="management-filter-bar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="件名・現場・報告者で検索" placeholder="件名・現場・報告者で検索" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label><label className="management-select"><select aria-label="報告の種別で絞り込み" value={kind} onChange={(event) => { setKind(event.target.value); setPage(0); }}><option value="all">すべての種別</option>{Object.entries(reportKinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><Icon name="chevron-down" size={13} /></label></div>
          <p className="table-scroll-hint">左右にスクロールして担当・期限を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="management-table-scroll"><table className="management-table reports-table"><thead><tr><th scope="col">報告・連絡内容</th><th scope="col">種別</th><th scope="col">担当 / 対応期限</th><th scope="col">対応状況</th></tr></thead><tbody>{visible.map((report) => <tr key={report.id} className={`management-row${selected?.id === report.id ? ' is-selected' : ''}`}><th scope="row"><button type="button" className="review-record-select" aria-label={`${report.title}の報告詳細`} aria-pressed={selected?.id === report.id} onClick={() => setSelectedId(report.id)}><strong>{report.urgent && <span className="review-urgent"><Icon name="alert" size={11} />優先</span>}{report.title}</strong><small>{report.date.slice(5).replace('-', '/')} {report.time} · {report.reporter}</small></button></th><td><span className="review-kind">{reportKinds[report.kind]}</span></td><td><span className="review-cell-primary">{report.owner}</span><small className="review-cell-secondary">{report.due}</small></td><td><StatusBadge label={reportStatuses[report.status].label} tone={reportStatuses[report.status].tone} /></td></tr>)}{!visible.length && <EmptyRows colSpan={4} onClear={clearFilters} />}</tbody></table></div>
          <ListPagination total={filtered.length} page={currentPage} pageSize={pageSize} onChange={setPage} />
        </section>
        {selected ? <aside className="management-side-column" aria-label="選択した報告の詳細"><section className="panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="message" size={19} /></span><h2>報告の詳細</h2></div><span className="small-muted">{selected.id}</span></div><div className="management-detail-body review-detail-body"><div className="review-detail-badges"><span className="review-kind">{reportKinds[selected.kind]}</span><StatusBadge label={reportStatuses[selected.status].label} tone={reportStatuses[selected.status].tone} /></div><h3>{selected.title}</h3><div className="management-detail-section"><h4><Icon name="users" size={14} />担当・期限</h4><dl><div><dt>報告者</dt><dd>{selected.reporter}</dd></div><div><dt>確認担当</dt><dd>{selected.owner}</dd></div><div><dt>対応期限</dt><dd>{selected.due}</dd></div></dl></div><p className="review-report-body">{selected.body}</p><div className="review-next-action"><strong>次の対応</strong><p>{selected.nextAction}</p></div>{(site || officer || selected.kind === 'leave') && <div className="review-detail-links">{site && <a className="text-button" href={`/sites?site=${site.id}`}>{site.name}<Icon name="arrow-up-right" size={13} /></a>}{officer && <a className="text-button" href={`/officers?officer=${officer.id}`}>{officer.name}の隊員情報<Icon name="arrow-up-right" size={13} /></a>}{selected.kind === 'leave' && <a className="text-button" href={`/shifts?officer=${selected.officerId}&filter=requests`}>勤務希望を確認<Icon name="arrow-up-right" size={13} /></a>}</div>}</div><div className="management-detail-actions"><button type="button" className="secondary-button" title="対応の記録は表示サンプルです"><Icon name="edit" size={14} />対応を記録</button>{selected.status !== 'done' && <button type="button" className="text-button" title="対応完了は表示サンプルです"><Icon name="check" size={14} />対応済みにする</button>}</div></section><section className="panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="clock" size={18} /></span><h2>対応履歴</h2></div><span className="small-muted">サンプル</span></div><ol className="review-history">{selected.history.map((entry) => <li key={entry.time}><time>{entry.time}</time><p>{entry.text}</p></li>)}</ol></section></aside> : <section className="panel management-detail-empty"><Icon name="message" size={30} /><h2>報告の詳細</h2><p>検索・絞り込みの条件を変更してください。</p></section>}
      </div>
      <footer className="dashboard-footer"><span>申し送りから対応完了まで、確認の流れを見える形に。</span><span>KEIBI<span className="footer-dot">·</span>報告・期限・対応履歴は架空のサンプルです</span></footer>
    </main>
  );
}
