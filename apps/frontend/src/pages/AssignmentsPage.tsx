import { useState } from 'react';
import Icon from '../components/Icon';
import { dashboardDate } from '../data/dashboard';
import { availableOfficers, getSiteDetails, placements } from '../data/assignments';
import type { Placement } from '../data/assignments';
import { managedSites } from '../data/siteManagement';
import './assignments.css';

type StatusFilter = 'all' | 'shortage' | 'complete';
type ShiftFilter = 'all' | '日勤' | '夜勤' | '早朝';

const required = placements.reduce((total, placement) => total + placement.required, 0);
const assigned = placements.reduce((total, placement) => total + placement.officers.length, 0);
const shortageSites = placements.filter((placement) => placement.officers.length < placement.required);

function AssignmentSummary() {
  const items = [
    { label: '本日の現場', value: placements.length, unit: '件', icon: 'building', color: 'blue', note: '日勤・夜勤を含む' },
    { label: '必要人数', value: required, unit: '名', icon: 'users', color: 'slate', note: '全現場の合計' },
    { label: '配置済み', value: assigned, unit: '名', icon: 'check-circle', color: 'teal', note: `配置率 ${Math.round(assigned / required * 100)}%` },
    { label: '不足人数', value: required - assigned, unit: '名', icon: 'user-plus', color: 'amber', note: `${shortageSites.length}現場で未配置` },
  ] as const;

  return (
    <section className="allocation-summary" aria-label="本日の配置サマリー">
      {items.map((item) => (
        <article className={`allocation-stat allocation-stat-${item.color}`} key={item.label}>
          <span className="allocation-stat-icon"><Icon name={item.icon} size={20} /></span>
          <div className="allocation-stat-content">
            <span className="allocation-stat-label">{item.label}</span>
            <div><strong>{item.value}</strong><span>{item.unit}</span><small>{item.note}</small></div>
          </div>
        </article>
      ))}
    </section>
  );
}

function PlacementRow({ placement, selected, onSelect }: { placement: Placement; selected: boolean; onSelect: () => void }) {
  const shortage = placement.required - placement.officers.length;

  return (
    <tr className={`placement-row${selected ? ' is-selected' : ''}`}>
      <th scope="row">
        <button type="button" className="placement-site" aria-pressed={selected} onClick={onSelect}>
          <span className={`site-type-icon type-${placement.type}`}>
            <Icon name={placement.type === 'traffic' ? 'traffic' : placement.type === 'event' ? 'flag' : 'building'} size={18} />
          </span>
          <span className="placement-site-description">
            <strong>{placement.name}</strong>
            <span className="placement-client">{placement.client}</span>
            <span className="placement-shift"><span className={placement.shift === '夜勤' ? 'is-night-shift' : ''}>{placement.shift}</span>{placement.hours}</span>
          </span>
        </button>
      </th>
      <td className="placement-required"><strong>{placement.required}</strong><span>名</span></td>
      <td>
        <div className="placement-officers">
          {placement.officers.map((officer) => (
            <a href={`/officers?officer=${officer.id}`} className={`officer-chip${officer.leader ? ' is-leader' : ''}`} key={officer.id}>
              <span className="officer-initial">{officer.name[0]}</span>
              <span>{officer.name}</span>
              {officer.leader && <span className="leader-label" title="現場責任者">責</span>}
            </a>
          ))}
          {Array.from({ length: shortage }, (_, index) => (
            <button className="empty-officer-slot" type="button" key={index} aria-label={`${placement.name}の未配置枠`} title="隊員の配置操作は表示サンプルです">
              <Icon name="plus" size={13} /><span>隊員を配置</span>
            </button>
          ))}
        </div>
      </td>
      <td className="placement-status">
        <span className={`status-badge status-${shortage > 0 ? 'warning' : 'active'}`}>
          {shortage > 0 ? <Icon name="alert" size={11} /> : <Icon name="check" size={11} />}
          {shortage > 0 ? `不足 ${shortage}名` : '配置完了'}
        </span>
        <span className="placement-status-count">{placement.officers.length} / {placement.required}名</span>
      </td>
    </tr>
  );
}

function AvailableOfficers() {
  const [query, setQuery] = useState('');
  const visibleOfficers = availableOfficers.filter((officer) => `${officer.name.replaceAll(' ', '')} ${officer.qualification ?? ''} ${officer.area}`.includes(query.trim().replaceAll(' ', '')));

  return (
    <section className="panel available-officers-panel" aria-labelledby="available-title">
      <div className="panel-heading">
        <div className="panel-title"><span className="section-icon"><Icon name="user-plus" size={19} /></span><h2 id="available-title">配置可能な隊員</h2><span className="count-label">{availableOfficers.length}名</span></div>
      </div>
      <div className="available-toolbar">
        <label className="site-search"><Icon name="search" size={15} /><input aria-label="配置可能な隊員を検索" placeholder="隊員名・資格で検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <p><span className="live-dot" />本日のシフト提出済み・未配置</p>
      </div>
      <div className="available-officers-list">
        {visibleOfficers.map((officer) => (
          <article className="available-officer" key={officer.id}>
            <div className="available-officer-heading">
              <span className={`available-avatar avatar-${officer.color}`}>{officer.name[0]}</span>
              <div><strong><a className="allocation-officer-link" href={`/officers?officer=${officer.id}`}>{officer.name}</a></strong><span>{officer.id}<i />{officer.employment}</span></div>
              <button className="available-add-button" type="button" aria-label={`${officer.name}を配置`} title="隊員の配置操作は表示サンプルです"><Icon name="plus" size={15} /></button>
            </div>
            <div className="available-officer-info"><span><Icon name="clock" size={12} />{officer.hours}</span><span><Icon name="map-pin" size={12} />{officer.area}</span></div>
            {officer.qualification && <span className="qualification-badge"><Icon name="shield" size={11} />{officer.qualification}</span>}
          </article>
        ))}
        {visibleOfficers.length === 0 && <p className="available-empty">該当する隊員がいません。</p>}
      </div>
      <div className="available-footer"><Icon name="help" size={13} /><a href="/shifts">シフト・勤務希望を確認<Icon name="arrow-up-right" size={12} /></a></div>
    </section>
  );
}

function SelectedSite({ placement }: { placement?: Placement }) {
  if (!placement) return <section className="panel selected-site-panel"><div className="selected-site-body"><h3>条件に一致する現場がありません</h3><p className="selected-site-client">検索・絞り込みの条件を変更してください。</p></div></section>;
  const details = getSiteDetails(placement);
  const managedSite = managedSites.find((site) => site.id === placement.id);
  const shortage = placement.required - placement.officers.length;

  return (
    <section className="panel selected-site-panel" aria-labelledby="selected-site-title">
      <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="building" size={18} /></span><h2 id="selected-site-title">選択中の現場</h2></div><span className="small-muted">{placement.id}</span></div>
      <div className="selected-site-body">
        <span className="selected-site-category">{placement.category}</span>
        <h3>{placement.name}</h3>
        <p className="selected-site-client">{placement.client}</p>
        <div className="selected-site-capacity"><span>配置状況</span><strong>{placement.officers.length}<small> / {placement.required}名</small></strong><span className={`status-badge status-${shortage > 0 ? 'warning' : 'active'}`}>{shortage > 0 ? `あと${shortage}名` : '配置完了'}</span></div>
        <dl className="selected-site-details">
          <div><dt><Icon name="clock" size={13} />勤務時間</dt><dd>{placement.hours}</dd></div>
          <div><dt><Icon name="map-pin" size={13} />集合場所</dt><dd>{details.meeting}</dd></div>
          <div><dt><Icon name="users" size={13} />連絡先</dt><dd>{managedSite?.contact ?? details.contact}{managedSite && <span className="allocation-contact-phone">{managedSite.phone}</span>}</dd></div>
        </dl>
        {details.condition && <div className="site-condition"><Icon name="shield" size={13} /><span><strong>この現場の配置条件</strong>{details.condition}</span></div>}
        <div className="placement-memo"><span><Icon name="message" size={13} />配置メモ</span><p>{details.note}</p></div>
        <a className="text-button allocation-site-link" href={`/sites?site=${placement.id}`}>現場情報を開く<Icon name="arrow-up-right" size={13} /></a>
      </div>
    </section>
  );
}

export default function AssignmentsPage() {
  const params = new URLSearchParams(window.location.search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(params.get('filter') === 'shortage' ? 'shortage' : 'all');
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(placements.find((placement) => placement.id === params.get('site'))?.id ?? placements[0].id);
  const visiblePlacements = placements.filter((placement) => {
    const shortage = placement.officers.length < placement.required;
    return (statusFilter === 'all' || (statusFilter === 'shortage' ? shortage : !shortage))
      && (shiftFilter === 'all' || placement.shift === shiftFilter)
      && `${placement.name} ${placement.client} ${placement.officers.map((officer) => officer.name).join(' ')}`.replaceAll(' ', '').includes(query.trim().replaceAll(' ', ''));
  });
  const selectedPlacement = visiblePlacements.find((placement) => placement.id === selectedId) ?? visiblePlacements[0];

  return (
    <main className="dashboard allocation-page">
      <div className="page-heading allocation-page-heading">
        <div><div className="page-eyebrow"><span className="live-dot" />DAILY ASSIGNMENTS</div><h1>配置・管理</h1><p>現場ごとの配置を確認して、必要な隊員を手配しましょう。</p></div>
        <div className="allocation-heading-actions">
          <button type="button" className="secondary-button"><Icon name="printer" size={16} />配置表を出力</button>
          <button type="button" className="primary-button"><Icon name="check-circle" size={16} />配置を確定</button>
        </div>
      </div>

      <div className="allocation-date-bar">
        <div className="allocation-date-navigation">
          <span className="allocation-date-icon"><Icon name="calendar" size={19} /></span>
          <time dateTime={dashboardDate.iso}>{dashboardDate.label}</time><span className="date-today">基準日</span>
        </div>
        <span className="allocation-date-note"><Icon name="building" size={13} />東京セキュリティ<span>/</span>本社</span>
      </div>
      <AssignmentSummary />

      <div className="attention-banner allocation-attention" role="note">
        <span className="attention-icon"><Icon name="alert" size={18} /></span>
        <div><strong>{shortageSites.length}現場で、あと{required - assigned}名の配置が必要です</strong><span>渋谷駅前・新宿西口・世田谷区の未配置枠を確認してください。</span></div>
        <button type="button" className="attention-button" onClick={() => { setStatusFilter('shortage'); setShiftFilter('all'); setQuery(''); }}>不足の現場を表示<Icon name="arrow-right" size={15} /></button>
      </div>

      <div className="allocation-workspace">
        <section className="panel placement-board" aria-labelledby="placement-board-title">
          <div className="panel-heading">
            <div className="panel-title"><span className="section-icon"><Icon name="calendar" size={19} /></span><h2 id="placement-board-title">現場別の配置表</h2><span className="count-label">{placements.length}件</span></div>
            <span className="placement-board-mode"><Icon name="dashboard" size={13} />日別表示</span>
          </div>
          <div className="placement-filter-bar">
            <div className="table-tabs" role="group" aria-label="配置状況で絞り込み">
              <button type="button" className={statusFilter === 'all' ? 'is-selected' : ''} aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>すべて<span>{placements.length}</span></button>
              <button type="button" className={statusFilter === 'shortage' ? 'is-selected' : ''} aria-pressed={statusFilter === 'shortage'} onClick={() => setStatusFilter('shortage')}>不足あり<span className="tab-warning-count">{shortageSites.length}</span></button>
              <button type="button" className={statusFilter === 'complete' ? 'is-selected' : ''} aria-pressed={statusFilter === 'complete'} onClick={() => setStatusFilter('complete')}>配置完了<span>{placements.length - shortageSites.length}</span></button>
            </div>
            <div className="placement-search-filters">
              <label className="placement-shift-filter"><span className="sr-only">勤務帯で絞り込み</span><select aria-label="勤務帯で絞り込み" value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value as ShiftFilter)}><option value="all">すべての勤務帯</option><option value="日勤">日勤</option><option value="夜勤">夜勤</option><option value="早朝">早朝</option></select><Icon name="chevron-down" size={13} /></label>
              <label className="site-search"><Icon name="search" size={15} /><input aria-label="現場・取引先・隊員で検索" placeholder="現場・隊員を検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            </div>
          </div>
          <div className="placement-legend"><span><i className="legend-dot dot-teal" />配置済み</span><span><i className="legend-dot dot-amber" />未配置の枠</span><span><i className="legend-leader">責</i>現場責任者</span><span className="placement-selection-hint">現場名を選ぶと詳細を表示</span></div>
          <p className="table-scroll-hint">左右にスクロールして配置隊員を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="placement-table-scroll">
            <table className="placement-table">
              <thead><tr><th scope="col">現場 / 勤務時間</th><th scope="col">必要</th><th scope="col">配置隊員</th><th scope="col">配置状況</th></tr></thead>
              <tbody>
                {visiblePlacements.map((placement) => <PlacementRow key={placement.id} placement={placement} selected={selectedPlacement?.id === placement.id} onSelect={() => setSelectedId(placement.id)} />)}
                {visiblePlacements.length === 0 && <tr><td colSpan={4} className="empty-results">条件に一致する現場がありません。</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span>{placements.length}件中 {visiblePlacements.length}件を表示</span><span className="table-footer-note"><span className="live-dot" />サンプルデータ</span></div>
        </section>
        <aside className="allocation-side-panels" aria-label="隊員候補と現場の詳細"><AvailableOfficers /><SelectedSite placement={selectedPlacement} /></aside>
      </div>
      <footer className="dashboard-footer"><span>現場と隊員の、ちょうどいい配置を。</span><span>KEIBI<span className="footer-dot">·</span>画面確認用のサンプルデータを表示しています</span></footer>
    </main>
  );
}
