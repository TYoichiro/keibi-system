import { useState } from 'react';
import Icon from '../components/Icon';
import { EmptyRows, ListPagination, MockHistory, StatusBadge, SummaryCards } from '../components/ManagementUI';
import type { SummaryItem } from '../components/ManagementUI';
import { clients } from '../data/clients';
import { normalizeSearch } from '../data/personnel';
import { formatSiteDate, managedSites } from '../data/siteManagement';
import './management.css';
import './review.css';

const pageSize = 8;

export default function ClientsPage() {
  const requestedId = new URLSearchParams(window.location.search).get('client');
  const initialIndex = Math.max(0, clients.findIndex((client) => client.id === requestedId));
  const [selectedId, setSelectedId] = useState(clients[initialIndex].id);
  const [query, setQuery] = useState('');
  const [pendingOnly, setPendingOnly] = useState(new URLSearchParams(window.location.search).get('filter') === 'pending');
  const [page, setPage] = useState(Math.floor(initialIndex / pageSize));
  const filtered = clients.filter((client) => (!pendingOnly || client.documentPending) && normalizeSearch(`${client.name} ${client.id} ${client.contact} ${client.sites.map((site) => site.name).join(' ')}`).includes(normalizeSearch(query)));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visible.find((client) => client.id === selectedId) ?? visible[0];
  const pendingCount = clients.filter((client) => client.documentPending).length;
  const summary: SummaryItem[] = [
    { label: '登録取引先', value: clients.length, unit: '社', note: '現場に紐づく取引先', icon: 'building', tone: 'blue' },
    { label: '稼働現場のある取引先', value: clients.filter((client) => client.sites.some((site) => site.status === 'active')).length, unit: '社', note: '本日の管制対象', icon: 'activity', tone: 'green' },
    { label: '関連する現場', value: managedSites.length, unit: '件', note: '準備中・休止・終了を含む', icon: 'map-pin', tone: 'violet' },
    { label: '契約書類の確認待ち', value: pendingCount, unit: '社', note: '次期の参考サンプル', icon: 'alert', tone: 'amber' },
  ];
  function clearFilters() { setQuery(''); setPendingOnly(false); setPage(0); }

  return (
    <main className="dashboard clients-page review-page">
      <div className="page-heading management-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />CLIENT MANAGEMENT</div><h1>取引先管理</h1><p>初回は取引先の業務窓口と所属拠点、関連する現場を確認します。</p></div><div className="management-heading-actions"><button type="button" className="secondary-button" title="一覧出力は表示サンプルです"><Icon name="download" size={16} />出力（次期）</button><a href="/clients/new" className="primary-button"><Icon name="plus" size={17} />取引先を登録</a></div></div>
      <SummaryCards items={summary} label="取引先管理のサマリー" />
      <div className="management-banner banner-amber" role="note"><span className="management-banner-icon"><Icon name="calendar" size={18} /></span><div><strong>次期の参考：契約書類の確認待ち {pendingCount}社</strong><span>締め・支払条件、書類管理・請求は初回対象外の表示例です。</span></div><button type="button" onClick={() => { clearFilters(); setPendingOnly(true); }}>対象の取引先を確認<Icon name="arrow-right" size={15} /></button></div>
      <div className="management-workspace">
        <section className="panel review-list-panel" aria-labelledby="clients-list-title">
          <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="building" size={19} /></span><h2 id="clients-list-title">取引先一覧</h2><span className="count-label">{clients.length}社</span></div><span className="management-list-scope">東京セキュリティ / 本社</span></div>
          <div className="management-filter-bar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="取引先・担当者・現場で検索" placeholder="取引先・担当者・現場で検索" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label><button type="button" className={`review-filter${pendingOnly ? ' is-selected' : ''}`} aria-pressed={pendingOnly} onClick={() => { setPendingOnly(!pendingOnly); setPage(0); }}>契約書類の確認待ち{pendingOnly && <Icon name="check" size={12} />}</button></div>
          <p className="table-scroll-hint">左右にスクロールして取引条件を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="management-table-scroll"><table className="management-table clients-table"><thead><tr><th scope="col">取引先名 / ID</th><th scope="col">窓口担当者</th><th scope="col">関連現場</th><th scope="col">締め・支払（次期）</th><th scope="col">書類（次期）</th></tr></thead><tbody>{visible.map((client) => <tr className={`management-row${selected?.id === client.id ? ' is-selected' : ''}`} key={client.id}><th scope="row"><button type="button" className="review-record-select" aria-pressed={selected?.id === client.id} aria-label={`${client.name}の取引先詳細`} onClick={() => setSelectedId(client.id)}><strong>{client.name}</strong><small>{client.id} · 本社（本店） · 利用中</small></button></th><td><span className="review-cell-primary">{client.contact}</span><small className="review-cell-secondary">{client.phone}</small></td><td><strong className="review-count">{client.sites.length}<small>件</small></strong></td><td><span className="review-cell-primary">{client.closing}</span><small className="review-cell-secondary">{client.payment}</small></td><td><StatusBadge label={client.documentPending ? '確認待ち' : '確認済み'} tone={client.documentPending ? 'amber' : 'green'} /></td></tr>)}{!visible.length && <EmptyRows colSpan={5} onClear={clearFilters} />}</tbody></table></div>
          <ListPagination total={filtered.length} page={currentPage} pageSize={pageSize} onChange={setPage} />
        </section>
        {selected ? <aside className="management-side-column" aria-label="選択した取引先の詳細"><section className="panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="building" size={19} /></span><h2>取引先の詳細</h2></div><span className="small-muted">{selected.id}</span></div><div className="management-detail-body review-detail-body"><h3>{selected.name}</h3><p className="review-address"><Icon name="map-pin" size={13} />{selected.address}</p><div className="management-detail-section"><h4><Icon name="phone" size={14} />連絡窓口</h4><dl><div><dt>担当者</dt><dd>{selected.contact}</dd></div><div><dt>電話番号</dt><dd>{selected.phone}</dd></div><div><dt>社内担当</dt><dd>{selected.owner}</dd></div></dl><p className="review-email">{selected.email}</p></div><div className="management-detail-section"><h4><Icon name="calendar" size={14} />取引条件 · 次期の参考</h4><dl><div><dt>締め日</dt><dd>{selected.closing}</dd></div><div><dt>支払条件</dt><dd>{selected.payment}</dd></div><div><dt>契約書類</dt><dd><StatusBadge label={selected.documentPending ? '更新内容の確認待ち' : '確認済み'} tone={selected.documentPending ? 'amber' : 'green'} /></dd></div></dl></div><div className="review-note"><Icon name="message" size={14} /><p>{selected.note}</p></div><MockHistory target={`${selected.id} · ${selected.name}`} /></div><div className="management-detail-actions"><a href={`/clients/edit?client=${selected.id}`} className="secondary-button"><Icon name="edit" size={14} />編集画面を見る</a><span className="small-muted">取引条件はサンプル</span></div></section><section className="panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="map-pin" size={18} /></span><h2>関連する現場</h2></div><span className="count-label">{selected.sites.length}件</span></div><div className="review-related-list">{selected.sites.map((site) => <a href={`/sites?site=${site.id}`} key={site.id}><span><strong>{site.name}</strong><small>{site.id} · 契約終了 {formatSiteDate(site.contractEnd)}{site.renewalReview && ' · 更新予定'}</small></span><Icon name="arrow-up-right" size={14} /></a>)}</div></section></aside> : <section className="panel management-detail-empty"><Icon name="building" size={30} /><h2>取引先の詳細</h2><p>検索・絞り込みの条件を変更してください。</p></section>}
      </div>
      <footer className="dashboard-footer"><span>取引先から現場まで、必要な情報をひとつにつなぐ。</span><span>KEIBI<span className="footer-dot">·</span>契約書類・取引条件は架空の表示例です</span></footer>
    </main>
  );
}
