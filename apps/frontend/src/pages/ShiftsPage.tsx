import { useState } from 'react';
import Icon from '../components/Icon';
import { EmptyRows, ListPagination, PersonAvatar, StatusBadge, SummaryCards } from '../components/ManagementUI';
import type { SummaryItem } from '../components/ManagementUI';
import { normalizeSearch } from '../data/personnel';
import { shiftDays, shiftPlans, shiftStates } from '../data/shiftPlanning';
import './management.css';
import './review.css';

type ShiftFilter = 'all' | 'pending' | 'requests';
const pageSize = 8;

export default function ShiftsPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('officer');
  const initialIndex = Math.max(0, shiftPlans.findIndex((plan) => plan.officer.id === requestedId));
  const [selectedId, setSelectedId] = useState(shiftPlans[initialIndex].officer.id);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ShiftFilter>(params.get('filter') === 'requests' ? 'requests' : params.get('filter') === 'pending' ? 'pending' : 'all');
  const [page, setPage] = useState(Math.floor(initialIndex / pageSize));
  const filtered = shiftPlans.filter((plan) => (filter === 'all' || (filter === 'pending' ? plan.days.slice(1).includes('pending') : plan.requestPending)) && normalizeSearch(`${plan.officer.name} ${plan.officer.id} ${plan.officer.area}`).includes(normalizeSearch(query)));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visible.find((plan) => plan.officer.id === selectedId) ?? visible[0];
  const pending = shiftPlans.filter((plan) => plan.days.slice(1).includes('pending')).length;
  const requests = shiftPlans.filter((plan) => plan.requestPending).length;
  const summary: SummaryItem[] = [
    { label: '勤務希望の確認対象', value: shiftPlans.length, unit: '名', note: '在籍隊員のみ', icon: 'users', tone: 'blue' },
    { label: '翌日以降の未提出', value: pending, unit: '名', note: '10/5〜10/10の希望', icon: 'clock', tone: 'amber' },
    { label: '10/5の休み希望', value: shiftPlans.filter((plan) => plan.days[1] === 'off').length, unit: '名', note: '翌日の手配時に確認', icon: 'calendar', tone: 'violet' },
    { label: '確認待ちの申請', value: requests, unit: '件', note: '休暇・勤務時間の希望', icon: 'message', tone: 'amber' },
  ];
  const tabs: { value: ShiftFilter; label: string; count: number }[] = [{ value: 'all', label: 'すべて', count: shiftPlans.length }, { value: 'pending', label: '未提出あり', count: pending }, { value: 'requests', label: '申請確認待ち', count: requests }];
  function clearFilters() { setQuery(''); setFilter('all'); setPage(0); }

  return (
    <main className="dashboard shifts-page review-page">
      <div className="page-heading management-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />SHIFT PLANNING</div><h1>シフト・勤務希望</h1><p>勤務可能日・休み希望・未提出の隊員を、配置前に確認します。</p></div><div className="management-heading-actions"><button type="button" className="secondary-button" title="提出依頼は表示サンプルです"><Icon name="bell" size={16} />提出を依頼</button><a href="/assignments" className="primary-button review-button-link"><Icon name="calendar" size={17} />配置表を開く</a></div></div>
      <div className="review-period"><span><Icon name="calendar" size={16} />2026年10月4日（日）〜10月10日（土）</span><small>東京セキュリティ / 本社</small></div>
      <SummaryCards items={summary} label="シフト・勤務希望のサマリー" />
      <div className="management-banner banner-amber" role="note"><span className="management-banner-icon"><Icon name="message" size={18} /></span><div><strong>確認待ちの勤務希望が{requests}件あります</strong><span>休み希望や勤務時間の変更を、翌日以降の手配に反映しましょう。</span></div><button type="button" onClick={() => { clearFilters(); setFilter('requests'); }}>申請を確認<Icon name="arrow-right" size={15} /></button></div>
      <div className="management-workspace">
        <section className="panel review-list-panel" aria-labelledby="shifts-list-title">
          <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="calendar" size={19} /></span><h2 id="shifts-list-title">週間の勤務希望</h2><span className="count-label">{shiftPlans.length}名</span></div><span className="small-muted">10/4 09:30時点</span></div>
          <div className="management-tabs table-tabs" role="group" aria-label="勤務希望の提出状況で絞り込み">{tabs.map((tab) => <button type="button" key={tab.value} className={filter === tab.value ? 'is-selected' : ''} aria-pressed={filter === tab.value} onClick={() => { setFilter(tab.value); setPage(0); }}>{tab.label}<span>{tab.count}</span></button>)}</div>
          <div className="management-filter-bar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="隊員名・ID・エリアで検索" placeholder="隊員名・ID・エリアで検索" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label></div>
          <div className="review-shift-legend">{Object.values(shiftStates).map((state) => <span key={state.label}><i className={`review-shift-dot tone-${state.tone}`} />{state.label}</span>)}</div>
          <p className="table-scroll-hint">左右にスクロールして1週間の希望を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="management-table-scroll"><table className="management-table shifts-table"><thead><tr><th scope="col">隊員名 / ID</th>{shiftDays.map((day, index) => <th scope="col" className={index === 0 ? 'review-today' : ''} key={day.iso}>{day.label}<span>（{day.weekday}）</span>{index === 0 && <small>基準日</small>}</th>)}</tr></thead><tbody>{visible.map((plan) => <tr className={`management-row${selected?.officer.id === plan.officer.id ? ' is-selected' : ''}`} key={plan.officer.id}><th scope="row"><button type="button" className="person-select" aria-label={`${plan.officer.name}の勤務希望詳細`} aria-pressed={selected?.officer.id === plan.officer.id} onClick={() => setSelectedId(plan.officer.id)}><PersonAvatar name={plan.officer.name} color={plan.officer.color} /><span><strong>{plan.officer.name}</strong><span>{plan.officer.id}{plan.requestPending && <small className="review-request-tag">申請あり</small>}</span></span></button></th>{plan.days.map((state, index) => <td className={index === 0 ? 'review-today' : ''} key={shiftDays[index].iso}><span className={`review-shift-cell tone-${shiftStates[state].tone}`}>{shiftStates[state].label}</span></td>)}</tr>)}{!visible.length && <EmptyRows colSpan={8} onClear={clearFilters} />}</tbody></table></div>
          <ListPagination total={filtered.length} page={currentPage} pageSize={pageSize} onChange={setPage} />
        </section>
        {selected ? <aside className="management-side-column" aria-label="選択した隊員の勤務希望"><section className="panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="users" size={19} /></span><h2>勤務希望の詳細</h2></div><span className="small-muted">{selected.officer.id}</span></div><div className="management-detail-body review-detail-body"><div className="person-profile-heading"><PersonAvatar name={selected.officer.name} color={selected.officer.color} large /><div><h3>{selected.officer.name}</h3><span>{selected.officer.employment} · 本社</span></div></div><div className="management-detail-section"><h4><Icon name="clock" size={14} />勤務条件</h4><dl><div><dt>勤務可能時間</dt><dd>{selected.officer.availability}</dd></div><div><dt>対応エリア</dt><dd>{selected.officer.area}</dd></div></dl></div><div className="management-detail-section"><h4><Icon name="calendar" size={14} />日別の希望</h4><ul className="review-day-list">{shiftDays.map((day, index) => <li key={day.iso}><span>{day.label}（{day.weekday}）</span><StatusBadge label={shiftStates[selected.days[index]].label} tone={shiftStates[selected.days[index]].tone} /></li>)}</ul></div></div><div className="management-detail-actions"><a className="text-button" href={`/officers?officer=${selected.officer.id}`}>隊員情報を見る<Icon name="arrow-up-right" size={14} /></a></div></section><section className="panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="message" size={18} /></span><h2>申請・連絡メモ</h2></div>{selected.requestPending && <StatusBadge label="確認待ち" tone="amber" />}</div><div className="review-request-body"><p>{selected.note}</p><span>確認担当：田中 太郎</span>{selected.requestPending && <button type="button" className="secondary-button" title="申請の確認記録は表示サンプルです"><Icon name="check" size={14} />確認済みにする</button>}</div></section></aside> : <section className="panel management-detail-empty"><Icon name="calendar" size={30} /><h2>勤務希望の詳細</h2><p>検索・絞り込みの条件を変更してください。</p></section>}
      </div>
      <footer className="dashboard-footer"><span>隊員の予定を把握して、余裕のある手配へ。</span><span>KEIBI<span className="footer-dot">·</span>10/5以降は勤務希望の表示例です。配置表とは連動しません</span></footer>
    </main>
  );
}
