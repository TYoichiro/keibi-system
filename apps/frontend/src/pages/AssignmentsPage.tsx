import { useState } from 'react';
import Icon from '../components/Icon';
import { availableOfficers, getSiteDetails } from '../data/assignments';
import { formatDutyDateTime, mockDutyDates, mockDutySlots, mockDutyStateLabels } from '../data/mockDutySlots';
import type { MockDutySlot } from '../data/mockDutySlots';
import './assignments.css';

type StatusFilter = 'all' | 'shortage' | 'complete';
type ShiftFilter = 'all' | '日勤' | '夜勤' | '早朝';

function AssignmentSummary({ slots }: { slots: MockDutySlot[] }) {
  const activeSlots = slots.filter((slot) => !['cancelled', 'reference'].includes(slot.state));
  const required = activeSlots.reduce((total, slot) => total + slot.required, 0);
  const assigned = activeSlots.reduce((total, slot) => total + slot.officers.length, 0);
  const published = activeSlots.filter((slot) => slot.publicDuty);
  const draftCount = activeSlots.filter((slot) => slot.state === 'draft').length;
  const items = [
    { label: '対象日の勤務枠', value: activeSlots.length, unit: '枠', icon: 'building', color: 'blue', note: `確定 ${published.length}・下書き ${draftCount}` },
    { label: '必要人数', value: required, unit: '名', icon: 'users', color: 'slate', note: '下書き・確定の合計' },
    { label: '公開版の配置', value: published.reduce((total, slot) => total + slot.officers.length, 0), unit: '名', icon: 'check-circle', color: 'teal', note: '改訂案とは合算しない' },
    { label: '下書きの不足', value: required - assigned, unit: '名', icon: 'user-plus', color: 'amber', note: '取消・次期参考は集計外' },
  ] as const;
  return <section className="allocation-summary" aria-label="初回対象の勤務枠サマリー">{items.map((item) => <article className={`allocation-stat allocation-stat-${item.color}`} key={item.label}><span className="allocation-stat-icon"><Icon name={item.icon} size={20} /></span><div className="allocation-stat-content"><span className="allocation-stat-label">{item.label}</span><div><strong>{item.value}</strong><span>{item.unit}</span><small>{item.note}</small></div></div></article>)}</section>;
}

function PlacementRow({ slot, selected, onSelect }: { slot: MockDutySlot; selected: boolean; onSelect: () => void }) {
  const shortage = Math.max(0, slot.required - slot.officers.length);
  const stateLabel = slot.state === 'draft' ? '下書き' : slot.state === 'published' ? '確定' : slot.state === 'revision' ? '改訂案あり' : slot.state === 'cancelled' ? '取消済み' : '次期の参考';
  const stateNote = slot.state === 'reference' ? '初回集計外' : slot.state === 'cancelled' ? '現場詳細は非公開' : slot.state === 'draft' ? `本人非公開 / 不足${shortage}名` : slot.state === 'revision' ? '旧版を本人に表示' : `公開版 v${slot.publicDuty?.version}`;
  return (
    <tr className={`placement-row${selected ? ' is-selected' : ''}${slot.state === 'cancelled' ? ' is-cancelled' : ''}`}>
      <th scope="row"><button type="button" className="placement-site" aria-pressed={selected} onClick={onSelect}><span className={`site-type-icon type-${slot.type}`}><Icon name={slot.type === 'traffic' ? 'traffic' : slot.type === 'event' ? 'flag' : 'building'} size={18} /></span><span className="placement-site-description"><strong>{slot.name}</strong><span className="placement-client">{slot.client}</span><span className="placement-shift"><span className={slot.shift === '夜勤' ? 'is-night-shift' : ''}>{slot.shift}</span>{formatDutyDateTime(slot.startAt)} ～ {formatDutyDateTime(slot.endAt)}</span></span></button></th>
      <td className="placement-required"><strong>{slot.required}</strong><span>名</span></td>
      <td><div className="placement-officers">
        {slot.officers.map((officer) => <a href={`/officers?officer=${officer.id}`} className={`officer-chip${officer.leader ? ' is-leader' : ''}`} key={officer.id}><span className="officer-initial">{officer.name[0]}</span><span>{officer.name}</span>{officer.leader && <span className="leader-label" title="現場責任者の表示例">責</span>}</a>)}
        {slot.state === 'draft' && Array.from({ length: shortage }, (_, index) => <a className="empty-officer-slot" href={`/assignments/edit?duty=${slot.dutyId}`} key={index} aria-label={`${slot.name}の配置入力見本を開く`}><Icon name="plus" size={13} /><span>配置の入力見本</span></a>)}
        {slot.state === 'cancelled' && <span className="allocation-cancelled-note">有効な配置なし / 取消履歴を確認</span>}
      </div></td>
      <td className="placement-status"><span className={`allocation-state allocation-state-${slot.state}`}>{stateLabel}</span><span className="placement-status-count">{stateNote}</span></td>
    </tr>
  );
}

function AvailableOfficers({ date }: { date: string }) {
  const [query, setQuery] = useState('');
  const visibleOfficers = availableOfficers.filter((officer) => `${officer.name.replaceAll(' ', '')} ${officer.qualification ?? ''} ${officer.area}`.includes(query.trim().replaceAll(' ', '')));
  return (
    <section className="panel available-officers-panel" aria-labelledby="available-title">
      <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="user-plus" size={19} /></span><h2 id="available-title">候補隊員（確認前）</h2><span className="count-label">{availableOfficers.length}名</span></div></div>
      <div className="available-toolbar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="候補隊員を検索" placeholder="隊員名・資格で検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label><p>10/4の未配置サンプル。別日の候補とは未連動</p></div>
      <div className="available-officers-list">
        {visibleOfficers.map((officer) => <article className="available-officer" key={officer.id}><div className="available-officer-heading"><span className={`available-avatar avatar-${officer.color}`}>{officer.name[0]}</span><div><strong><a className="allocation-officer-link" href={`/officers?officer=${officer.id}`}>{officer.name}</a></strong><span>{officer.id}<i />{officer.employment}</span></div></div><div className="available-officer-info"><span><Icon name="clock" size={12} />{officer.hours}</span><span><Icon name="map-pin" size={12} />{officer.area}</span></div>{officer.qualification && <span className="qualification-badge"><Icon name="shield" size={11} />{officer.qualification} / 確認前</span>}</article>)}
        {visibleOfficers.length === 0 && <p className="available-empty">該当する隊員がいません。</p>}
      </div>
      <div className="available-footer"><Icon name="help" size={13} /><span>{date === '2026-10-04' ? '勤務可能・移動・休息は別手段で確認' : '対象日の在籍・勤務可能・重複は未判定'}</span></div>
    </section>
  );
}

function SelectedDuty({ slot }: { slot?: MockDutySlot }) {
  if (!slot) return <section className="panel selected-site-panel"><div className="selected-site-body"><h3>条件に一致する勤務枠がありません</h3><p className="selected-site-client">検索・絞り込みの条件を変更してください。</p></div></section>;
  const details = getSiteDetails(slot);
  const shortage = Math.max(0, slot.required - slot.officers.length);
  const editable = slot.state !== 'reference';
  const historyAt = slot.state === 'published' && slot.publicDuty ? formatDutyDateTime(slot.publicDuty.updatedAt) : slot.state === 'draft' ? '10/03 17:00' : '10/04 09:00';
  return (
    <section className="panel selected-site-panel" aria-labelledby="selected-duty-title">
      <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="calendar" size={18} /></span><h2 id="selected-duty-title">選択中の勤務枠</h2></div><span className="small-muted">{slot.id}</span></div>
      <div className="selected-site-body">
        <span className={`allocation-state allocation-state-${slot.state}`}>{mockDutyStateLabels[slot.state]}</span><h3>{slot.name}</h3><p className="allocation-duty-id">{slot.dutyId}</p><p className="selected-site-client">{slot.client}</p>
        <dl className="selected-site-details allocation-duty-dates"><div><dt><Icon name="clock" size={13} />開始日時</dt><dd>{formatDutyDateTime(slot.startAt)}</dd></div><div><dt><Icon name="clock" size={13} />終了日時</dt><dd>{formatDutyDateTime(slot.endAt)}{slot.startAt.slice(0, 10) !== slot.endAt.slice(0, 10) && <span className="allocation-next-day">翌日終了</span>}</dd></div></dl>
        {!['cancelled', 'reference'].includes(slot.state) && <div className="selected-site-capacity"><span>{slot.state === 'draft' ? '下書きの人数' : '公開版の人数'}</span><strong>{slot.officers.length}<small> / {slot.required}名</small></strong><span className={`status-badge status-${shortage > 0 ? 'warning' : 'active'}`}>{shortage > 0 ? `不足${shortage}名` : '人数充足'}</span></div>}
        {slot.state === 'revision' && <div className="allocation-version-compare"><strong>公開中 v1</strong><span>{formatDutyDateTime(slot.startAt)} ～ {formatDutyDateTime(slot.endAt)}</span><strong>改訂案 v2（本人非公開）</strong><span>{formatDutyDateTime(slot.revisionStartAt!)} ～ {formatDutyDateTime(slot.revisionEndAt!)}</span><p>{slot.changeReason}</p></div>}
        {slot.state === 'cancelled' ? <div className="placement-memo"><span><Icon name="message" size={13} />取消理由の表示例</span><p>{slot.changeReason}</p><p>現在の有効人数には含めません。再開は新しい下書きから。</p></div> : slot.state === 'reference' ? <div className="placement-memo"><span>初回の対象は交通誘導・施設警備</span><p>雑踏警備は次期の参考モックとして残しています。初回の確定・公開対象には含めません。</p></div> : <>
          <div className="site-condition"><Icon name="shield" size={13} /><span><strong>確定前に確認する条件（案）</strong>{details.condition ?? '在籍・勤務重複・公開内容を確認'}<br />資格・責任者の具体条件はQ06で要確認</span></div>
          <div className="placement-memo"><span><Icon name="message" size={13} />管制の確認記録</span><p>勤務可能・移動・休息：別手段で確認する入力見本。自動判定・通知・既読記録は未実装です。</p></div>
        </>}
        <div className="allocation-selected-actions"><a className="text-button allocation-site-link" href={`/sites?site=${slot.id}`}>現場マスタを開く<Icon name="arrow-up-right" size={13} /></a>{editable && <a className="secondary-button" href={`/assignments/edit?duty=${slot.dutyId}${slot.state === 'revision' ? '&mode=revision' : slot.state === 'cancelled' ? '&mode=cancel' : ''}`}>{slot.state === 'cancelled' ? '取消内容の見本' : slot.state === 'draft' ? '下書き・配置の入力見本' : '確定・改訂の確認見本'}</a>}</div>
        {slot.publicDuty && <div className="allocation-public-preview"><h4><Icon name="shield" size={13} />本人向けの公開版 v{slot.publicDuty.version}</h4><dl><div><dt>集合場所</dt><dd>{slot.publicDuty.meeting}</dd></div><div><dt>勤務指示</dt><dd>{slot.publicDuty.instruction}</dd></div><div><dt>業務連絡先</dt><dd>{slot.publicDuty.contact}<br />{slot.publicDuty.phone}</dd></div></dl><p>他隊員一覧・内部メモは公開しません。マスタ変更は公開済み勤務に自動反映しません。</p>{slot.officers.some((officer) => officer.id === 'G004') && <a className="text-button" href={`/guard/site?duty=${slot.dutyId}`}>本人向けの画面見本<Icon name="arrow-right" size={12} /></a>}<a className="text-button" href={`/assignments/edit?duty=${slot.dutyId}&mode=cancel`}>勤務枠全体の取消見本<Icon name="arrow-right" size={12} /></a></div>}
        {editable && <div className="allocation-history"><h4>変更履歴（表示例）</h4><ol><li><strong>{slot.state === 'draft' ? '下書き作成' : slot.state === 'cancelled' ? '勤務枠全体を取消' : slot.state === 'revision' ? '改訂案を作成' : '配置を確定・公開'}</strong><span>佐々木 一 / {historyAt}</span><p>{slot.state === 'draft' ? '人数調整中。本人予定には表示しない。' : slot.state === 'cancelled' ? slot.changeReason : slot.state === 'revision' ? slot.changeReason : '人数と勤務内容を確認した表示例。別手段での連絡は別途。'}</p></li>{slot.state === 'revision' && slot.publicDuty && <li><strong>公開版 v1を確定</strong><span>佐々木 一 / {formatDutyDateTime(slot.publicDuty.updatedAt)}</span></li>}</ol></div>}
      </div>
    </section>
  );
}

export default function AssignmentsPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedDuty = mockDutySlots.find((slot) => slot.dutyId === params.get('duty'));
  const invalidTarget = params.has('duty') && !requestedDuty || params.has('site') && !mockDutySlots.some((slot) => slot.id === params.get('site'));
  const [date, setDate] = useState(requestedDuty?.date ?? (mockDutyDates.some((item) => item.iso === params.get('date')) ? params.get('date')! : '2026-10-04'));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(params.get('filter') === 'shortage' ? 'shortage' : params.get('filter') === 'complete' ? 'complete' : 'all');
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('all');
  const [publicationFilter, setPublicationFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(requestedDuty?.dutyId ?? mockDutySlots.find((slot) => slot.id === params.get('site'))?.dutyId ?? mockDutySlots[0].dutyId);
  const slots = mockDutySlots.filter((slot) => slot.date === date);
  const shortages = slots.filter((slot) => slot.state === 'draft' && slot.officers.length < slot.required);
  const shortageCount = shortages.reduce((total, slot) => total + slot.required - slot.officers.length, 0);
  const completeCount = slots.filter((slot) => !['cancelled', 'reference'].includes(slot.state) && slot.officers.length >= slot.required).length;
  const visibleSlots = slots.filter((slot) => {
    const shortage = slot.state === 'draft' && slot.officers.length < slot.required;
    return (statusFilter === 'all' || (statusFilter === 'shortage' ? shortage : !['cancelled', 'reference'].includes(slot.state) && !shortage)) && (shiftFilter === 'all' || slot.shift === shiftFilter) && (publicationFilter === 'all' || slot.state === publicationFilter) && `${slot.name} ${slot.client} ${slot.dutyId} ${slot.officers.map((officer) => officer.name).join(' ')}`.replaceAll(' ', '').includes(query.trim().replaceAll(' ', ''));
  });
  const selectedSlot = invalidTarget ? undefined : visibleSlots.find((slot) => slot.dutyId === selectedId) ?? visibleSlots[0];

  return (
    <main className="dashboard allocation-page">
      <div className="page-heading allocation-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />DAILY ASSIGNMENTS</div><h1>配置・管理</h1><p>日別の勤務枠で配置を調整し、下書きと本人への公開版を分けて確認します。</p></div><div className="allocation-heading-actions"><a className="primary-button" href="/assignments/new"><Icon name="plus" size={16} />勤務枠を作成（入力見本）</a></div></div>
      <div className="allocation-mock-note" role="note"><Icon name="help" size={16} /><span>画面確認用のモックです。保存・確定・改訂・取消・公開・通知は行いません。資格・重複等の正式判定も未実装です。</span></div>
      {invalidTarget && <div className="allocation-mock-note" role="note"><Icon name="alert" size={16} /><span>指定した勤務枠・現場の表示サンプルがありません。一覧から選び直してください。</span><a className="text-button" href="/assignments">指定を解除</a></div>}
      <div className="allocation-flow" aria-label="配置の流れ"><span><b>1</b>勤務枠を作成</span><Icon name="chevron-right" size={13} /><span><b>2</b>下書きで配置調整</span><Icon name="chevron-right" size={13} /><span><b>3</b>条件・公開内容を確認</span><Icon name="chevron-right" size={13} /><span><b>4</b>確定・別手段で連絡</span></div>
      <div className="allocation-date-bar"><div className="allocation-date-navigation"><span className="allocation-date-icon"><Icon name="calendar" size={19} /></span><div className="allocation-day-tabs" role="group" aria-label="勤務日の表示例を切り替え">{mockDutyDates.map((item) => <button type="button" key={item.iso} className={date === item.iso ? 'is-current' : ''} aria-pressed={date === item.iso} onClick={() => { setDate(item.iso); setStatusFilter('all'); setPublicationFilter('all'); setShiftFilter('all'); setQuery(''); }}><strong>{item.label}</strong><span>{item.note}</span></button>)}</div></div><span className="allocation-date-note"><Icon name="building" size={13} />東京セキュリティ<span>/</span>本社</span></div>
      <AssignmentSummary slots={slots} />
      {shortages.length > 0 && <div className="attention-banner allocation-attention" role="note"><span className="attention-icon"><Icon name="alert" size={18} /></span><div><strong>{shortages.length}勤務枠で、あと{shortageCount}名の配置が必要です</strong><span>不足の勤務枠は下書きです。一部の隊員だけを本人予定に公開しません。</span></div><button type="button" className="attention-button" onClick={() => { setStatusFilter('shortage'); setPublicationFilter('all'); setShiftFilter('all'); setQuery(''); }}>不足の下書きを表示<Icon name="arrow-right" size={15} /></button></div>}
      <div className="allocation-workspace">
        <section className="panel placement-board" aria-labelledby="placement-board-title">
          <div className="panel-heading"><div className="panel-title"><span className="section-icon"><Icon name="calendar" size={19} /></span><h2 id="placement-board-title">勤務枠別の配置表</h2><span className="count-label">{slots.length}件</span></div><span className="placement-board-mode">日付・枠別の表示例</span></div>
          <div className="placement-filter-bar">
            <div className="table-tabs" role="group" aria-label="人数の状況で絞り込み"><button type="button" className={statusFilter === 'all' ? 'is-selected' : ''} aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>すべて<span>{slots.length}</span></button><button type="button" className={statusFilter === 'shortage' ? 'is-selected' : ''} aria-pressed={statusFilter === 'shortage'} onClick={() => setStatusFilter('shortage')}>不足あり<span className="tab-warning-count">{shortages.length}</span></button><button type="button" className={statusFilter === 'complete' ? 'is-selected' : ''} aria-pressed={statusFilter === 'complete'} onClick={() => setStatusFilter('complete')}>人数充足<span>{completeCount}</span></button></div>
            <div className="placement-search-filters"><label className="placement-shift-filter"><span className="sr-only">公開状態で絞り込み</span><select aria-label="公開状態で絞り込み" value={publicationFilter} onChange={(event) => setPublicationFilter(event.target.value)}><option value="all">すべての状態</option><option value="draft">下書き</option><option value="published">確定・公開</option><option value="revision">改訂案あり</option><option value="cancelled">取消済み</option><option value="reference">次期の参考</option></select><Icon name="chevron-down" size={13} /></label><label className="placement-shift-filter"><span className="sr-only">勤務帯で絞り込み</span><select aria-label="勤務帯で絞り込み" value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value as ShiftFilter)}><option value="all">すべての勤務帯</option><option value="日勤">日勤</option><option value="夜勤">夜勤</option><option value="早朝">早朝</option></select><Icon name="chevron-down" size={13} /></label><label className="site-search"><Icon name="search" size={15} /><input aria-label="現場・取引先・勤務枠・隊員で検索" placeholder="現場・隊員・勤務枠を検索" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          </div>
          <div className="placement-legend"><span><i className="legend-dot dot-teal" />公開版の配置</span><span><i className="legend-dot dot-amber" />下書き・未配置</span><span><i className="legend-leader">責</i>責任者の表示例</span></div>
          <p className="table-scroll-hint">左右にスクロールして配置隊員を確認できます<Icon name="arrow-right" size={12} /></p>
          <div className="placement-table-scroll"><table className="placement-table"><thead><tr><th scope="col">現場 / 開始・終了日時</th><th scope="col">必要</th><th scope="col">配置隊員</th><th scope="col">勤務枠の状態</th></tr></thead><tbody>{visibleSlots.map((slot) => <PlacementRow key={slot.dutyId} slot={slot} selected={selectedSlot?.dutyId === slot.dutyId} onSelect={() => setSelectedId(slot.dutyId)} />)}{visibleSlots.length === 0 && <tr><td colSpan={4} className="empty-results">条件に一致する勤務枠がありません。</td></tr>}</tbody></table></div>
          <div className="table-footer"><span>{slots.length}件中 {visibleSlots.length}件を表示</span><span className="table-footer-note">保存されない表示例</span></div>
          <div className="allocation-board-footnote"><Icon name="help" size={13} /><span>雑踏警備は次期の参考です。初回集計から除きます。翌日以降は追加した状態見本で、週間見通し・勤務希望とは連動しません。</span></div>
        </section>
        <aside className="allocation-side-panels" aria-label="選択した勤務枠と候補隊員"><SelectedDuty slot={selectedSlot} /><AvailableOfficers date={date} /></aside>
      </div>
      <footer className="dashboard-footer"><span>下書きと公開版を、同じ勤務枠で確認する。</span><span>KEIBI<span className="footer-dot">·</span>画面確認用のサンプルデータを表示しています</span></footer>
    </main>
  );
}
