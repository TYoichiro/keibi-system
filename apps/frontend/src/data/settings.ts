import type { IconName } from '../components/Icon';

export type SettingsSection = 'company' | 'operations' | 'notifications' | 'members';
export const settingsSections: { id: SettingsSection; label: string; description: string; icon: IconName; scope: string }[] = [
  { id: 'company', label: '会社・拠点', description: '基本情報・所属拠点', icon: 'building', scope: '会社共通' },
  { id: 'operations', label: '管制・勤怠', description: '配置・勤務の初期値', icon: 'calendar', scope: '本社' },
  { id: 'notifications', label: '通知設定', description: '確認事項の受け取り', icon: 'bell', scope: '本社' },
  { id: 'members', label: '利用者・権限', description: 'アカウント・役割', icon: 'users', scope: '会社共通' },
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

export type MemberRole = 'admin' | 'operator' | 'viewer';
export const memberRoles = {
  admin: { label: '管理者', color: 'violet', description: '会社情報・利用者を管理' },
  operator: { label: '管制担当', color: 'blue', description: '配置・隊員・勤怠を編集' },
  viewer: { label: '閲覧者', color: 'gray', description: '業務情報を確認' },
} as const;

// Fictional tenant and member records for visual review. No invitations are sent.
export const settingsMembers: { id: string; name: string; email: string; role: MemberRole; status: 'active' | 'invited'; scope: string; current?: boolean }[] = [
  { id: 'U001', name: '佐々木 一', email: 'admin@example.invalid', role: 'admin', status: 'active', scope: '会社全体' },
  { id: 'U002', name: '田中 太郎', email: 'kansei@example.invalid', role: 'operator', status: 'active', scope: '本社', current: true },
  { id: 'U003', name: '山田 花子', email: 'view@example.invalid', role: 'viewer', status: 'active', scope: '本社' },
  { id: 'U004', name: '鈴木 美咲', email: 'invite@example.invalid', role: 'operator', status: 'invited', scope: '本社' },
];

export const permissionExamples = [
  { label: '現場・配置・隊員', admin: '編集可', operator: '編集可', viewer: '閲覧のみ' },
  { label: '勤怠・勤務実績', admin: '編集可', operator: '編集可', viewer: '閲覧のみ' },
  { label: '管制・通知設定', admin: '編集可', operator: '閲覧のみ', viewer: '利用不可' },
  { label: '会社情報・利用者', admin: '管理可', operator: '閲覧のみ', viewer: '利用不可' },
];
