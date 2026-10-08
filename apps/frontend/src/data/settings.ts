import type { IconName } from '../components/Icon';

export type SettingsSection = 'company' | 'operations' | 'notifications' | 'members';
export const settingsSections: { id: SettingsSection; label: string; description: string; icon: IconName; scope: string }[] = [
  { id: 'company', label: '会社・拠点', description: '本店・支店・隊員の登録枠', icon: 'building', scope: '会社共通' },
  { id: 'operations', label: '管制・勤怠', description: '次期の設定案', icon: 'calendar', scope: '本社' },
  { id: 'notifications', label: '通知設定', description: '次期の設定案', icon: 'bell', scope: '本社' },
  { id: 'members', label: '利用者・権限', description: '招待・アプリ利用停止・4役割', icon: 'users', scope: '会社共通' },
];

export const companyDefaults = {
  name: '株式会社東京セキュリティ',
  displayName: '東京セキュリティ',
  postalCode: '150-0000',
  address: '東京都渋谷区サンプル町1-2-3',
  phone: '03-0000-1000',
  email: 'office@example.invalid',
  contact: '田中 太郎',
  branchName: '本社',
};

export const operationDefaults = {
  start: '08:00',
  end: '17:00',
  breakMinutes: '60',
  workUnit: '1',
  checkInReminder: '10',
  checkOutReminder: '30',
  showShortages: true,
  showNextDay: true,
};

export const notificationDefaults = {
  shortage: true,
  checkIn: true,
  checkOut: true,
  education: false,
  inApp: true,
  email: false,
  recipient: 'kansei@example.invalid',
};

// The 40 existing officer samples remain in B001. Its increased limit is a display example.
export const settingsBranches = [
  { id: 'B001', name: '本社', kind: '本店', initialLimit: 10, currentLimit: 50, sample: false },
  { id: 'B002', name: '横浜支店', kind: '支店', initialLimit: 10, currentLimit: 10, sample: true },
] as const;

export type MemberRole = 'admin' | 'operator' | 'viewer' | 'guard';
export const memberRoles = {
  admin: { label: '会社管理者', color: 'violet', description: '自社の全拠点を管理。支店追加・増枠は本店所属のみ' },
  operator: { label: '管制担当', color: 'blue', description: '自社の所属拠点。隊員・現場・配置を登録・更新' },
  viewer: { label: '閲覧者', color: 'gray', description: '自社の所属拠点。許可された業務項目を閲覧' },
  guard: { label: '警備員', color: 'green', description: '本人の確定予定と、担当勤務に必要な現場情報を閲覧' },
} as const;

// Fictional app memberships for visual review. example.invalid addresses are display/invitation samples,
// not real Google identities. No Google accounts, identity links or invitations are created.
export const settingsMembers: { id: string; name: string; email: string; role: MemberRole; status: 'active' | 'pending' | 'stopped'; branchId: string; scope: string; officerId?: string; current?: boolean }[] = [
  { id: 'U001', name: '佐々木 一', email: 'admin@example.invalid', role: 'admin', status: 'active', branchId: 'B001', scope: '自社の全拠点' },
  { id: 'U002', name: '田中 太郎', email: 'kansei@example.invalid', role: 'operator', status: 'active', branchId: 'B001', scope: '所属拠点', current: true },
  { id: 'U003', name: '山田 花子', email: 'view@example.invalid', role: 'viewer', status: 'active', branchId: 'B001', scope: '所属拠点' },
  { id: 'U004', name: '鈴木 美咲', email: 'invite@example.invalid', role: 'operator', status: 'pending', branchId: 'B001', scope: '所属拠点' },
  { id: 'U005', name: '田中 和也', email: 'g004-login@example.invalid', role: 'guard', status: 'active', branchId: 'B001', scope: '本人・担当現場', officerId: 'G004' },
  { id: 'U006', name: '大野 浩', email: 'g040-login@example.invalid', role: 'guard', status: 'stopped', branchId: 'B001', scope: '退職に伴い停止', officerId: 'G040' },
];

export const permissionExamples = [
  { label: 'データの範囲', admin: '自社の全拠点', operator: '所属拠点', viewer: '所属拠点', guard: '本人・担当現場' },
  { label: '会社・所属拠点の名称確認', admin: '閲覧', operator: '閲覧', viewer: '閲覧', guard: '本人の所属のみ閲覧' },
  { label: '会社・本店・初期管理者の作成', admin: '運営者への依頼', operator: '不可', viewer: '不可', guard: '不可' },
  { label: '本店からの支店追加・登録枠増加', admin: '可（本店所属のみ）', operator: '不可', viewer: '不可', guard: '不可' },
  { label: '利用者招待・アプリ利用停止・所属・役割', admin: '管理', operator: '不可', viewer: '不可', guard: '不可' },
  { label: '隊員の基本業務情報', admin: '管理', operator: '管理', viewer: '閲覧', guard: '本人のみ閲覧' },
  { label: '隊員の業務連絡先・資格確認情報', admin: '管理', operator: '管理', viewer: '不可', guard: '本人のみ閲覧' },
  { label: '隊員の管制用内部メモ', admin: '管理', operator: '管理', viewer: '不可', guard: '不可' },
  { label: '会社共通の取引先', admin: '自社を閲覧・編集未決', operator: '関連のみ閲覧・編集未決', viewer: '関連のみ閲覧', guard: '担当勤務の必要項目のみ' },
  { label: '所属拠点の現場情報', admin: '管理', operator: '管理', viewer: '閲覧', guard: '担当勤務の必要項目のみ' },
  { label: '勤務枠・配置の下書き', admin: '管理', operator: '管理', viewer: '閲覧', guard: '不可' },
  { label: '配置の確定・改訂・取消', admin: '可（開始後は理由必須）', operator: '勤務開始前のみ', viewer: '不可', guard: '不可' },
  { label: '確定済み勤務予定', admin: '閲覧', operator: '閲覧', viewer: '閲覧', guard: '本人のみ閲覧' },
  { label: '過去の予定・取消履歴', admin: '閲覧', operator: '閲覧', viewer: '閲覧', guard: '本人の日時・現場名・状態' },
  { label: '隊員・現場・配置の変更履歴', admin: '閲覧', operator: '所属拠点のみ閲覧', viewer: '不可', guard: '本人勤務の公開情報のみ' },
  { label: '利用者・権限の変更履歴', admin: '閲覧', operator: '不可', viewer: '不可', guard: '不可' },
  { label: '他社・許可範囲外のデータ', admin: '不可', operator: '不可', viewer: '不可', guard: '不可' },
  { label: '勤怠・日報・申請・通知設定', admin: '次期に定義', operator: '次期に定義', viewer: '次期に定義', guard: '次期に定義' },
  { label: 'CSV・帳票出力・物理削除', admin: '初回対象外', operator: '初回対象外', viewer: '初回対象外', guard: '初回対象外' },
];
