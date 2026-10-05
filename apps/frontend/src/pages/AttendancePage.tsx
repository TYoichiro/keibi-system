import { useState } from 'react';
import Icon from '../components/Icon';
import { EmptyRows, ListPagination, PersonAvatar, StatusBadge, SummaryCards } from '../components/ManagementUI';
import type { SummaryItem } from '../components/ManagementUI';
import { attendanceDays, attendanceRecords, attendanceStatuses, formatDuration } from '../data/attendance';
import type { AttendanceRecord, AttendanceStatus } from '../data/attendance';
import { normalizeSearch, officers } from '../data/personnel';
import './management.css';

type AttendanceFilter = 'all' | AttendanceStatus | 'review';
const pageSize = 8;
const latestDay = attendanceDays[attendanceDays.length - 1];
const officerColors = new Map(officers.map((officer) => [officer.id, officer.color]));

function AttendanceRow({ record, selected, onSelect }: { record: AttendanceRecord; selected: boolean; onSelect: () => void }) {
  const status = attendanceStatuses[record.status];
  return (
    <tr className={`management-row${selected ? ' is-selected' : ''}`}>
      <th scope="row"><button type="button" className="person-select" aria-label={`${record.name}の勤怠詳細`} aria-pressed={selected} onClick={onSelect}><PersonAvatar name={record.name} color={officerColors.get(record.officerId) ?? 'blue'} /><span><strong>{record.name}</strong><span>{record.officerId}</span></span></button></th>
      <td><div className="attendance-site"><strong>{record.siteName}</strong><span>{record.category}<i />{record.shift}</span></div></td>
      <td><span className="attendance-scheduled-hours">{record.scheduledStart}<span>〜</span>{record.endNextDay && <small>翌</small>}{record.scheduledEnd}</span><span className="attendance-break">休憩予定 {record.breakMinutes}分</span></td>
      <td><span className={`attendance-clock${record.officerId === 'G004' ? ' has-review' : ''}`}>{record.clockIn ?? '—'}</span></td>
      <td><span className={`attendance-clock${record.status === 'unreported' ? ' has-review' : ''}`}>{record.clockOut ? `${record.endNextDay ? '翌 ' : ''}${record.clockOut}` : '—'}</span></td>
      <td><span className="attendance-actual">{record.actualMinutes !== null ? formatDuration(record.actualMinutes) : record.status === 'scheduled' ? '—' : '集計前'}</span></td>
      <td><StatusBadge label={status.label} tone={status.tone} />{record.reviewNote && <span className="attendance-review-tag"><Icon name="alert" size={10} />要確認</span>}</td>
      <td><button type="button" className="icon-button row-action" aria-label={`${record.name}の打刻詳細を表示`} onClick={onSelect}><Icon name="chevron-right" size={15} /></button></td>
    </tr>
  );
}

function AttendanceDetail({ record, reviews, onReviewSelect }: { record?: AttendanceRecord; reviews: AttendanceRecord[]; onReviewSelect: (record: AttendanceRecord) => void }) {
  if (!record) return <section className="panel management-detail-empty"><Icon name="clock" size={30} /><h2>勤怠の詳細</h2><p>検索・絞り込みの条件を変更してください。</p></section>;
  const status = attendanceStatuses[record.status];
  return (
    <aside className="management-side-column" aria-label="選択した隊員の勤怠詳細">
      <section className="panel attendance-detail-panel">
        <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="clock" size={19} /></span><h2>勤怠の詳細</h2></div><span className="small-muted">{record.date.slice(5).replace('-', '/')}</span></div>
        <div className="management-detail-body">
          <div className="person-profile-heading"><PersonAvatar name={record.name} color={officerColors.get(record.officerId) ?? 'blue'} large /><div><h3>{record.name}</h3><span>{record.officerId}<i />本社所属</span></div><StatusBadge label={status.label} tone={status.tone} /></div>
          <div className="attendance-site-card"><span><Icon name="building" size={13} />配置現場</span><a href={`/sites?site=${record.siteId}`}>{record.siteName}<Icon name="arrow-up-right" size={13} /></a><p>{record.category}<span>{record.shift}</span></p></div>
          <div className="management-detail-section"><h4><Icon name="calendar" size={14} />勤務予定</h4><dl><div><dt>勤務時間</dt><dd>{record.scheduledHours}</dd></div><div><dt>休憩予定</dt><dd>{record.breakMinutes}分</dd></div></dl></div>
          <div className="management-detail-section"><h4><Icon name="activity" size={14} />打刻・報告</h4><ol className="attendance-timeline"><li className={record.clockIn ? 'is-reported' : ''}><span className="attendance-timeline-dot"><Icon name={record.clockIn ? 'check' : 'clock'} size={11} /></span><div><strong>上番報告</strong><span>{record.clockIn ? '報告済み' : '上番前・報告待ち'}</span></div><time>{record.clockIn ?? '—'}</time></li><li className={record.clockOut ? 'is-reported' : record.status === 'unreported' ? 'is-missing' : ''}><span className="attendance-timeline-dot"><Icon name={record.clockOut ? 'check' : record.status === 'unreported' ? 'alert' : 'clock'} size={11} /></span><div><strong>下番報告</strong><span>{record.clockOut ? '報告済み' : record.status === 'unreported' ? '未報告・確認が必要' : '下番後に報告'}</span></div><time>{record.clockOut ? `${record.endNextDay ? '翌 ' : ''}${record.clockOut}` : '—'}</time></li></ol></div>
          <div className={`attendance-duration-card${record.actualMinutes !== null ? ' is-complete' : ''}`}><span>勤務実績<span>{record.actualMinutes !== null ? '休憩を除く' : '下番後に集計'}</span></span><strong>{record.actualMinutes !== null ? formatDuration(record.actualMinutes) : '集計前'}</strong><small>{record.actualMinutes !== null ? `休憩 ${record.breakMinutes}分を差し引いた時間です` : '上番・下番報告が揃うと実績を表示します'}</small></div>
          {record.reviewNote && <div className="attendance-review-note"><strong><Icon name="alert" size={13} />管制で確認が必要</strong><p>{record.reviewNote}</p></div>}
        </div>
        <div className="management-detail-actions"><button type="button" className="secondary-button" title="打刻修正は表示サンプルです"><Icon name="edit" size={14} />打刻を修正</button><a href={`/officers?officer=${record.officerId}`} className="text-button">隊員情報<Icon name="arrow-up-right" size={14} /></a></div>
      </section>
      <section className="panel attendance-review-panel"><div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="alert" size={18} /></span><h2>確認が必要な勤怠</h2></div><span className="count-label">{reviews.length}件</span></div><div className="attendance-review-list">{reviews.length ? reviews.map((review) => <button type="button" key={review.id} className={review.id === record.id ? 'is-selected' : ''} onClick={() => onReviewSelect(review)}><span><strong>{review.name}</strong><span>{review.officerId === 'G004' ? '上番時刻の確認' : review.status === 'unreported' ? '下番報告が未登録' : '休憩予定の変更'}</span></span><Icon name="chevron-right" size={14} /></button>) : <p className="attendance-no-review"><Icon name="check-circle" size={16} />確認が必要な勤怠はありません</p>}</div></section>
    </aside>
  );
}

export default function AttendancePage() {
  const initialOfficer = new URLSearchParams(window.location.search).get('officer');
  const initialRecords = attendanceRecords.filter((record) => record.date === latestDay.iso);
  const initialIndex = Math.max(0, initialRecords.findIndex((record) => record.officerId === initialOfficer));
  const [dayIndex, setDayIndex] = useState(attendanceDays.length - 1);
  const [statusFilter, setStatusFilter] = useState<AttendanceFilter>('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(Math.floor(initialIndex / pageSize));
  const [selectedOfficer, setSelectedOfficer] = useState(initialRecords[initialIndex].officerId);
  const day = attendanceDays[dayIndex];
  const records = attendanceRecords.filter((record) => record.date === day.iso);
  const reviews = records.filter((record) => record.reviewNote);
  const count = (status: AttendanceStatus) => records.filter((record) => record.status === status).length;
  const siteOptions = [...new Map(records.map((record) => [record.siteId, record.siteName]))];
  const filtered = records.filter((record) =>
    (statusFilter === 'all' || (statusFilter === 'review' ? Boolean(record.reviewNote) : record.status === statusFilter))
    && (siteFilter === 'all' || record.siteId === siteFilter)
    && (shiftFilter === 'all' || record.shift === shiftFilter)
    && normalizeSearch(`${record.officerId} ${record.name} ${record.siteName}`).includes(normalizeSearch(query))
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = visible.find((record) => record.officerId === selectedOfficer) ?? visible[0];
  const summary: SummaryItem[] = [
    { label: '勤務中', value: count('working'), unit: '名', note: '上番報告済み', icon: 'activity', tone: 'green' },
    { label: '上番前', value: count('scheduled'), unit: '名', note: '勤務開始を待機', icon: 'clock', tone: 'blue' },
    { label: '下番済み', value: count('finished'), unit: '名', note: '勤務実績を集計済み', icon: 'check-circle', tone: 'violet' },
    { label: '確認が必要', value: reviews.length, unit: '件', note: `うち下番未報告 ${count('unreported')}件`, icon: 'alert', tone: 'amber' },
  ];
  const tabs: { value: AttendanceFilter; label: string; count: number }[] = [
    { value: 'all', label: 'すべて', count: records.length },
    { value: 'working', label: '勤務中', count: count('working') },
    { value: 'scheduled', label: '上番前', count: count('scheduled') },
    { value: 'finished', label: '下番済み', count: count('finished') },
    { value: 'review', label: '要確認', count: reviews.length },
  ];

  function clearFilters() {
    setStatusFilter('all'); setSiteFilter('all'); setShiftFilter('all'); setQuery(''); setPage(0);
  }
  function selectReview(record?: AttendanceRecord) {
    clearFilters(); setStatusFilter('review');
    if (record) setSelectedOfficer(record.officerId);
  }
  function changeDay(index: number) {
    setDayIndex(index); clearFilters();
  }

  return (
    <main className="dashboard attendance-page">
      <div className="page-heading management-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />ATTENDANCE MANAGEMENT</div><h1>勤怠管理</h1><p>日ごとの上番・下番報告と勤務実績を、ひと目で確認。</p></div><div className="management-heading-actions"><button type="button" className="secondary-button"><Icon name="download" size={16} />勤怠を出力</button><button type="button" className="primary-button" title="勤怠確定は表示サンプルです"><Icon name="check-circle" size={17} />勤怠を確定</button></div></div>
      <div className="attendance-day-bar"><div className="attendance-day-control"><button type="button" aria-label="前の日" disabled={dayIndex === 0} onClick={() => changeDay(dayIndex - 1)}><Icon name="chevron-left" size={15} /></button><label><Icon name="calendar" size={16} /><select aria-label="勤怠日を選択" value={dayIndex} onChange={(event) => changeDay(Number(event.target.value))}>{attendanceDays.map((item, index) => <option key={item.iso} value={index}>{item.label}</option>)}</select><Icon name="chevron-down" size={13} /></label><button type="button" aria-label="次の日" disabled={dayIndex === attendanceDays.length - 1} onClick={() => changeDay(dayIndex + 1)}><Icon name="chevron-right" size={15} /></button></div><div className="attendance-day-meta"><span>勤務予定<strong>{records.length}</strong>名</span><span className="attendance-snapshot"><span />{day.snapshot} 時点のサンプル</span></div></div>
      <SummaryCards items={summary} label="選択した日の勤怠サマリー" />
      <div className={`management-banner ${reviews.length ? 'banner-amber' : 'banner-green'}`} role="note"><span className="management-banner-icon"><Icon name={reviews.length ? 'alert' : 'check-circle'} size={18} /></span><div><strong>{reviews.length ? `管制で確認が必要な勤怠が${reviews.length}件あります` : '確認が必要な勤怠はありません'}</strong><span>打刻時刻や報告内容を確認してから、勤務実績を確定してください。</span></div>{reviews.length > 0 && <button type="button" onClick={() => selectReview()}>対象の勤怠を確認<Icon name="arrow-right" size={15} /></button>}</div>
      <div className="management-workspace">
        <section className="panel attendance-list-panel" aria-labelledby="attendance-list-title">
          <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="clock" size={19} /></span><h2 id="attendance-list-title">日別の勤怠一覧</h2><span className="count-label">{records.length}名</span></div><span className="management-list-scope">東京セキュリティ / 本社</span></div>
          <div className="management-tabs table-tabs" role="group" aria-label="勤怠の状態で絞り込み">{tabs.map((tab) => <button type="button" key={tab.value} className={statusFilter === tab.value ? 'is-selected' : ''} aria-pressed={statusFilter === tab.value} onClick={() => { setStatusFilter(tab.value); setPage(0); }}>{tab.label}<span>{tab.count}</span></button>)}</div>
          <div className="management-filter-bar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="隊員名・ID・現場名で検索" placeholder="隊員名・ID・現場名で検索" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label><label className="management-select attendance-site-select"><select aria-label="現場で絞り込み" value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); setPage(0); }}><option value="all">すべての現場</option>{siteOptions.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select><Icon name="chevron-down" size={13} /></label><label className="management-select"><select aria-label="勤務帯で絞り込み" value={shiftFilter} onChange={(event) => { setShiftFilter(event.target.value); setPage(0); }}><option value="all">すべての勤務帯</option><option>日勤</option><option>夜勤</option><option>早朝</option></select><Icon name="chevron-down" size={13} /></label></div>
          <div className="management-list-note"><span><Icon name="help" size={12} />隊員名を選ぶと打刻・報告の詳細を表示</span><span className="attendance-actual-hint">実績は下番後に集計</span></div>
          <p className="table-scroll-hint">左右にスクロールして打刻・実績を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="management-table-scroll"><table className="management-table attendance-table"><thead><tr><th scope="col">隊員名 / ID</th><th scope="col">配置現場</th><th scope="col">勤務予定</th><th scope="col">上番</th><th scope="col">下番</th><th scope="col">実績</th><th scope="col">状態</th><th scope="col"><span className="sr-only">詳細</span></th></tr></thead><tbody>{visible.map((record) => <AttendanceRow key={record.id} record={record} selected={selected?.id === record.id} onSelect={() => setSelectedOfficer(record.officerId)} />)}{visible.length === 0 && <EmptyRows colSpan={8} onClear={clearFilters} />}</tbody></table></div>
          <ListPagination total={filtered.length} page={currentPage} pageSize={pageSize} onChange={setPage} />
        </section>
        <AttendanceDetail record={selected} reviews={reviews} onReviewSelect={selectReview} />
      </div>
      <footer className="dashboard-footer"><span>一日の勤務を、確かな記録に。</span><span>KEIBI<span className="footer-dot">·</span>2026年10月3日・4日の架空の勤怠サンプルです</span></footer>
    </main>
  );
}
