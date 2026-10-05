import { useState } from 'react';
import Icon from '../components/Icon';
import { dashboardDate } from '../data/dashboard';
import { formatSiteDate, managedSites, siteStatuses } from '../data/siteManagement';
import type { ManagedSite } from '../data/siteManagement';
import { getClient } from '../data/clients';
import './sites.css';

type StatusFilter = 'all' | 'active' | 'planned' | 'inactive';
type CategoryFilter = 'all' | ManagedSite['type'];
const pageSize = 8;
const normalize = (value: string) => value.replace(/\s/g, '').toLowerCase();
const activeSites = managedSites.filter((site) => site.status === 'active');
const plannedSites = managedSites.filter((site) => site.status === 'planned');
const renewalSites = managedSites.filter((site) => site.renewalReview);

function SiteStatusBadge({ site }: { site: ManagedSite }) {
  const status = siteStatuses[site.status];
  return <span className={`registry-status registry-status-${status.color}`}><span />{status.label}</span>;
}

function SiteSummary() {
  const items = [
    { label: '登録現場', value: managedSites.length, icon: 'building', color: 'blue', note: 'すべての現場' },
    { label: '稼働中', value: activeSites.length, icon: 'activity', color: 'teal', note: '本日の管制対象' },
    { label: '準備中', value: plannedSites.length, icon: 'calendar', color: 'violet', note: '開始に向けて準備' },
    { label: '契約更新予定', value: renewalSites.length, icon: 'clock', color: 'amber', note: '取引先と条件を確認' },
  ] as const;

  return (
    <section className="registry-summary" aria-label="現場管理のサマリー">
      {items.map((item) => (
        <article className={`registry-stat registry-stat-${item.color}`} key={item.label}>
          <div><span>{item.label}</span><span className="registry-stat-icon"><Icon name={item.icon} size={19} /></span></div>
          <p><strong>{item.value}</strong><span>件</span><small>{item.note}</small></p>
        </article>
      ))}
    </section>
  );
}

function SiteRow({ site, selected, onSelect }: { site: ManagedSite; selected: boolean; onSelect: () => void }) {
  return (
    <tr className={`registry-row${selected ? ' is-selected' : ''}`}>
      <th scope="row">
        <button className="registry-site-select" type="button" aria-label={`${site.name}の詳細を表示`} aria-pressed={selected} onClick={onSelect}>
          <span className={`site-type-icon type-${site.type}`}><Icon name={site.type === 'traffic' ? 'traffic' : site.type === 'event' ? 'flag' : 'building'} size={18} /></span>
          <span><span className="registry-site-id">{site.id}</span><strong>{site.name}</strong><span className="registry-client">{site.client}</span></span>
        </button>
      </th>
      <td><span className={`registry-category registry-category-${site.type}`}>{site.category}</span></td>
      <td><span className="registry-hours">{site.hours}</span><span className={`registry-shift${site.shift === '夜勤' ? ' is-night' : ''}`}>{site.shift}</span></td>
      <td className="registry-required"><strong>{site.required}</strong><span>名</span></td>
      <td><span className="registry-contract-start">{formatSiteDate(site.contractStart)}</span><span className="registry-contract-end">〜 {formatSiteDate(site.contractEnd)}</span>{site.renewalReview && <span className="registry-renewal-tag">更新予定</span>}</td>
      <td><SiteStatusBadge site={site} /></td>
      <td><button className="icon-button row-action" type="button" aria-label={`${site.name}の現場情報`} onClick={onSelect}><Icon name="chevron-right" size={16} /></button></td>
    </tr>
  );
}

function SiteDetail({ site }: { site?: ManagedSite }) {
  if (!site) {
    return (
      <section className="panel registry-detail-empty">
        <Icon name="building" size={30} /><h2>現場の詳細</h2><p>現場が見つかりません。<br />検索や絞り込みの条件を変更してください。</p>
      </section>
    );
  }

  return (
    <aside className="registry-detail-column" aria-label="選択した現場の詳細">
      <section className="panel registry-detail-panel" aria-labelledby="registry-detail-title">
        <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="building" size={19} /></span><h2 id="registry-detail-title">現場の詳細</h2></div><span className="small-muted">{site.id}</span></div>
        <div className="registry-detail-body">
          <div className="registry-detail-badges"><span className={`registry-category registry-category-${site.type}`}>{site.category}</span><SiteStatusBadge site={site} /></div>
          <h3>{site.name}</h3>
          <a className="registry-detail-client registry-client-link" href={`/clients?client=${getClient(site.client)?.id}`}>{site.client}<Icon name="arrow-up-right" size={12} /></a>
          <div className="registry-address"><Icon name="map-pin" size={15} /><span>{site.address}</span></div>

          <div className={`registry-contract-card${site.renewalReview ? ' has-renewal' : ''}`}>
            <span><Icon name="calendar" size={14} />契約期間{site.renewalReview && <span className="registry-renewal-tag">更新予定</span>}</span>
            <strong>{formatSiteDate(site.contractStart)}<span>〜</span>{formatSiteDate(site.contractEnd)}</strong>
          </div>

          <div className="registry-detail-section">
            <h4><Icon name="clock" size={14} />勤務・配置条件</h4>
            <dl>
              <div><dt>勤務時間</dt><dd>{site.hours}<span className="registry-shift">{site.shift}</span></dd></div>
              <div><dt>基本人数</dt><dd><strong>{site.required}</strong> 名 / 日</dd></div>
              <div><dt>集合場所</dt><dd>{site.meeting}</dd></div>
            </dl>
            <div className="registry-condition"><Icon name="shield" size={14} /><span>{site.condition}</span></div>
          </div>

          <div className="registry-detail-section registry-contact-section">
            <h4><Icon name="users" size={14} />現場担当者</h4>
            <div className="registry-contact-person"><span className="registry-contact-avatar">{site.contact[0]}</span><div><strong>{site.contact}</strong><span>{site.client}</span></div></div>
            <div className="registry-phone"><Icon name="phone" size={13} /><span>{site.phone}</span><small>サンプル</small></div>
          </div>
        </div>
        <div className="registry-detail-actions"><button type="button" className="secondary-button" title="現場情報の編集は表示サンプルです"><Icon name="edit" size={14} />編集する</button>{site.status === 'active' ? <a className="text-button" href={`/assignments?site=${site.id}`}>本日の配置を見る<Icon name="arrow-up-right" size={14} /></a> : <span className="small-muted">本日の配置対象外</span>}</div>
      </section>
      <section className="panel registry-memo-panel" aria-labelledby="registry-memo-title">
        <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="message" size={18} /></span><h2 id="registry-memo-title">現場メモ</h2></div><span className="small-muted">管制担当</span></div>
        <p>{site.note}</p>
        <div className="registry-memo-footer"><Icon name="help" size={12} /><span>隊員への事前共有にご活用ください</span></div>
      </section>
    </aside>
  );
}

export default function SitesPage() {
  const initialId = new URLSearchParams(window.location.search).get('site');
  const initialIndex = Math.max(0, managedSites.findIndex((site) => site.id === initialId));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [renewalOnly, setRenewalOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(Math.floor(initialIndex / pageSize));
  const [selectedId, setSelectedId] = useState(managedSites[initialIndex].id);

  const filteredSites = managedSites.filter((site) => {
    const statusMatches = statusFilter === 'all' || (statusFilter === 'inactive' ? site.status === 'paused' || site.status === 'closed' : site.status === statusFilter);
    return statusMatches && (categoryFilter === 'all' || site.type === categoryFilter)
      && (!renewalOnly || site.renewalReview)
      && normalize(`${site.id} ${site.name} ${site.client} ${site.address}`).includes(normalize(query));
  });
  const pageCount = Math.max(1, Math.ceil(filteredSites.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleSites = filteredSites.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectedSite = visibleSites.find((site) => site.id === selectedId) ?? visibleSites[0];

  function clearFilters() {
    setStatusFilter('all');
    setCategoryFilter('all');
    setRenewalOnly(false);
    setQuery('');
    setPage(0);
  }

  const tabs: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: 'すべて', count: managedSites.length },
    { value: 'active', label: '稼働中', count: activeSites.length },
    { value: 'planned', label: '準備中', count: plannedSites.length },
    { value: 'inactive', label: '休止・終了', count: managedSites.length - activeSites.length - plannedSites.length },
  ];

  return (
    <main className="dashboard registry-page">
      <div className="page-heading registry-page-heading">
        <div><div className="page-eyebrow"><span className="live-dot" />SITE MANAGEMENT</div><h1>現場管理</h1><p>現場の基本情報と契約・勤務条件をまとめて管理します。</p></div>
        <div className="registry-heading-actions"><button type="button" className="secondary-button"><Icon name="download" size={16} />一覧を出力</button><button type="button" className="primary-button"><Icon name="plus" size={17} />現場を登録</button></div>
      </div>
      <SiteSummary />
      <div className="registry-renewal-banner" role="note">
        <span className="registry-renewal-icon"><Icon name="calendar" size={18} /></span>
        <div><strong>契約更新予定の現場が{renewalSites.length}件あります</strong><span>取引先と継続予定・勤務条件を確認しましょう。</span></div>
        <button type="button" onClick={() => { clearFilters(); setRenewalOnly(true); }}>対象の現場を確認<Icon name="arrow-right" size={15} /></button>
      </div>

      <div className="registry-workspace">
        <section className="panel registry-list-panel" aria-labelledby="registry-list-title">
          <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="building" size={19} /></span><h2 id="registry-list-title">現場一覧</h2><span className="count-label">{managedSites.length}件</span></div><span className="registry-list-scope">東京セキュリティ / 本社</span></div>
          <div className="registry-status-tabs table-tabs" role="group" aria-label="現場の状態で絞り込み">
            {tabs.map((tab) => <button type="button" key={tab.value} className={statusFilter === tab.value ? 'is-selected' : ''} aria-pressed={statusFilter === tab.value} onClick={() => { setStatusFilter(tab.value); setPage(0); }}>{tab.label}<span>{tab.count}</span></button>)}
          </div>
          <div className="registry-filters">
            <label className="site-search"><Icon name="search" size={15} /><input aria-label="現場名・取引先・所在地で検索" placeholder="現場名・取引先で検索" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
            <label className="registry-type-filter"><select aria-label="警備種別で絞り込み" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value as CategoryFilter); setPage(0); }}><option value="all">すべての警備種別</option><option value="traffic">交通誘導</option><option value="facility">施設警備</option><option value="event">雑踏警備</option></select><Icon name="chevron-down" size={13} /></label>
            <button type="button" className={`registry-renewal-filter${renewalOnly ? ' is-selected' : ''}`} aria-pressed={renewalOnly} onClick={() => { setRenewalOnly(!renewalOnly); setPage(0); }}><Icon name="calendar" size={13} />更新予定のみ{renewalOnly && <Icon name="check" size={12} />}</button>
          </div>
          <p className="registry-list-hint"><Icon name="help" size={12} />現場名を選ぶと、勤務条件や連絡先を確認できます。</p>
          <p className="table-scroll-hint">左右にスクロールして現場情報を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="registry-table-scroll">
            <table className="registry-table">
              <thead><tr><th scope="col">現場名 / 取引先</th><th scope="col">警備種別</th><th scope="col">勤務時間</th><th scope="col">人数</th><th scope="col">契約期間</th><th scope="col">状態</th><th scope="col"><span className="sr-only">詳細</span></th></tr></thead>
              <tbody>{visibleSites.map((site) => <SiteRow key={site.id} site={site} selected={selectedSite?.id === site.id} onSelect={() => setSelectedId(site.id)} />)}{visibleSites.length === 0 && <tr><td className="registry-no-results" colSpan={7}><Icon name="search" size={27} /><strong>条件に一致する現場がありません</strong><p>検索キーワードや絞り込み条件を変更してください。</p><button type="button" className="secondary-button" onClick={clearFilters}>条件をクリア</button></td></tr>}</tbody>
            </table>
          </div>
          <div className="registry-pagination"><span>{filteredSites.length === 0 ? '0件を表示' : `${filteredSites.length}件中 ${currentPage * pageSize + 1}〜${currentPage * pageSize + visibleSites.length}件を表示`}</span><nav aria-label="現場一覧のページ切り替え"><button type="button" aria-label="前のページ" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon name="chevron-left" size={14} /></button>{Array.from({ length: pageCount }, (_, index) => <button type="button" key={index} className={index === currentPage ? 'is-current' : ''} aria-label={`${index + 1}ページ目`} aria-current={index === currentPage ? 'page' : undefined} onClick={() => setPage(index)}>{index + 1}</button>)}<button type="button" aria-label="次のページ" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}><Icon name="chevron-right" size={14} /></button></nav></div>
        </section>
        <SiteDetail site={selectedSite} />
      </div>
      <footer className="dashboard-footer"><span>現場の情報を整えて、毎日の管制をスムーズに。</span><span>KEIBI<span className="footer-dot">·</span><time dateTime={dashboardDate.iso}>2026/10/4時点のサンプルデータ</time></span></footer>
    </main>
  );
}
