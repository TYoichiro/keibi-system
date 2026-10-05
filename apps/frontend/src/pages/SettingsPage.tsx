import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { PersonAvatar, StatusBadge } from '../components/ManagementUI';
import { officers, normalizeSearch } from '../data/personnel';
import { companyDefaults, memberRoles, notificationDefaults, operationDefaults, permissionExamples, settingsMembers, settingsSections } from '../data/settings';
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
  return (
    <>
      <SettingsCard title="会社の基本情報" description="会社名や連絡先など、ワークスペースの基本情報を確認します。" icon="building" scope="会社共通">
        <div className="settings-company-profile"><span className="settings-company-mark"><Icon name="shield" size={25} /></span><div><strong>{values.displayName || '会社の表示名'}</strong><span>KEIBI クラウド管制システム</span></div><span className="settings-tenant-code">会社ID<span>TEN-001</span></span></div>
        <div className="settings-fields-grid"><SettingsField label="会社名" value={values.name} onChange={update('name')} required /><SettingsField label="表示名" value={values.displayName} onChange={update('displayName')} required hint="メニューや画面に表示する名称" /><SettingsField label="代表電話番号" type="tel" value={values.phone} onChange={update('phone')} /><SettingsField label="代表メールアドレス" type="email" value={values.email} onChange={update('email')} /><SettingsField label="郵便番号" value={values.postalCode} onChange={update('postalCode')} /><SettingsField label="担当者" value={values.contact} onChange={update('contact')} /><SettingsField label="所在地" value={values.address} onChange={update('address')} wide /></div>
      </SettingsCard>
      <SettingsCard title="拠点情報" description="隊員や現場を管理する所属拠点を確認します。" icon="map-pin" scope="会社共通" action={<button type="button" className="text-button settings-card-action" title="拠点追加は表示サンプルです"><Icon name="plus" size={14} />拠点を追加</button>}>
        <div className="settings-branch-card"><span className="settings-branch-icon"><Icon name="building" size={21} /></span><div><strong>{values.branchName || '拠点名'}<span>拠点ID B001</span></strong><p>{values.address || '所在地未入力'}</p><span>在籍隊員 {activeCount}名<span className="settings-separator">·</span>利用者 {settingsMembers.filter((member) => member.status === 'active').length}名</span></div><StatusBadge label="利用中" tone="green" /></div>
        <div className="settings-fields-grid settings-branch-fields"><SettingsField label="拠点名" value={values.branchName} onChange={update('branchName')} required /><SettingsField label="拠点コード" value="B001" readOnly hint="隊員・現場の所属拠点を識別するコード" /></div>
        <p className="settings-card-footnote"><Icon name="help" size={13} />現場や隊員の登録時は、この拠点を所属先として選択します。</p>
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
  return (
    <>
      <SettingsCard title="利用者一覧" description="管制システムを利用するアカウントと所属範囲を確認します。" icon="users" scope="会社共通" action={<button type="button" className="secondary-button settings-invite-button" title="利用者の招待は表示サンプルです"><Icon name="user-plus" size={14} />利用者を招待</button>}>
        <div className="settings-member-toolbar"><label className="site-search"><Icon name="search" size={15} /><input aria-label="利用者名・メールアドレスで検索" value={query} placeholder="利用者名・メールアドレスで検索" onChange={(event) => setQuery(event.target.value)} /></label><label className="settings-member-filter"><select aria-label="利用者の権限で絞り込み" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">すべての権限</option>{Object.entries(memberRoles).map(([id, role]) => <option key={id} value={id}>{role.label}</option>)}</select><Icon name="chevron-down" size={13} /></label></div>
        <p className="table-scroll-hint">左右にスクロールして権限・状態を確認できます<Icon name="arrow-right" size={12} /></p>
        <div className="settings-table-scroll"><table className="settings-member-table"><thead><tr><th scope="col">利用者名 / メールアドレス</th><th scope="col">権限</th><th scope="col">所属範囲</th><th scope="col">状態</th><th scope="col"><span className="sr-only">編集</span></th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><th scope="row"><div className="settings-member-name"><PersonAvatar name={member.name} color={member.role === 'admin' ? 'violet' : member.role === 'viewer' ? 'slate' : 'blue'} /><div><strong>{member.name}{member.current && <small>自分</small>}</strong><span>{member.email}</span></div></div></th><td><span className={`settings-role role-${memberRoles[member.role].color}`}>{memberRoles[member.role].label}</span></td><td className="settings-member-scope">{member.scope}</td><td><StatusBadge label={member.status === 'active' ? '利用中' : '招待中'} tone={member.status === 'active' ? 'green' : 'amber'} /></td><td><button type="button" className="icon-button" aria-label={`${member.name}の利用者情報を編集（表示サンプル）`}><Icon name="more" size={17} /></button></td></tr>)}{members.length === 0 && <tr><td colSpan={5} className="settings-member-empty">条件に一致する利用者がいません。<button type="button" onClick={() => { setQuery(''); setRoleFilter('all'); }}>条件をクリア</button></td></tr>}</tbody></table></div>
        <div className="settings-members-count"><span>{members.length}名を表示 / 登録 {settingsMembers.length}名</span><span>招待中 {settingsMembers.filter((member) => member.status === 'invited').length}名</span></div>
      </SettingsCard>
      <SettingsCard title="権限の表示例" description="役割ごとの管理・編集・閲覧範囲を確認します。" icon="shield" scope="会社共通"><div className="settings-role-cards">{Object.entries(memberRoles).map(([id, role]) => <div key={id}><span className={`settings-role role-${role.color}`}>{role.label}</span><p>{role.description}</p></div>)}</div><p className="table-scroll-hint">左右にスクロールして権限の範囲を確認できます<Icon name="arrow-right" size={12} /></p><div className="settings-table-scroll"><table className="settings-permission-table"><thead><tr><th scope="col">管理する情報</th>{Object.values(memberRoles).map((role) => <th scope="col" key={role.label}>{role.label}</th>)}</tr></thead><tbody>{permissionExamples.map((permission) => <tr key={permission.label}><th scope="row">{permission.label}</th>{(['admin', 'operator', 'viewer'] satisfies MemberRole[]).map((role) => <td key={role} className={permission[role] === '利用不可' ? 'is-unavailable' : permission[role] === '閲覧のみ' ? 'is-view-only' : 'is-editable'}>{permission[role] !== '利用不可' && <Icon name={permission[role] === '閲覧のみ' ? 'users' : 'check'} size={12} />}{permission[role]}</td>)}</tr>)}</tbody></table></div><p className="settings-card-footnote"><Icon name="help" size={13} />所属範囲は、利用者が担当する会社・拠点を表します。</p></SettingsCard>
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
      <div className="page-heading settings-page-heading"><div><div className="page-eyebrow"><span className="live-dot" />WORKSPACE SETTINGS</div><h1>設定</h1><p>会社・拠点に合わせて、日々の管制業務を整えます。</p></div><span className="settings-heading-scope"><Icon name="building" size={14} />東京セキュリティ<span>/</span>本社</span></div>
      <div className="settings-context-bar"><span className="settings-context-icon"><Icon name="settings" size={20} /></span><div><strong>東京セキュリティのワークスペース</strong><span>会社情報から、配置・勤怠・通知の設定まで。</span></div><span className="settings-context-id">TEN-001<span className="settings-separator">·</span>本社 B001</span></div>
      <div className="settings-workspace">
        <aside className="settings-navigation-column"><nav aria-label="設定カテゴリ" className="settings-section-nav"><span className="settings-nav-caption">設定メニュー</span>{settingsSections.map((item) => <button type="button" key={item.id} ref={section === item.id ? activeSectionButton : undefined} className={section === item.id ? 'is-selected' : ''} aria-pressed={section === item.id} onClick={() => selectSection(item.id)}><Icon name={item.icon} size={18} /><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="chevron-right" size={13} /></button>)}</nav><div className="settings-target-card"><span><Icon name="building" size={15} />現在の設定対象</span><strong>東京セキュリティ</strong><p>{currentSection.scope === '会社共通' ? '会社に所属する拠点で共通' : '本社の管制業務に適用'}</p><span className="settings-scope-badge">{currentSection.scope}</span></div><div className="settings-navigation-note"><Icon name="help" size={14} /><p>現場ごとの勤務時間や配置条件は「現場管理」で確認できます。</p><a href="/sites">現場管理を開く<Icon name="arrow-up-right" size={12} /></a></div></aside>
        <div className="settings-content" id="settings-content"><div className="settings-section-heading"><div><h2>{currentSection.label}</h2><p>{currentSection.description}</p></div><span className="settings-scope-badge">{currentSection.scope}</span></div>
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
