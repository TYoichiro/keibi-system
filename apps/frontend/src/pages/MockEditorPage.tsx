import type { ReactNode } from 'react';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { clients } from '../data/clients';
import { officers } from '../data/personnel';
import { managedSites } from '../data/siteManagement';
import { getSiteDetails } from '../data/assignments';
import { formatDutyDateTime, mockDutySlots, mockDutyStateLabels } from '../data/mockDutySlots';
import type { MockDutySlot } from '../data/mockDutySlots';
import './mock-editor.css';

type EditorKind = 'officers' | 'clients' | 'sites' | 'assignments';
const editorNames: Record<EditorKind, string> = { officers: '隊員', clients: '取引先', sites: '現場', assignments: '勤務枠・配置' };
const editorIcons: Record<EditorKind, IconName> = { officers: 'users', clients: 'building', sites: 'map-pin', assignments: 'calendar' };

function Field({ label, value = '', type = 'text', required = false, hint, wide = false, options, multiline = false }: {
  label: string; value?: string; type?: string; required?: boolean; hint?: string; wide?: boolean; options?: { value: string; label: string }[]; multiline?: boolean;
}) {
  return <label className={`mock-editor-field${wide ? ' is-wide' : ''}`}><span>{label}<small className={required ? 'is-required' : ''}>{required ? '必須' : '任意'}</small></span>{options ? <select defaultValue={value} aria-required={required || undefined}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : multiline ? <textarea defaultValue={value} rows={3} aria-required={required || undefined} /> : <input type={type} defaultValue={value} aria-required={required || undefined} min={type === 'number' ? 1 : undefined} />}{hint && <span className="mock-editor-field-hint">{hint}</span>}</label>;
}

function FieldGroup({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return <section className="panel mock-editor-card"><div className="mock-editor-card-heading"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="mock-editor-fields">{children}</div></section>;
}

function InfoCard({ title, icon = 'help', children }: { title: string; icon?: IconName; children: ReactNode }) {
  return <section className="panel mock-editor-info"><h2><Icon name={icon} size={17} />{title}</h2>{children}</section>;
}

function BranchField() {
  return <Field label="所属拠点" required value="B001" options={[{ value: 'B001', label: '本社（本店） / B001' }]} hint="初回は同じ拠点の現場・隊員で配置します" />;
}

function OfficerEditor({ isNew, id }: { isNew: boolean; id: string | null }) {
  const officer = officers.find((item) => item.id === id) ?? officers[3];
  const affected = isNew ? [] : mockDutySlots.filter((slot) => slot.publicDuty && slot.officers.some((item) => item.id === officer.id));
  return <>
    <div className="mock-editor-main">
      <FieldGroup number="01" title="隊員の基本情報" description="隊員情報とログイン用アカウントは別に管理します。">
        <Field label="隊員番号" required value={isNew ? '' : officer.id} hint="同じ会社で識別する番号" /><Field label="氏名" required value={isNew ? '' : officer.name} /><BranchField /><Field label="在籍状態" required value={isNew ? 'active' : officer.status} options={[{ value: 'active', label: '在籍' }, { value: 'leave', label: '休職' }, { value: 'retired', label: '退職' }]} /><Field label="業務連絡先（電話）" type="tel" value={isNew ? '' : officer.phone} /><Field label="業務連絡先（メール）" type="email" value={isNew ? '' : officer.email} hint="ログインメールとは別の項目です" />
      </FieldGroup>
      <FieldGroup number="02" title="資格の基本情報・確認" description="資格を保有しているという表示と、証明内容の確認を分けます。">
        <Field label="資格名称・区分" value={isNew ? '' : officer.qualifications.join('、')} hint="例：交通誘導警備業務2級" /><Field label="確認状態" value="unconfirmed" options={[{ value: 'unconfirmed', label: '未確認' }, { value: 'confirmed', label: '確認済み（表示例）' }, { value: 'invalid', label: '無効・要再確認' }]} /><Field label="有効開始日" type="date" /><Field label="有効終了日" type="date" /><Field label="確認者" /><Field label="確認日" type="date" /><Field label="確認根拠・補足" wide multiline hint="証明書の添付・教育記録の管理は次期の範囲です" />
      </FieldGroup>
      <FieldGroup number="03" title="管制用メモ・変更理由" description="隊員本人向けの勤務指示とは分けて扱います。">
        <Field label="内部メモ" wide multiline value={isNew ? '' : officer.note} hint="住所・口座・健康情報・本人確認書類等は入力しないでください" /><Field label="変更理由" wide multiline hint="所属・在籍状態・資格変更の理由を記録する表示案" />
      </FieldGroup>
    </div>
    <aside className="mock-editor-side">
      <InfoCard title="本社の隊員登録枠" icon="user-plus"><div className="mock-editor-capacity"><strong>39<small> / 50人</small></strong><span>残り 11枠</span></div><div className="mock-editor-capacity-track"><span /></div><p>在籍37人＋休職2人。退職1人は履歴を残して枠から除きます。</p><p>本店・支店ごとの初期枠は10人。この本店は増枠後の表示例です。</p><a className="text-button" href="/settings">登録枠の設定を確認<Icon name="arrow-right" size={13} /></a></InfoCard>
      <InfoCard title="状態・所属変更の影響" icon="alert"><span className="mock-editor-small-tag">保存前に確認する表示例</span><p>休職・退職・異動では、未終了の確定勤務を確認します。既存予定を自動で取り消しません。</p>{affected.length > 0 ? <ul>{affected.map((slot) => <li key={slot.dutyId}><strong>{slot.name}</strong><span>{formatDutyDateTime(slot.startAt)} ～ {formatDutyDateTime(slot.endAt)}</span><a href={`/assignments?duty=${slot.dutyId}&date=${slot.date}`}>勤務枠を確認</a></li>)}</ul> : <p>選択中の隊員に該当する確定勤務の表示例はありません。</p>}<p>退職時は対応アカウントの停止も確認。復職・異動先では登録枠を再確認します。</p></InfoCard>
      <InfoCard title="確認が必要な条件"><p>資格の有効期間・責任者の条件はQ06で未決です。この画面は正式な配置可否を判定しません。</p><p>アカウント未発行の隊員も登録・配置できる想定です。利用者発行は設定画面で確認します。</p></InfoCard>
    </aside>
  </>;
}

function ClientEditor({ isNew, id }: { isNew: boolean; id: string | null }) {
  const client = clients.find((item) => item.id === id) ?? clients[0];
  return <>
    <div className="mock-editor-main">
      <FieldGroup number="01" title="取引先の基本情報" description="初回は業務上必要な名称・窓口と所属を登録します。">
        <Field label="取引先コード" required value={isNew ? '' : client.id} /><Field label="取引先名" required value={isNew ? '' : client.name} /><BranchField /><Field label="状態" required value="active" options={[{ value: 'active', label: '利用中' }, { value: 'stopped', label: '停止' }]} hint="停止の意味・新規勤務への影響は確認前の案" />
      </FieldGroup>
      <FieldGroup number="02" title="業務窓口" description="会社・管制で利用する連絡先です。">
        <Field label="業務窓口の担当者名" value={isNew ? '' : client.contact} /><Field label="電話番号" type="tel" value={isNew ? '' : client.phone} /><Field label="メールアドレス" type="email" value={isNew ? '' : client.email} wide /><Field label="変更理由" multiline wide />
      </FieldGroup>
    </div>
    <aside className="mock-editor-side">
      <InfoCard title="関連する現場" icon="building">{isNew ? <p>登録後に現場とIDで関連付ける想定です。</p> : <ul>{client.sites.map((site) => <li key={site.id}><a href={`/sites?site=${site.id}`}>{site.name}</a><span>{site.id}</span></li>)}</ul>}<p>名称の変更で関連現場を付け替えません。所属・状態の変更は関連する未終了勤務への影響を確認します。</p></InfoCard>
      <InfoCard title="初回に入力する範囲"><p>締め・支払条件、請求、契約書類の添付・保管は次期の範囲です。</p><p>警備員には担当勤務に必要な公開連絡先だけを表示する想定です。</p></InfoCard>
    </aside>
  </>;
}

function SiteEditor({ isNew, id }: { isNew: boolean; id: string | null }) {
  const site = managedSites.find((item) => item.id === id) ?? managedSites[1];
  const client = clients.find((item) => item.name === site.client);
  return <>
    <div className="mock-editor-main">
      <FieldGroup number="01" title="現場の基本情報" description="現場マスタと、日別の勤務日時・必要人数は分けて登録します。">
        <Field label="現場コード" required value={isNew ? '' : site.id} /><Field label="現場名" required value={isNew ? '' : site.name} /><BranchField /><Field label="取引先" required value={isNew ? '' : client?.id} options={[{ value: '', label: '取引先を選択' }, ...clients.map((item) => ({ value: item.id, label: `${item.name} / ${item.id}` }))]} /><Field label="警備種別" required value={isNew ? 'traffic' : site.type} options={[{ value: 'traffic', label: '交通誘導' }, { value: 'facility', label: '施設警備' }, ...(!isNew && site.type === 'event' ? [{ value: 'event', label: '雑踏警備（次期の参考）' }] : [])]} /><Field label="現場状態" required value={isNew ? 'planned' : site.status} options={[{ value: 'planned', label: '準備中' }, { value: 'active', label: '稼働中' }, { value: 'paused', label: '休止中' }, { value: 'closed', label: '終了' }]} /><Field label="場所・所在地" required wide value={isNew ? '' : site.address} /><Field label="契約開始日" type="date" value={isNew ? '' : site.contractStart} /><Field label="契約終了日" type="date" value={isNew ? '' : site.contractEnd} hint="期間を登録する場合は両日を入力する案" />
      </FieldGroup>
      <FieldGroup number="02" title="警備員への公開候補" description="確定する勤務ごとに内容を確認し、公開版として固定する想定です。">
        <Field label="集合場所" wide value={isNew ? '' : site.meeting} /><Field label="業務連絡先の担当者名" value={isNew ? '' : site.contact} /><Field label="業務連絡先の電話" type="tel" value={isNew ? '' : site.phone} /><Field label="標準の勤務指示" wide multiline value={isNew ? '' : site.note} hint="勤務枠へ初期コピーする内容の表示例" /><Field label="配置条件" wide multiline value={isNew ? '' : site.condition} hint="資格・責任者・必須項目の具体条件はQ06等で確認前" />
      </FieldGroup>
      <FieldGroup number="03" title="管制用内部メモ" description="公開する勤務指示とは別の欄です。">
        <Field label="内部メモ" wide multiline /><Field label="変更理由" wide multiline />
      </FieldGroup>
    </div>
    <aside className="mock-editor-side">
      <InfoCard title="公開済み勤務への影響" icon="alert"><p>現場マスタを編集しても、確定済み勤務の現場名・集合場所・指示・業務連絡先は自動で変更しません。</p><p>公開内容を変える場合は、対象の勤務枠を改訂します。</p>{!isNew && <a className="text-button" href={`/assignments?site=${site.id}`}>この現場の勤務枠を確認<Icon name="arrow-right" size={13} /></a>}</InfoCard>
      <InfoCard title="休止・終了・期間変更"><p>新規配置の可否と、未終了の確定勤務への影響を確認します。現場状態の変更だけで勤務を一律取消しません。</p><p>夜勤は開始日だけでなく終了日時まで契約期間を確認する想定です。</p></InfoCard>
      <InfoCard title="勤務枠の作成" icon="calendar"><p>日ごとの開始・終了日時と必要人数は「勤務枠・配置」で入力します。同じ現場の連日・日勤・夜勤も別の枠として確認します。</p><a className="text-button" href={`/assignments/new${isNew ? '' : `?site=${site.id}`}`}>勤務枠の入力見本<Icon name="arrow-right" size={13} /></a></InfoCard>
    </aside>
  </>;
}

function DutyPreview({ slot, isNew }: { slot: MockDutySlot; isNew: boolean }) {
  const details = getSiteDetails(slot);
  const site = managedSites.find((item) => item.id === slot.id);
  const published = isNew ? undefined : slot.publicDuty;
  return <InfoCard title={isNew ? '公開情報の表示位置（固定見本）' : '本人向け公開プレビュー'} icon="shield"><span className="mock-editor-small-tag">{isNew ? '選択・入力後の見え方を示す固定見本' : published ? `現在公開中の v${published.version}` : slot.state === 'cancelled' ? '取消後は現場詳細を本人に公開しない' : '公開候補・本人には非公開'}</span><h3>{published?.siteName ?? slot.name}</h3>{slot.state !== 'cancelled' && <dl><div><dt>勤務日時</dt><dd>{formatDutyDateTime(published?.startAt ?? slot.startAt)} ～<br />{formatDutyDateTime(published?.endAt ?? slot.endAt)}</dd></div><div><dt>集合場所</dt><dd>{published?.meeting ?? details.meeting}</dd></div><div><dt>勤務指示</dt><dd>{published?.instruction ?? details.note}</dd></div><div><dt>業務連絡先</dt><dd>{published?.contact ?? site?.contact}<br />{published?.phone ?? site?.phone}</dd></div></dl>}<p>他隊員の一覧・資格条件・内部メモは本人に公開しません。この欄は入力値と連動しない固定の表示例です。</p>{published && slot.officers.some((officer) => officer.id === 'G004') && <a className="text-button" href={`/guard/site?duty=${slot.dutyId}`}>警備員向けの表示見本<Icon name="arrow-right" size={13} /></a>}</InfoCard>;
}

function AssignmentEditor({ isNew, slot, mode }: { isNew: boolean; slot: MockDutySlot; mode: string | null }) {
  const details = getSiteDetails(slot);
  const site = managedSites.find((item) => item.id === slot.id);
  const cancelling = !isNew && (mode === 'cancel' || slot.state === 'cancelled');
  const revision = !isNew && !cancelling && (mode === 'revision' || ['revision', 'published'].includes(slot.state));
  const startAt = revision ? slot.revisionStartAt ?? slot.startAt : slot.startAt;
  const endAt = revision ? slot.revisionEndAt ?? slot.endAt : slot.endAt;
  const shortage = Math.max(0, slot.required - slot.officers.length);
  return <>
    <div className="mock-editor-main">
      {cancelling ? <FieldGroup number="01" title="勤務枠全体の取消" description="一人の入替えは改訂、勤務枠を取りやめる場合は全体取消です。"><Field label="対象勤務" value={`${slot.name} / ${slot.dutyId}`} wide /><Field label="取消理由" required wide multiline value={slot.changeReason ?? ''} /><div className="mock-editor-inline-note"><Icon name="alert" size={16} /><p>取消後は本人予定の概要に取消状態を残し、現場詳細を非公開にする想定です。再開は新しい下書きから行います。</p></div></FieldGroup> : <>
        <FieldGroup number="01" title="日別の勤務枠" description="勤務日は開始の日本時間日付。夜勤も終了日付を明示します。">
          <BranchField /><Field label="現場" required value={isNew ? (new URLSearchParams(window.location.search).get('site') ?? '') : slot.id} options={[{ value: '', label: '現場を選択' }, ...managedSites.filter((item) => item.type !== 'event' && ['active', 'planned'].includes(item.status)).map((item) => ({ value: item.id, label: `${item.name} / ${item.id}` }))]} /><Field label="開始日時" required type="datetime-local" value={isNew ? '2026-10-05T09:00' : startAt} /><Field label="終了日時" required type="datetime-local" value={isNew ? '2026-10-05T18:00' : endAt} hint="終了は開始より後。翌日終了も日付で指定" /><Field label="必要人数" required type="number" value={isNew ? '3' : String(slot.required)} /><div className="mock-editor-inline-note"><Icon name="calendar" size={16} /><p>連日の勤務は日ごとに作成します。例：10/5の日勤と10/6の日勤、同日の夜勤は、それぞれ別の勤務枠です。</p></div>
        </FieldGroup>
        <FieldGroup number="02" title="配置隊員・条件の確認" description="人数不足でも下書きにできます。本人への公開は人数と条件の確認後です。">
          <div className="mock-editor-roster">{!isNew && slot.officers.map((officer) => <div key={officer.id}><span className="mock-editor-roster-avatar">{officer.name[0]}</span><span><strong>{officer.name}</strong><small>{officer.id} / 本社</small></span><span className="mock-editor-small-tag">{officer.leader ? '責任者候補' : '配置候補'}</span><button type="button" className="text-button" title="隊員の解除は表示のみです">外す</button></div>)}<button type="button" className="secondary-button" title="隊員の選択は表示のみです"><Icon name="plus" size={14} />隊員を選択（表示のみ）</button></div>
          <Field label="現場責任者" value={isNew ? '' : slot.officers.find((officer) => officer.leader)?.id} options={[{ value: '', label: '配置隊員から選択' }, ...(!isNew ? slot.officers.map((officer) => ({ value: officer.id, label: officer.name })) : [])]} hint="要否・選任条件はQ06の確認前の案" /><Field label="必要資格" value={slot.type === 'traffic' ? '交通誘導警備業務2級' : '会社の条件を確認'} /><Field label="資格保有が必要な人数" type="number" value="1" hint="全員必須か人数内の1名かを区別する案" /><Field label="資格条件の確認メモ" multiline wide hint="資格未確認・不足や有効期間を会社で確認します" />
        </FieldGroup>
        <FieldGroup number="03" title="警備員へ公開する内容" description="確定した版に保存し、マスタの変更では自動更新しない想定です。">
          <Field label="公開する現場名" value={isNew ? '' : slot.name} wide /><Field label="集合場所" value={isNew ? '' : details.meeting} wide /><Field label="勤務指示" multiline wide value={isNew ? '' : details.note} /><Field label="業務連絡先の担当者" value={isNew ? '' : site?.contact} /><Field label="業務連絡先の電話" type="tel" value={isNew ? '' : site?.phone} /><Field label="管制用内部メモ（非公開）" multiline wide />
        </FieldGroup>
        <FieldGroup number="04" title="管制の確認記録" description="勤務希望の提出を確認の代用にせず、既存の連絡手段で確認します。">
          <div className="mock-editor-checks"><label><input type="checkbox" />勤務可能な日時を本人に確認した</label><label><input type="checkbox" />移動・休息を確認した</label><label><input type="checkbox" />集合場所・指示・公開連絡先を確認した</label></div><Field label="確認者" value="佐々木 一" /><Field label="確認日時" type="datetime-local" /><Field label="確認方法・連絡内容" wide multiline hint="電話等の既存手段。アプリ通知・既読記録は次期です" />{revision && <Field label="改訂理由" required wide multiline value={slot.changeReason ?? ''} />}
        </FieldGroup>
      </>}
    </div>
    <aside className="mock-editor-side">
      <InfoCard title="現在の勤務枠" icon="calendar"><span className={`mock-editor-state state-${slot.state}`}>{isNew ? '新しい下書き' : mockDutyStateLabels[slot.state]}</span><h3>{isNew ? '新しい勤務枠（未保存）' : slot.name}</h3><p className="mock-editor-id">{isNew ? '勤務枠IDは作成後に発行する想定' : slot.dutyId}</p>{!isNew && <p>{formatDutyDateTime(slot.startAt)} ～ {formatDutyDateTime(slot.endAt)}</p>}{slot.publicDuty && revision && <div className="mock-editor-version"><strong>現在公開中 v{slot.publicDuty.version}</strong><span>{formatDutyDateTime(slot.startAt)} ～ {formatDutyDateTime(slot.endAt)}</span><strong>改訂案 v{slot.publicDuty.version + 1}（非公開）</strong><span>{formatDutyDateTime(startAt)} ～ {formatDutyDateTime(endAt)}</span><p>再確定するまで、本人には現在公開中の版を表示します。</p></div>}</InfoCard>
      {!cancelling && <InfoCard title="確定前の確認" icon="alert"><ul className="mock-editor-condition-list"><li><strong>人数</strong><span>{isNew ? '未配置 / 必要3名の入力例' : `${slot.officers.length} / 必要${slot.required}名${shortage > 0 ? `・不足${shortage}名` : '・人数充足'}`}</span></li><li><strong>在籍・重複勤務</strong><span>確認前（自動判定は未実装）</span></li><li><strong>資格・責任者</strong><span>具体条件はQ06で要確認</span></li><li><strong>本人への連絡</strong><span>既存手段で別途確認</span></li></ul><p>このモックは入力内容から正式な確定可否を判定しません。不足のまま本人へ公開しないルールです。</p></InfoCard>}
      <DutyPreview slot={slot} isNew={isNew} />
      <InfoCard title="改訂・取消・破棄の違い"><p>隊員の入替え・時間・公開内容の変更は改訂。改訂案を破棄した場合は現在公開中の版を維持します。</p><p>勤務開始後の改訂・取消は会社管理者のみ。終了後の訂正手順はQ10で未決です。</p>{!isNew && slot.publicDuty && <div className="mock-editor-side-actions"><a href={`/assignments/edit?duty=${slot.dutyId}&mode=revision`} className="text-button">改訂の入力見本</a><a href={`/assignments/edit?duty=${slot.dutyId}&mode=cancel`} className="text-button">全体取消の確認見本</a></div>}</InfoCard>
    </aside>
  </>;
}

export default function MockEditorPage() {
  const kind = window.location.pathname.split('/')[1] as EditorKind;
  const isNew = window.location.pathname.endsWith('/new');
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const slot = mockDutySlots.find((item) => item.dutyId === params.get('duty')) ?? mockDutySlots.find((item) => item.id === params.get('site')) ?? mockDutySlots[1];
  const cancelling = !isNew && kind === 'assignments' && (mode === 'cancel' || slot.state === 'cancelled');
  const revision = !isNew && !cancelling && kind === 'assignments' && (mode === 'revision' || ['revision', 'published'].includes(slot.state));
  const heading = cancelling ? '勤務枠の取消確認' : `${editorNames[kind]}の${isNew ? '登録' : revision ? '改訂' : '編集'}`;
  const returnUrl = kind === 'assignments' ? `/assignments?date=${slot.date}&duty=${slot.dutyId}` : `/${kind}`;
  const invalidTarget = kind === 'officers' ? params.has('officer') && !officers.some((item) => item.id === params.get('officer')) : kind === 'clients' ? params.has('client') && !clients.some((item) => item.id === params.get('client')) : kind === 'sites' ? params.has('site') && !managedSites.some((item) => item.id === params.get('site')) : params.has('duty') && !mockDutySlots.some((item) => item.dutyId === params.get('duty')) || params.has('site') && !(isNew ? managedSites : mockDutySlots).some((item) => item.id === params.get('site'));
  if (invalidTarget) return <main className="dashboard mock-editor-page"><div className="page-heading"><div><h1>指定した対象のモックがありません</h1><p>一覧から、確認するサンプルを選び直してください。</p></div></div><a className="secondary-button" href={`/${kind}`}><Icon name="chevron-left" size={14} />一覧へ戻る</a></main>;
  if (kind === 'assignments' && slot.state === 'reference' && !isNew || kind === 'assignments' && params.has('site') && managedSites.find((item) => item.id === params.get('site'))?.type === 'event') return <main className="dashboard mock-editor-page"><div className="page-heading"><div><h1>雑踏警備は次期の参考モックです</h1><p>初回の勤務枠は交通誘導・施設警備を対象とします。この現場の確定・公開の入力見本はありません。</p></div></div><a className="secondary-button" href="/assignments">配置一覧へ戻る</a></main>;
  return <main className="dashboard mock-editor-page">
    <div className="page-heading"><div><div className="page-eyebrow"><Icon name={editorIcons[kind]} size={13} /> INPUT PREVIEW</div><h1>{heading}<span className="mock-editor-heading-tag">モック</span></h1><p>登録項目と確認の流れをすり合わせるための入力画面です。</p></div><a className="secondary-button" href={returnUrl}><Icon name="chevron-left" size={14} />一覧へ戻る</a></div>
    <div className="mock-editor-notice" role="note"><Icon name="help" size={17} /><div><strong>入力・確認の表示見本</strong><span>入力は保存されません。登録・確定・取消・公開・通知の各ボタンは表示のみです。</span></div></div>
    <div className="mock-editor-context"><span>東京セキュリティ / 本社（本店）</span><span>操作範囲・必須項目の一部は確認前の案</span></div>
    <div className="mock-editor-workspace" key={`${kind}-${isNew}-${slot.dutyId}-${mode}`}>{kind === 'officers' ? <OfficerEditor isNew={isNew} id={params.get('officer')} /> : kind === 'clients' ? <ClientEditor isNew={isNew} id={params.get('client')} /> : kind === 'sites' ? <SiteEditor isNew={isNew} id={params.get('site')} /> : <AssignmentEditor isNew={isNew} slot={slot} mode={mode} />}</div>
    <div className="mock-editor-action-bar"><span><Icon name="help" size={14} />保存・公開は行わない表示確認用です</span><div><a className="secondary-button" href={returnUrl}>一覧へ戻る</a>{kind === 'assignments' && !cancelling && <button type="button" className="secondary-button" title="下書き保存は表示のみです">下書き保存（表示のみ）</button>}{revision && <button type="button" className="secondary-button" title="改訂案の破棄は表示のみです">改訂案を破棄（表示のみ）</button>}{slot.state === 'cancelled' && kind === 'assignments' ? <a className="primary-button" href={`/assignments/new?site=${slot.id}`}>新しい下書きの入力見本</a> : <button type="button" className="primary-button" title="保存や確定は行いません"><Icon name={cancelling ? 'alert' : 'check-circle'} size={15} />{kind === 'assignments' ? cancelling ? '勤務枠を取消（表示のみ）' : '配置を確定（表示のみ）' : `${isNew ? '登録' : '変更を保存'}（表示のみ）`}</button>}</div></div>
    <footer className="dashboard-footer"><span>入力項目と確認の流れを、画面で確かめる。</span><span>KEIBI<span className="footer-dot">·</span>架空の表示サンプル</span></footer>
  </main>;
}
