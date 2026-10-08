import { useState } from 'react';
import Icon from '../components/Icon';
import { EmptyRows, ListPagination, MockHistory, PersonAvatar, StatusBadge, SummaryCards } from '../components/ManagementUI';
import type { SummaryItem } from '../components/ManagementUI';
import { normalizeSearch, officers, officerStatuses } from '../data/personnel';
import type { Officer, OfficerStatus } from '../data/personnel';
import { mockDutySlots, mockDutyStateLabels } from '../data/mockDutySlots';
import './management.css';

type RosterFilter = 'all' | OfficerStatus | 'available';
const pageSize = 8;
const activeOfficers = officers.filter((officer) => officer.status === 'active');
const available = activeOfficers.filter((officer) => !officer.assignment);
const educationPending = activeOfficers.filter((officer) => officer.educationPending);
const todaysDuties = mockDutySlots.filter((duty) => duty.date === '2026-10-04');
const publishedCount = todaysDuties.filter((duty) => duty.state === 'published').reduce((count, duty) => count + duty.officers.length, 0);
const draftCount = todaysDuties.filter((duty) => duty.state === 'draft').reduce((count, duty) => count + duty.officers.length, 0);
const referenceCount = todaysDuties.filter((duty) => duty.state === 'reference').reduce((count, duty) => count + duty.officers.length, 0);
const officerDuty = (officer: Officer) => todaysDuties.find((duty) => duty.officers.some((person) => person.id === officer.id));

function OfficerRow({ officer, selected, onSelect }: { officer: Officer; selected: boolean; onSelect: () => void }) {
  const status = officerStatuses[officer.status];
  const duty = officerDuty(officer);
  return (
    <tr className={`management-row${selected ? ' is-selected' : ''}`}>
      <th scope="row"><button type="button" className="person-select" aria-label={`${officer.name}の隊員情報`} aria-pressed={selected} onClick={onSelect}><PersonAvatar name={officer.name} color={officer.color} /><span><strong>{officer.name}</strong><span>{officer.id}<i />本社</span></span></button></th>
      <td><span className="employment-label">{officer.employment}</span></td>
      <td><div className="person-qualifications">{officer.qualifications.length ? officer.qualifications.map((qualification) => <span className="person-qualification" key={qualification}><Icon name="shield" size={11} />{qualification}</span>) : <span className="management-muted">登録なし</span>}</div>{officer.educationPending && <span className="person-education-warning">教育予定未登録</span>}</td>
      <td>{officer.assignment ? <div className="person-assignment"><strong>{officer.assignment.siteName}</strong><span>{officer.assignment.hours}<i />{officer.assignment.shift}{officer.assignment.leader && <small>責任者の選択例</small>}</span>{duty && <span>{mockDutyStateLabels[duty.state]}</span>}</div> : <div className="person-assignment"><strong className={officer.status === 'active' ? 'is-available' : 'management-muted'}>{officer.status === 'active' ? '在籍・未配置' : '配置対象外'}</strong><span>{officer.status === 'active' ? officer.availability : officerStatuses[officer.status].label}</span></div>}</td>
      <td><StatusBadge label={status.label} tone={status.tone} /></td>
      <td><button type="button" className="icon-button row-action" aria-label={`${officer.name}の詳細`} onClick={onSelect}><Icon name="chevron-right" size={16} /></button></td>
    </tr>
  );
}

function OfficerProfile({ officer }: { officer?: Officer }) {
  if (!officer) return <section className="panel management-detail-empty"><Icon name="users" size={30} /><h2>隊員の詳細</h2><p>検索・絞り込みの条件を変更してください。</p></section>;
  const status = officerStatuses[officer.status];
  const duty = officerDuty(officer);
  return (
    <aside className="management-side-column" aria-label="選択した隊員の詳細">
      <section className="panel officer-profile-panel">
        <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="users" size={19} /></span><h2>隊員の詳細</h2></div><span className="small-muted">{officer.id}</span></div>
        <div className="management-detail-body">
          <div className="person-profile-heading"><PersonAvatar name={officer.name} color={officer.color} large /><div><h3>{officer.name}</h3><span>{officer.employment}<i />本社所属</span></div><StatusBadge label={status.label} tone={status.tone} /></div>
          <div className="management-detail-section"><h4><Icon name="users" size={14} />基本情報</h4><dl><div><dt>入社日</dt><dd>{officer.joinedOn.replaceAll('-', '/')}</dd></div><div><dt>勤務可能</dt><dd>{officer.availability}</dd></div><div><dt>対応エリア</dt><dd>{officer.area}</dd></div></dl></div>
          <div className="management-detail-section"><h4><Icon name="phone" size={14} />連絡先</h4><p className="person-phone">{officer.phone}<small>サンプル</small></p><p className="person-email">{officer.email}</p></div>
          <div className="management-detail-section"><h4><Icon name="shield" size={14} />資格の基本情報</h4><div className="profile-qualifications">{officer.qualifications.length ? officer.qualifications.map((qualification) => <span className="person-qualification" key={qualification}><Icon name="shield" size={12} />{qualification}</span>) : <span className="management-muted">資格登録なし</span>}</div><p className="scope-detail-note">資格名のサンプルです。証明内容・確認者・有効期間は編集画面の見本で確認します。正式な配置条件の判定は未実装です。</p><div className={`education-card${officer.educationPending ? ' needs-review' : ''}`}><span>現任教育 · 次期の参考</span><strong>{officer.status !== 'active' ? '配置対象外' : officer.educationPending ? '予定未登録' : '受講済み'}</strong><small>{officer.educationDate ? `${officer.educationDate.replaceAll('-', '/')} 受講` : officer.educationPending ? '受講予定を確認してください' : '在籍時の記録を確認'}</small></div></div>
          <div className="management-detail-section person-today-section"><h4><Icon name="calendar" size={14} />本日の配置案・公開状態</h4>{officer.assignment ? <><a href={`/assignments?site=${officer.assignment.siteId}`} className="person-site-link">{officer.assignment.siteName}<Icon name="arrow-up-right" size={13} /></a><p>{officer.assignment.hours}<span>{officer.assignment.shift}</span></p>{duty && <p className="scope-detail-note">{mockDutyStateLabels[duty.state]}。勤務中かどうかを表す状態ではありません。</p>}</> : <p className="person-unassigned-note">{officer.status === 'active' ? '本日は未配置です。勤務可能時間と資格を確認して手配してください。' : '休職・退職した隊員は本日の配置対象に含みません。'}</p>}</div>
          {officer.status === 'active' && <div className="management-detail-section"><a className="person-site-link" href={`/shifts?officer=${officer.id}`}>勤務希望の参考画面（次期）<Icon name="arrow-up-right" size={13} /></a></div>}
          <MockHistory target={`${officer.id} · ${officer.name}`} />
        </div>
        <div className="management-detail-actions"><a href={`/officers/edit?officer=${officer.id}`} className="secondary-button"><Icon name="edit" size={14} />編集画面を見る</a><a className="text-button" href={officer.assignment ? `/attendance?officer=${officer.id}` : '/attendance'}>勤怠の参考画面（次期）<Icon name="arrow-up-right" size={14} /></a></div>
      </section>
      <section className="panel management-note-panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="message" size={18} /></span><h2>管制メモ</h2></div><span className="small-muted">社内共有</span></div><p>{officer.note}</p></section>
    </aside>
  );
}

export default function OfficersPage() {
  const initialId = new URLSearchParams(window.location.search).get('officer');
  const initialIndex = Math.max(0, officers.findIndex((officer) => officer.id === initialId));
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [qualification, setQualification] = useState('all');
  const [employment, setEmployment] = useState('all');
  const [educationOnly, setEducationOnly] = useState(new URLSearchParams(window.location.search).get('filter') === 'education');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(Math.floor(initialIndex / pageSize));
  const [selectedId, setSelectedId] = useState(officers[initialIndex].id);

  const filtered = officers.filter((officer) =>
    (rosterFilter === 'all' || (rosterFilter === 'available' ? officer.status === 'active' && !officer.assignment : officer.status === rosterFilter))
    && (qualification === 'all' || (qualification === 'none' ? officer.qualifications.length === 0 : officer.qualifications.includes(qualification)))
    && (employment === 'all' || officer.employment === employment)
    && (!educationOnly || officer.educationPending)
    && normalizeSearch(`${officer.id} ${officer.name} ${officer.area} ${officer.assignment?.siteName ?? ''}`).includes(normalizeSearch(query))
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visible.find((officer) => officer.id === selectedId) ?? visible[0];
  const summary: SummaryItem[] = [
    { label: '登録隊員', value: officers.length, unit: '名', note: '休職・退職を含む', icon: 'users', tone: 'blue' },
    { label: '在籍隊員', value: activeOfficers.length, unit: '名', note: `確定${publishedCount}・下書き${draftCount}・次期${referenceCount}名`, icon: 'check-circle', tone: 'green' },
    { label: '在籍の資格保有者', value: activeOfficers.filter((officer) => officer.qualifications.length > 0).length, unit: '名', note: '登録資格を確認', icon: 'shield', tone: 'violet' },
    { label: '本日未配置の在籍者', value: available.length, unit: '名', note: '勤務可否は別手段で確認', icon: 'user-plus', tone: 'amber' },
  ];
  const tabs: { value: RosterFilter; label: string; count: number }[] = [
    { value: 'all', label: 'すべて', count: officers.length },
    { value: 'active', label: '在籍', count: activeOfficers.length },
    { value: 'available', label: '配置可能', count: available.length },
    { value: 'leave', label: '休職', count: officers.filter((officer) => officer.status === 'leave').length },
    { value: 'retired', label: '退職', count: officers.filter((officer) => officer.status === 'retired').length },
  ];

  function clearFilters() {
    setRosterFilter('all'); setQualification('all'); setEmployment('all'); setEducationOnly(false); setQuery(''); setPage(0);
  }

  return (
    <main className="dashboard personnel-page">
      <div className="page-heading management-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />OFFICER MANAGEMENT</div><h1>隊員管理</h1><p>隊員の在籍状況・資格・勤務条件を、ひとつの一覧で。</p></div><div className="management-heading-actions"><button type="button" className="secondary-button"><Icon name="download" size={16} />出力（次期）</button><a href="/officers/new" className="primary-button"><Icon name="user-plus" size={17} />隊員を登録</a></div></div>
      <div className="scope-inline-note">本社（本店）の登録枠：使用39 / 上限50名（初期10名から増枠した表示例）。在籍37名＋休職2名を数え、退職1名は除外します。<a href="/settings">拠点・登録枠の画面へ</a></div>
      <SummaryCards items={summary} label="隊員管理のサマリー" />
      <div className="management-banner banner-amber" role="note"><span className="management-banner-icon"><Icon name="shield" size={18} /></span><div><strong>次期の参考：教育予定未登録 {educationPending.length}名</strong><span>初回の資格基本情報と、教育管理の表示例を分けて確認します。</span></div><button type="button" onClick={() => { clearFilters(); setEducationOnly(true); }}>参考例を確認<Icon name="arrow-right" size={15} /></button></div>
      <div className="management-workspace">
        <section className="panel personnel-list-panel" aria-labelledby="personnel-list-title">
          <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="users" size={19} /></span><h2 id="personnel-list-title">隊員一覧</h2><span className="count-label">{officers.length}名</span></div><span className="management-list-scope">東京セキュリティ / 本社</span></div>
          <div className="management-tabs table-tabs" role="group" aria-label="隊員の在籍・配置状況で絞り込み">{tabs.map((tab) => <button type="button" key={tab.value} className={rosterFilter === tab.value ? 'is-selected' : ''} aria-pressed={rosterFilter === tab.value} onClick={() => { setRosterFilter(tab.value); setPage(0); }}>{tab.label}<span>{tab.count}</span></button>)}</div>
          <div className="management-filter-bar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="隊員名・ID・配置現場で検索" placeholder="隊員名・ID・配置現場で検索" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label><label className="management-select"><select aria-label="保有資格で絞り込み" value={qualification} onChange={(event) => { setQualification(event.target.value); setPage(0); }}><option value="all">すべての資格</option><option>交通誘導2級</option><option>施設警備2級</option><option>雑踏警備2級</option><option value="none">資格登録なし</option></select><Icon name="chevron-down" size={13} /></label><label className="management-select"><select aria-label="雇用区分で絞り込み" value={employment} onChange={(event) => { setEmployment(event.target.value); setPage(0); }}><option value="all">すべての雇用区分</option><option>常勤</option><option>非常勤</option></select><Icon name="chevron-down" size={13} /></label></div>
          <div className="management-list-note"><span><Icon name="help" size={12} />隊員名を選ぶと資格や連絡先を表示</span><button type="button" className={`management-inline-filter${educationOnly ? ' is-selected' : ''}`} aria-pressed={educationOnly} onClick={() => { setEducationOnly(!educationOnly); setPage(0); }}><Icon name="shield" size={12} />教育予定未登録{educationOnly && <Icon name="check" size={12} />}</button></div>
          <p className="table-scroll-hint">左右にスクロールして隊員情報を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="management-table-scroll"><table className="management-table personnel-table"><thead><tr><th scope="col">隊員名 / ID</th><th scope="col">雇用区分</th><th scope="col">保有資格</th><th scope="col">本日の配置</th><th scope="col">在籍状態</th><th scope="col"><span className="sr-only">詳細</span></th></tr></thead><tbody>{visible.map((officer) => <OfficerRow key={officer.id} officer={officer} selected={selected?.id === officer.id} onSelect={() => setSelectedId(officer.id)} />)}{visible.length === 0 && <EmptyRows colSpan={6} onClear={clearFilters} />}</tbody></table></div>
          <ListPagination total={filtered.length} page={currentPage} pageSize={pageSize} onChange={setPage} />
        </section>
        <OfficerProfile officer={selected} />
      </div>
      <footer className="dashboard-footer"><span>隊員の情報を整えて、安心できる配置へ。</span><span>KEIBI<span className="footer-dot">·</span>個人情報・資格・教育記録は架空のサンプルです</span></footer>
    </main>
  );
}
