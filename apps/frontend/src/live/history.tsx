import { useState } from 'react';
import { useResource } from './api';
import { ErrorBox, Loading } from './UI';
import { formatDate } from './dates';
import { roleLabels, stateLabels } from './types';
import type { Role } from './types';

interface AuditEvent { id: string; actorId: string | null; actorName?: string; entityType: string; targetName?: string; action: string; reason: string; beforeData?: unknown; afterData?: unknown; createdAt: string }
const actionLabels: Record<string, string> = {created: '登録', updated: '更新', confirmed: '配置確定', revision_confirmed: '配置の改訂確定', cancelled: '勤務取消', draft_created: '勤務枠の下書き登録', draft_updated: '下書き更新', draft_discarded: '下書き破棄', revision_created: '改訂下書き作成', qualifications_replaced: '資格情報変更', branch_access_replaced: '取引先の利用拠点変更', membership_created: '利用者の事前登録', membership_updated: '利用者権限変更', invitation_created: '招待発行', invitation_reissued: '再招待', google_link_changed: 'Google連携変更', branch_created: '支店追加', officer_limit_changed: '隊員登録枠の増加', 'branch.create': '支店追加', 'branch.quota': '隊員登録枠の増加', 'membership.change': '利用者の所属・権限・利用状態変更', 'invitation.issue': '招待発行・再招待', 'google.replace.approve': 'Google連携変更の承認', 'operator.bootstrap': '運営者による会社・最初の管理者登録', 'operator.recover': '運営者による管理者利用の復旧'};
const fields: Record<string, string> = {code: 'コード', name: '名称・氏名', displayName: '利用者名', status: '状態', branchId: '所属拠点ID', branchIds: '利用拠点ID', businessPhone: '業務電話', businessEmail: '業務メール', contactName: '業務窓口', employmentType: '雇用区分', serviceArea: '対応エリア', internalMemo: '内部メモ', location: '所在地', meetingPoint: '集合場所', instructions: '公開指示', contractFrom: '契約開始日', contractThrough: '契約終了日', securityType: '警備種別', dutyDate: '勤務日', startsAt: '開始日時', endsAt: '終了日時', requiredCount: '必要人数', assignments: '配置', qualificationRequirements: '資格条件', siteSnapshot: '勤務の公開情報', availabilityCheck: '勤務可能の確認', travelRestCheck: '移動・休息の確認', role: '役割', officerId: '本人隊員ID', officerLimit: '隊員登録枠', limit: '隊員登録枠', verificationStatus: '資格確認状態', validFrom: '資格有効開始日', validThrough: '資格有効終了日'};
function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未設定';
  if (typeof value === 'boolean') return value ? '確認済み' : '未確認';
  if (typeof value === 'string') return stateLabels[value] ?? roleLabels[value as Role] ?? ({traffic: '交通誘導', facility: '施設警備'}[value as 'traffic']) ?? value;
  if (Array.isArray(value)) return value.length ? value.map(show).join(' / ') : 'なし';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${fields[key] ?? ({isLeader: '現場責任者', confirmed: '確認', note: '確認方法', officerName: '隊員名', qualificationId: '資格ID', requiredQualifiedCount: '資格必要人数'}[key as 'isLeader']) ?? key}: ${show(item)}`).join('、');
  return String(value);
}
function differences(event: AuditEvent): {label: string; before: string; after: string}[] {
  const before = event.beforeData && typeof event.beforeData === 'object' && !Array.isArray(event.beforeData) ? event.beforeData as Record<string, unknown> : {};
  const after = event.afterData && typeof event.afterData === 'object' && !Array.isArray(event.afterData) ? event.afterData as Record<string, unknown> : {};
  if (Array.isArray(event.beforeData) || Array.isArray(event.afterData)) return [{label: event.action === 'branch_access_replaced' ? '利用拠点' : '資格一覧', before: show(event.beforeData), after: show(event.afterData)}];
  return Object.keys(fields).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => ({label: fields[key], before: show(before[key]), after: show(after[key])}));
}
export function AuditHistory({entityId, initiallyOpen = false, source = 'domain'}: {entityId?: string; initiallyOpen?: boolean; source?: 'domain' | 'auth'}) {
  const [open, setOpen] = useState(initiallyOpen); const [page, setPage] = useState(1);
  const history = useResource<AuditEvent[]>(open ? `${source === 'auth' ? '/auth' : ''}/audit-events?pageSize=20&page=${page}${entityId ? `&entityId=${entityId}` : ''}` : null);
  return <div className="live-subsection"><button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '変更履歴を閉じる' : '変更履歴を確認'}</button>{open && (history.loading ? <Loading /> : history.error ? <ErrorBox error={history.error} retry={history.reload} /> : <><ul className="live-history">{history.data?.data.map((event) => <li key={event.id}><strong>{actionLabels[event.action] ?? event.action}</strong><small>操作者: {event.actorName ?? event.actorId} · {formatDate(event.createdAt)}</small>{event.targetName && <span>対象: {event.targetName}</span>}<span>理由: {event.reason || '通常登録・更新'}</span>{differences(event).length > 0 && <details><summary>変更内容を確認</summary><div className="table-scroll"><table className="live-table"><thead><tr><th>項目</th><th>変更前</th><th>変更後</th></tr></thead><tbody>{differences(event).map((difference) => <tr key={difference.label}><td>{difference.label}</td><td>{difference.before}</td><td>{difference.after}</td></tr>)}</tbody></table></div></details>}</li>)}{!history.data?.data.length && <li>表示できる履歴はありません。</li>}</ul><div className="live-pagination"><span>{history.data?.total ?? 0}件 / {page}ページ</span><button className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>前へ</button><button className="secondary-button" disabled={page * 20 >= (history.data?.total ?? 0)} onClick={() => setPage(page + 1)}>次へ</button></div></>)}</div>;
}
