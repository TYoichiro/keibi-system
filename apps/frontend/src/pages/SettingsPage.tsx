import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { PersonAvatar, StatusBadge } from '../components/ManagementUI';
import { officers, normalizeSearch } from '../data/personnel';
import { companyDefaults, memberRoles, notificationDefaults, operationDefaults, permissionExamples, settingsBranches, settingsMembers, settingsSections } from '../data/settings';
import type { MemberRole, SettingsSection } from '../data/settings';
import './management.css';
import './settings.css';

type CompanyValues = typeof companyDefaults;
type OperationValues = typeof operationDefaults;
type NotificationValues = typeof notificationDefaults;

function SettingsCard({ title, description, icon, scope, children, action }: { title: string; description: string; icon: IconName; scope?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel settings-card">
      <div className="settings-card-heading"><span className="settings-card-icon"><Icon name={icon} size={19} /></span><div><h2>{title}{scope && <span className="settings-scope-badge">{scope}</span>}</h2><p>{description}</p></div>{action}</div>
      {children}
    </section>
  );
}

function SettingsField({ label, value, onChange, type = 'text', hint, required = false, readOnly = false, wide = false }: { label: string; value: string; onChange?: (value: string) => void; type?: string; hint?: string; required?: boolean; readOnly?: boolean; wide?: boolean }) {
  return <label className={`settings-field${wide ? ' is-wide' : ''}`}><span>{label}{required && <small>必須</small>}</span><input type={type} value={value} readOnly={readOnly} aria-required={required || undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined} />{hint && <span className="settings-field-hint">{hint}</span>}</label>;
}

function SettingsSelect({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; hint?: string }) {
  return <label className="settings-field"><span>{label}</span><span className="settings-select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Icon name="chevron-down" size={14} /></span>{hint && <span className="settings-field-hint">{hint}</span>}</label>;
}

function SettingsToggle({ label, description, checked, onChange, icon }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; icon?: IconName }) {
  return <div className="settings-toggle-row">{icon && <span className="settings-toggle-icon"><Icon name={icon} size={17} /></span>}<div><strong>{label}</strong><p>{description}</p></div><button type="button" role="switch" aria-label={label} aria-checked={checked} className={`settings-switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div>;
}

function CompanySettings({ values, onChange }: { values: CompanyValues; onChange: (values: CompanyValues) => void }) {
  const update = (key: keyof CompanyValues) => (value: string) => onChange({ ...values, [key]: value });
  const activeCount = officers.filter((officer) => officer.status === 'active').length;
  const leaveCount = officers.filter((officer) => officer.status === 'leave').length;
  const retiredCount = officers.filter((officer) => officer.status === 'retired').length;
  const usedCount = activeCount + leaveCount;
  const headOffice = settingsBranches[0];
  return (
    <>
      <SettingsCard title="会社の基本情報" description="会社名や連絡先など、ワークスペースの基本情報を確認します。" icon="building" scope="会社共通">
        <div className="settings-company-profile"><span className="settings-company-mark"><Icon name="shield" size={25} /></span><div><strong>{values.displayName || '会社の表示名'}</strong><span>KEIBI クラウド管制システム</span></div><span className="settings-tenant-code">会社ID<span>TEN-001</span></span></div>
        <div className="settings-fields-grid"><SettingsField label="会社名" value={values.name} onChange={update('name')} required /><SettingsField label="表示名" value={values.displayName} onChange={update('displayName')} required hint="メニューや画面に表示する名称" /><SettingsField label="代表電話番号" type="tel" value={values.phone} onChange={update('phone')} /><SettingsField label="代表メールアドレス" type="email" value={values.email} onChange={update('email')} /><SettingsField label="郵便番号" value={values.postalCode} onChange={update('postalCode')} /><SettingsField label="担当者" value={values.contact} onChange={update('contact')} /><SettingsField label="所在地" value={values.address} onChange={update('address')} wide /></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />会社・本店・最初の管理者の登録と、管理者全員が利用不能になった場合の復旧は、運営者が会社の本人確認を行います。会社名などの自由な変更は確認前で、入力は見た目のプレビューです。</p>
      </SettingsCard>
      <SettingsCard title="本店・支店と登録枠" description="本店は会社に1つ。支店と隊員の登録枠を拠点ごとに確認します。支店追加・増枠は本店所属の会社管理者のみ行えます。" icon="map-pin" scope="会社管理者向け" action={<button type="button" className="text-button settings-card-action" title="支店の追加は表示のみです"><Icon name="plus" size={14} />支店を追加（表示のみ）</button>}>
        <div className="settings-branch-list">{settingsBranches.map((branch) => {
          const used = branch.sample ? 0 : usedCount;
          return <div className="settings-branch-card" key={branch.id}><span className="settings-branch-icon"><Icon name="building" size={21} /></span><div><strong>{branch.sample ? branch.name : values.branchName || '拠点名'}<span>{branch.kind} / {branch.id}</span></strong><p>{branch.sample ? '支店追加後の表示例。業務データはありません。' : values.address || '所在地未入力'}</p><div className="settings-branch-capacity"><strong>{used}<small>/ {branch.currentLimit}人</small></strong><span>登録枠を使用<span>初期枠 {branch.initialLimit}人{!branch.sample && ' → 50人へ増枠済みの例'}</span></span></div><div className="settings-capacity-track" aria-hidden="true"><span style={{ width: `${used / branch.currentLimit * 100}%` }} /></div><span>{branch.sample ? '在籍 0名・休職 0名' : `在籍 ${activeCount}名 + 休職 ${leaveCount}名 = ${usedCount}名`}<span className="settings-separator">·</span>残り {branch.currentLimit - used}枠</span>{!branch.sample && <span>退職 {retiredCount}名は履歴を保持し、登録枠から除外</span>}</div><StatusBadge label={branch.sample ? '追加例' : '本店'} tone={branch.sample ? 'blue' : 'green'} /></div>;
        })}</div>
        <div className="settings-fields-grid settings-branch-fields"><SettingsField label="本店の拠点名" value={values.branchName} onChange={update('branchName')} required /><SettingsField label="拠点コード" value="B001" readOnly hint="現場・隊員・利用者の所属先を識別します" /></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />本店・各支店の初期登録枠はそれぞれ10人です。この本店は40名の既存モックを確認するため、増枠後の表示例としています。隊員数とログイン利用者数は別に数えます。</p>
      </SettingsCard>
      <SettingsCard title="支店追加の入力見本" description="本店所属の会社管理者が支店を1拠点ずつ追加する画面案です。支店名・コードと業務窓口を確認します。" icon="building" scope="表示のみ">
        <div className="settings-fields-grid"><SettingsField label="支店名" value="横浜支店" readOnly required /><SettingsField label="拠点コード" value="B002" readOnly required hint="会社内で支店を識別するコードの入力例" /><SettingsField label="業務窓口" value="横浜支店 管制窓口" readOnly /><SettingsField label="業務窓口の電話番号" value="045-000-1000" type="tel" readOnly /><SettingsField label="業務窓口のメールアドレス" value="yokohama@example.invalid" type="email" readOnly /><SettingsField label="新しい支店の初期登録枠" value="10人" readOnly hint="在籍・休職中の隊員を数えます。利用者数の上限とは別です" /></div>
        <div className="settings-action-preview"><span>支店1拠点を追加 / 初期10枠・課金なし</span><button type="button" className="secondary-button" title="支店の保存は表示のみです">支店を保存（表示のみ）</button></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />上の横浜支店カードは追加後の表示例です。この入力見本から支店・利用者の作成や登録枠の保存は行いません。</p>
      </SettingsCard>
      <SettingsCard title="対象拠点の登録枠を増やす" description="本店所属の会社管理者が対象拠点だけを増枠します。初回は支店追加・増枠とも課金なしです。" icon="user-plus" scope="表示のみ">
        <div className="settings-fields-grid"><SettingsField label="対象拠点" value={`本社（本店） / ${headOffice.id}`} readOnly /><SettingsField label="現在の上限" value={`${headOffice.currentLimit}人（使用 ${usedCount}人）`} readOnly /><SettingsField label="変更後の上限" value="60人" readOnly hint="増加のみの入力例。横浜支店の10人枠は変わりません" /><SettingsField label="変更理由" value="新規現場に向けた隊員の追加登録" readOnly /></div>
        <div className="settings-action-preview"><span>50 → 60人 / 本店だけを変更</span><button type="button" className="secondary-button" title="登録枠の変更は表示のみです">登録枠を増やす（表示のみ）</button></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />利用者の招待・アプリ利用停止で隊員の登録枠は変わりません。変更者・日時・理由を履歴に残す想定です。支店所属の会社管理者は支店追加・増枠を行えません。権限制御は未実装です。</p>
      </SettingsCard>
    </>
  );
}

function OperationSettings({ values, onChange }: { values: OperationValues; onChange: (values: OperationValues) => void }) {
  const update = <K extends keyof OperationValues>(key: K, value: OperationValues[K]) => onChange({ ...values, [key]: value });
  return (
    <>
      <SettingsCard title="勤務時間の初期値" description="新しい現場や勤務予定を作成するときの初期値です。" icon="clock" scope="本社">
        <div className="settings-fields-grid"><SettingsField label="標準の勤務開始" type="time" value={values.start} onChange={(value) => update('start', value)} /><SettingsField label="標準の勤務終了" type="time" value={values.end} onChange={(value) => update('end', value)} /><SettingsSelect label="標準の休憩時間" value={values.breakMinutes} onChange={(value) => update('breakMinutes', value)} options={[{ value: '0', label: '0分' }, { value: '30', label: '30分' }, { value: '60', label: '60分' }, { value: '90', label: '90分' }]} hint="現場ごとに勤務予定を調整できます" /><SettingsSelect label="勤務実績の表示単位" value={values.workUnit} onChange={(value) => update('workUnit', value)} options={[{ value: '1', label: '1分単位（丸めなし）' }, { value: '5', label: '5分単位' }, { value: '15', label: '15分単位' }]} /></div>
        <div className="settings-default-preview"><span><Icon name="calendar" size={16} />初期値のプレビュー</span><strong>{values.start || '—'}<span>〜</span>{values.end || '—'}</strong><small>休憩 {values.breakMinutes}分</small></div>
      </SettingsCard>
      <SettingsCard title="上番・下番の確認" description="未報告の勤怠を確認するタイミングを設定します。" icon="activity" scope="本社">
        <div className="settings-fields-grid"><SettingsSelect label="上番確認のタイミング" value={values.checkInReminder} onChange={(value) => update('checkInReminder', value)} options={[{ value: '0', label: '勤務開始時刻' }, { value: '10', label: '勤務開始の10分前' }, { value: '15', label: '勤務開始の15分前' }, { value: '30', label: '勤務開始の30分前' }]} /><SettingsSelect label="下番未報告を確認するタイミング" value={values.checkOutReminder} onChange={(value) => update('checkOutReminder', value)} options={[{ value: '15', label: '勤務終了から15分後' }, { value: '30', label: '勤務終了から30分後' }, { value: '60', label: '勤務終了から60分後' }]} /></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />設定したタイミングは「通知設定」の上番・下番通知に使用します。</p>
      </SettingsCard>
      <SettingsCard title="管制画面の表示" description="日々の配置・勤怠で確認したい情報を選びます。" icon="dashboard" scope="本社"><div className="settings-toggle-list"><SettingsToggle label="配置不足の現場を強調表示" description="必要人数に対して隊員が不足している現場を目立たせます。" checked={values.showShortages} onChange={(value) => update('showShortages', value)} /><SettingsToggle label="夜勤の下番時刻に「翌日」を表示" description="日をまたぐ勤務予定・打刻を区別しやすくします。" checked={values.showNextDay} onChange={(value) => update('showNextDay', value)} /></div></SettingsCard>
    </>
  );
}

function NotificationSettings({ values, onChange }: { values: NotificationValues; onChange: (values: NotificationValues) => void }) {
  const update = <K extends keyof NotificationValues>(key: K, value: NotificationValues[K]) => onChange({ ...values, [key]: value });
  return (
    <>
      <SettingsCard title="通知する内容" description="本社の管制担当者が確認する業務通知を選びます。" icon="bell" scope="本社"><div className="settings-toggle-list"><SettingsToggle icon="user-plus" label="配置不足" description="必要人数を満たしていない現場をお知らせします。" checked={values.shortage} onChange={(value) => update('shortage', value)} /><SettingsToggle icon="clock" label="上番報告の確認" description="設定した確認時刻になっても上番報告がない隊員をお知らせします。" checked={values.checkIn} onChange={(value) => update('checkIn', value)} /><SettingsToggle icon="activity" label="下番報告の未登録" description="勤務終了後、設定した時間を過ぎても下番報告がない場合に通知します。" checked={values.checkOut} onChange={(value) => update('checkOut', value)} /><SettingsToggle icon="shield" label="教育予定の未登録" description="教育予定が登録されていない在籍隊員をお知らせします。" checked={values.education} onChange={(value) => update('education', value)} /></div></SettingsCard>
      <SettingsCard title="通知の受け取り方法" description="業務通知を確認する場所と宛先を設定します。" icon="message" scope="本社"><div className="settings-toggle-list"><SettingsToggle label="アプリ内のお知らせ" description="画面右上の通知アイコンから確認できます。" checked={values.inApp} onChange={(value) => update('inApp', value)} /><SettingsToggle label="メール通知" description="指定した管制窓口のメールアドレスで受け取ります。" checked={values.email} onChange={(value) => update('email', value)} /></div><div className="settings-fields-grid settings-recipient-field"><SettingsField label="通知先メールアドレス" type="email" value={values.recipient} onChange={(value) => update('recipient', value)} hint="本社の管制窓口に使用する宛先" wide /></div></SettingsCard>
      <div className="settings-notification-preview"><span className="settings-preview-icon"><Icon name="bell" size={19} /></span><div><span>通知の表示例</span><strong>下番報告が未登録です</strong><p>新宿西口 道路舗装工事 / 中村 誠</p></div><small>サンプル</small></div>
    </>
  );
}

function MemberSettings() {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const members = settingsMembers.filter((member) => (roleFilter === 'all' || member.role === roleFilter) && normalizeSearch(`${member.name} ${member.email}`).includes(normalizeSearch(query)));
  const roles = ['admin', 'operator', 'viewer', 'guard'] satisfies MemberRole[];
  return (
    <>
      <SettingsCard title="利用者一覧" description="Googleでログインするアプリ利用者の所属・役割・隊員対応を確認します。" icon="users" scope="会社管理者向け" action={<button type="button" className="secondary-button settings-invite-button" title="アプリ利用者の招待は表示のみです"><Icon name="user-plus" size={14} />利用者を招待（表示のみ）</button>}>
        <div className="settings-member-toolbar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="利用者名・メールアドレスで検索" value={query} placeholder="利用者名・メールアドレスで検索" onChange={(event) => setQuery(event.target.value)} /></label><label className="settings-member-filter"><select aria-label="利用者の権限で絞り込み" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">すべての権限</option>{Object.entries(memberRoles).map(([id, role]) => <option key={id} value={id}>{role.label}</option>)}</select><Icon name="chevron-down" size={13} /></label></div>
        <p className="table-scroll-hint">左右にスクロールして権限・状態を確認できます<Icon name="arrow-right" size={12} /></p>
        <div className="settings-table-scroll"><table className="settings-member-table"><thead><tr><th scope="col">利用者名 / Google連携・招待先メール</th><th scope="col">役割</th><th scope="col">所属拠点 / 閲覧範囲</th><th scope="col">隊員対応</th><th scope="col">アプリ利用状態</th><th scope="col"><span className="sr-only">編集</span></th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><th scope="row"><div className="settings-member-name"><PersonAvatar name={member.name} color={member.role === 'admin' ? 'violet' : member.role === 'viewer' ? 'slate' : member.role === 'guard' ? 'teal' : 'blue'} /><div><strong>{member.name}{member.current && <small>自分</small>}</strong><span>{member.email}</span></div></div></th><td><span className={`settings-role role-${memberRoles[member.role].color}`}>{memberRoles[member.role].label}</span></td><td className="settings-member-scope"><strong>本社（本店） / {member.branchId}</strong><span>{member.scope}</span></td><td className="settings-member-scope">{member.officerId ? <a href={`/officers?officer=${member.officerId}`}>{member.officerId}</a> : '—'}</td><td><StatusBadge label={member.status === 'active' ? '利用中' : member.status === 'stopped' ? 'アプリ利用停止' : '招待準備の例'} tone={member.status === 'active' ? 'green' : member.status === 'stopped' ? 'gray' : 'amber'} /></td><td><button type="button" className="icon-button" aria-label={`${member.name}の所属・役割・アプリ利用停止を確認（表示のみ）`}><Icon name="more" size={17} /></button></td></tr>)}{members.length === 0 && <tr><td colSpan={6} className="settings-member-empty">条件に一致する利用者がいません。<button type="button" onClick={() => { setQuery(''); setRoleFilter('all'); }}>条件をクリア</button></td></tr>}</tbody></table></div>
        <div className="settings-members-count"><span>{members.length}名を表示 / サンプル {settingsMembers.length}名</span><span>招待準備 1名 · アプリ利用停止 1名</span></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />初回は1利用者につき1社・1所属拠点・1役割。警備員役割は同じ会社・拠点の隊員と対応付けます。Google連携・招待先メールと隊員の業務連絡先は別の項目です。メールは架空の表示例で、実際のGoogleアカウントではありません。</p>
      </SettingsCard>
      <SettingsCard title="利用者の招待・所属と役割の変更" description="会社管理者がアプリの利用許可を設定する表示例です。Googleアカウントの作成・停止は行いません。招待メールも送信されません。" icon="user-plus" scope="表示のみ">
        <div className="settings-fields-grid"><SettingsField label="利用者名" value="田中 和也" readOnly /><SettingsField label="Googleアカウントの招待先メール" value="g004-login@example.invalid" type="email" readOnly hint="本人が利用するGoogleアカウントの宛先を確認する想定" /><SettingsField label="所属会社・拠点" value="東京セキュリティ / 本社（B001）" readOnly /><SettingsField label="役割" value="警備員" readOnly hint="会社管理者・管制担当・閲覧者・警備員から1つ" /><SettingsField label="対応する隊員" value="G004 / 田中 和也" readOnly hint="警備員役割で必須。本人による対応先の変更は不可" /><SettingsField label="招待・変更・アプリ利用停止の理由" value="入社・担当業務の変更等の確認内容" readOnly /></div>
        <div className="settings-member-actions"><button type="button" className="secondary-button" title="アプリ利用者の招待は表示のみです">招待（表示のみ）</button><button type="button" className="secondary-button" title="所属・役割の変更は表示のみです">所属・役割変更（表示のみ）</button><button type="button" className="secondary-button settings-stop-button" title="アプリ利用停止は表示のみです">アプリ利用停止（表示のみ）</button></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />招待は発行から7日間有効です。再招待すると古い招待を無効にします。Google連携の変更は本人確認と会社管理者の承認が必要で、管理者本人の変更は別の管理者、ほかに管理者がいない場合は運営者へ依頼します。古い連携・全アプリセッションを失効し、新しい招待で連携します。現在は表示のみです。</p>
        <div className="settings-impact-note"><strong>変更時に確認すること</strong><p>アプリ利用停止・所属変更・権限縮小後は、ログイン中の端末にも次の操作から反映する想定です。最後の有効な会社管理者の停止・降格はできません。退職時はアプリの利用を停止して業務履歴を残し、本人のGoogleアカウントには影響しません。</p><span>招待先の本人確認・初回Google連携が必要です。パスワード・二段階認証・回復はGoogle側で管理します。Google認証・招待・権限制御は未実装です。</span></div>
      </SettingsCard>
      <SettingsCard title="4役割と項目ごとの権限案" description="基本の役割・範囲は確認済み。公開項目や期間などの詳細は要件書の案です。" icon="shield" scope="権限制御は未実装"><div className="settings-role-cards">{Object.entries(memberRoles).map(([id, role]) => <div key={id}><span className={`settings-role role-${role.color}`}>{role.label}</span><p>{role.description}</p></div>)}</div><p className="table-scroll-hint">左右にスクロールして4役割の範囲を確認できます<Icon name="arrow-right" size={12} /></p><div className="settings-table-scroll"><table className="settings-permission-table"><thead><tr><th scope="col">情報・操作</th>{roles.map((id) => <th scope="col" key={id}>{memberRoles[id].label}</th>)}</tr></thead><tbody>{permissionExamples.map((permission) => <tr key={permission.label}><th scope="row">{permission.label}</th>{roles.map((role) => <td key={role} className={permission[role] === '不可' || permission[role] === '初回対象外' || permission[role] === '次期に定義' ? 'is-unavailable' : permission[role] === '管理' || permission[role].startsWith('可') || permission[role] === '勤務開始前のみ' ? 'is-editable' : 'is-view-only'}>{permission[role]}</td>)}</tr>)}</tbody></table></div><p className="settings-card-footnote"><Icon name="help" size={13} />閲覧者は隊員番号・氏名・在籍状態・資格概要まで。詳細連絡先・資格確認情報・内部メモは公開しない案です。警備員の現場情報は勤務時間・集合場所・指示・業務連絡先に限り、他隊員一覧や契約・単価は含めません。</p><p className="settings-card-footnote"><Icon name="help" size={13} />担当現場の詳細公開期間は「確定後〜予定終了、取消・担当解除後は非公開」の案で、詳細は確認前です。Google連携の確認・アプリからのログアウトは4役割共通。Googleのセキュリティ設定はGoogle公式画面で管理します。履歴にも会社・拠点・本人・項目の制限を適用する想定です。</p></SettingsCard>
    </>
  );
}

export default function SettingsPage() {
  const requestedSection = new URLSearchParams(window.location.search).get('section');
  const [section, setSection] = useState<SettingsSection>(settingsSections.find((item) => item.id === requestedSection)?.id ?? 'company');
  const [company, setCompany] = useState({ ...companyDefaults });
  const [operations, setOperations] = useState({ ...operationDefaults });
  const [notifications, setNotifications] = useState({ ...notificationDefaults });
  const currentSection = settingsSections.find((item) => item.id === section)!;
  const futureSection = section === 'operations' || section === 'notifications';
  const activeSectionButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      activeSectionButton.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [section]);

  function selectSection(id: SettingsSection) {
    setSection(id);
    const url = new URL(window.location.href);
    url.searchParams.set('section', id);
    window.history.replaceState(null, '', url);
  }
  function resetSection() {
    if (section === 'company') setCompany({ ...companyDefaults });
    else if (section === 'operations') setOperations({ ...operationDefaults });
    else if (section === 'notifications') setNotifications({ ...notificationDefaults });
  }

  return (
    <main className="dashboard settings-page">
      <div className="page-heading settings-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />WORKSPACE SETTINGS</div><h1>設定</h1><p>本店・支店、隊員の登録枠、個人別の利用者を確認します。</p></div><span className="settings-heading-scope"><Icon name="building" size={14} />東京セキュリティ<span>/</span>本社（本店）</span></div>
      <div className="settings-context-bar"><span className="settings-context-icon"><Icon name="settings" size={20} /></span><div><strong>東京セキュリティのワークスペース</strong><span>初回の範囲: 会社・拠点・登録枠・利用者と4役割。管制・勤怠、通知は次期の案です。</span></div><span className="settings-context-id">TEN-001<span className="settings-separator">·</span>本店 B001</span></div>
      <div className="settings-workspace">
        <aside className="settings-navigation-column"><nav aria-label="設定カテゴリ" className="settings-section-nav"><span className="settings-nav-caption">設定メニュー</span>{settingsSections.map((item) => <button type="button" key={item.id} ref={section === item.id ? activeSectionButton : undefined} className={section === item.id ? 'is-selected' : ''} aria-pressed={section === item.id} onClick={() => selectSection(item.id)}><Icon name={item.icon} size={18} /><span><strong>{item.label}{(item.id === 'operations' || item.id === 'notifications') && <span className="settings-future-badge">次期</span>}</strong><small>{item.description}</small></span><Icon name="chevron-right" size={13} /></button>)}</nav><div className="settings-target-card"><span><Icon name="building" size={15} />現在の設定対象</span><strong>東京セキュリティ</strong><p>{currentSection.scope === '会社共通' ? '自社の会社・拠点・利用者の表示例' : '本社向けの次期設定案'}</p><span className="settings-scope-badge">{currentSection.scope}</span></div><div className="settings-navigation-note"><Icon name="help" size={14} /><p>現場ごとの勤務時間や配置条件は「現場管理」で確認できます。</p><a href="/sites">現場管理を開く<Icon name="arrow-up-right" size={12} /></a></div></aside>
        <div className="settings-content" id="settings-content"><div className="settings-section-heading"><div><h2>{currentSection.label}</h2><p>{currentSection.description}</p></div><span className="settings-scope-badge">{currentSection.scope}</span></div>
          {futureSection && <div className="settings-stage-note"><Icon name="help" size={17} /><div><strong>次期のモック / 初回の実装範囲外</strong><p>{section === 'operations' ? '勤務時間・休憩・丸め・打刻確認の設定案です。正式な勤怠ルールは別途確認します。' : '配信方法や通知条件の表示案です。初回の確定・変更・取消の連絡は既存の連絡手段で行う想定です。'} 入力を変えても他の画面や通知には反映されません。</p></div></div>}
          {section === 'company' && <CompanySettings values={company} onChange={setCompany} />}
          {section === 'operations' && <OperationSettings values={operations} onChange={setOperations} />}
          {section === 'notifications' && <NotificationSettings values={notifications} onChange={setNotifications} />}
          {section === 'members' && <MemberSettings />}
          {section !== 'members' && <div className="settings-save-bar"><span><Icon name="help" size={13} />画面確認用です。変更内容は保存されません。</span><div><button type="button" className="secondary-button" onClick={resetSection}>元に戻す</button><button type="button" className="primary-button" title="設定の保存は表示サンプルです"><Icon name="check" size={16} />変更を保存</button></div></div>}
        </div>
      </div>
      <footer className="dashboard-footer"><span>日々の管制を、自社に合った使い方へ。</span><span>KEIBI<span className="footer-dot">·</span>会社・利用者・設定値は架空のサンプルです</span></footer>
    </main>
  );
}
