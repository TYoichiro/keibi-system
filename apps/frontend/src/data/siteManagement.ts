import { sites } from './dashboard';
import { siteDetails } from './assignments';

export type SiteStatus = 'active' | 'planned' | 'paused' | 'closed';

export const siteStatuses: Record<SiteStatus, { label: string; color: string }> = {
  active: { label: '稼働中', color: 'green' },
  planned: { label: '準備中', color: 'blue' },
  paused: { label: '休止中', color: 'amber' },
  closed: { label: '終了', color: 'gray' },
};

type SiteBase = Pick<(typeof sites)[number], 'id' | 'name' | 'client' | 'type' | 'category' | 'hours' | 'shift' | 'required'>;

export type ManagedSite = SiteBase & {
  status: SiteStatus;
  address: string;
  contractStart: string;
  contractEnd: string;
  renewalReview: boolean;
  contact: string;
  phone: string;
  meeting: string;
  condition: string;
  note: string;
};

// Fictional site records. Active sites share IDs and shift conditions with the other screens.
const activeSiteMetadata: Record<string, { address: string; start: string; end: string; contact: string; renewal?: boolean }> = {
  S001: { address: '東京都渋谷区渋谷2丁目', start: '2026-04-01', end: '2026-10-31', contact: '小川 健太', renewal: true },
  S002: { address: '東京都新宿区西新宿1丁目', start: '2026-07-01', end: '2026-10-31', contact: '青木 裕介', renewal: true },
  S003: { address: '東京都品川区八潮3丁目', start: '2026-04-01', end: '2027-03-31', contact: '中島 直人' },
  S004: { address: '東京都千代田区大手町1丁目', start: '2026-04-01', end: '2027-03-31', contact: '大塚 誠' },
  S005: { address: '東京都世田谷区三軒茶屋2丁目', start: '2026-09-01', end: '2026-12-25', contact: '井田 修一' },
  S006: { address: '東京都渋谷区代々木神園町', start: '2026-10-03', end: '2026-10-04', contact: '川村 翔' },
  S007: { address: '東京都中央区銀座4丁目', start: '2026-04-01', end: '2027-03-31', contact: '石田 大輔' },
  S008: { address: '東京都港区芝3丁目', start: '2026-09-15', end: '2026-11-30', contact: '安藤 拓也' },
  S009: { address: '東京都江東区豊洲3丁目', start: '2026-04-01', end: '2027-03-31', contact: '竹内 和也' },
  S010: { address: '東京都新宿区新宿3丁目', start: '2026-10-01', end: '2026-11-15', contact: '大塚 誠' },
  S011: { address: '東京都豊島区西池袋1丁目', start: '2026-10-01', end: '2026-12-20', contact: '小川 健太' },
  S012: { address: '東京都千代田区外神田1丁目', start: '2026-04-01', end: '2027-03-31', contact: '石田 大輔' },
};

const activeSites: ManagedSite[] = sites.map((site, index) => {
  const metadata = activeSiteMetadata[site.id];
  const details = siteDetails[site.id];
  return {
    ...site,
    status: 'active',
    address: metadata.address,
    contractStart: metadata.start,
    contractEnd: metadata.end,
    renewalReview: metadata.renewal ?? false,
    contact: metadata.contact,
    phone: `03-0000-${String(index + 1).padStart(4, '0')}`,
    meeting: details?.meeting ?? '現場の管理事務所前',
    condition: details?.condition ?? '上番前に業務内容と配置位置を確認',
    note: details?.note ?? '初回勤務の隊員には、集合場所と現場の注意事項を事前に共有してください。',
  };
});

export const managedSites: ManagedSite[] = [
  ...activeSites,
  { id: 'S013', name: '目黒駅前 歩道整備工事', client: '株式会社山田土木', type: 'traffic', category: '交通誘導', hours: '08:00 − 17:00', shift: '日勤', required: 3, status: 'planned', address: '東京都品川区上大崎2丁目', contractStart: '2026-10-12', contractEnd: '2026-12-25', renewalReview: false, contact: '青木 裕介', phone: '03-0000-0013', meeting: '目黒駅東口 工事事務所前', condition: '交通誘導2級保有者を1名含む', note: '10月12日の開始に向けて、配置計画と隊員への事前説明を準備してください。' },
  { id: 'S014', name: '豊洲オフィスビル 新館', client: '丸の内ビル管理株式会社', type: 'facility', category: '施設警備', hours: '09:00 − 18:00', shift: '日勤', required: 2, status: 'planned', address: '東京都江東区豊洲5丁目', contractStart: '2026-10-15', contractEnd: '2027-03-31', renewalReview: false, contact: '大塚 誠', phone: '03-0000-0014', meeting: '新館1階 防災センター', condition: '施設の入退館手順を事前に確認', note: '新館の開業に合わせて警備開始予定です。鍵と入館証の受け渡しを確認してください。' },
  { id: 'S015', name: '中野区 公共施設', client: '豊洲管理サービス株式会社', type: 'facility', category: '施設警備', hours: '08:00 − 17:00', shift: '日勤', required: 2, status: 'paused', address: '東京都中野区中野4丁目', contractStart: '2026-09-01', contractEnd: '2027-03-31', renewalReview: false, contact: '竹内 和也', phone: '03-0000-0015', meeting: '正面入口 管理室前', condition: '再開時に最新の業務指示を確認', note: '施設の改修に伴い9月30日から一時休止中です。再開日は取引先へ確認してください。' },
  { id: 'S016', name: '池袋商業施設 改修工事', client: '東都建設株式会社', type: 'traffic', category: '交通誘導', hours: '08:00 − 17:00', shift: '日勤', required: 2, status: 'closed', address: '東京都豊島区南池袋1丁目', contractStart: '2026-06-01', contractEnd: '2026-09-30', renewalReview: false, contact: '小川 健太', phone: '03-0000-0016', meeting: '南側 工事車両入口', condition: '契約終了のため新規の配置なし', note: '9月30日に契約終了。現場備品の返却と最終報告の確認が完了しています。' },
];

export function formatSiteDate(date: string) {
  return date.replaceAll('-', '/');
}
