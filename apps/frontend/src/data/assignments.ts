import { sites } from './dashboard';

export type AssignedOfficer = {
  id: string;
  name: string;
  leader: boolean;
};

export type AvailableOfficer = {
  id: string;
  name: string;
  employment: string;
  qualification?: string;
  hours: string;
  area: string;
  color: string;
};

// Fictional placements for the same date and company as the dashboard.
const assignedNames = [
  '佐藤 健一', '高橋 直樹', '山本 浩二', '田中 和也', '中村 誠',
  '伊藤 修', '渡辺 正人', '小林 俊介', '加藤 大輔', '吉田 隆',
  '山田 修一', '斎藤 誠', '松本 和也', '井上 健', '木村 剛',
  '林 達也', '清水 博', '山崎 一', '森 直人', '池田 和彦',
  '橋本 亮', '石川 徹', '阿部 裕介', '前田 聡', '藤田 淳',
  '岡田 真也', '後藤 茂', '長谷川 毅', '村上 悟', '近藤 達也',
  '石井 浩', '遠藤 洋',
];

export const placements = sites.map((site, index) => {
  const offset = sites.slice(0, index).reduce((total, previousSite) => total + previousSite.assigned, 0);
  const officers: AssignedOfficer[] = assignedNames.slice(offset, offset + site.assigned).map((name, officerIndex) => ({
    id: `G${String(offset + officerIndex + 1).padStart(3, '0')}`,
    name,
    leader: officerIndex === 0,
  }));

  return { ...site, officers };
});

export type Placement = (typeof placements)[number];

export const availableOfficers: AvailableOfficer[] = [
  { id: 'G033', name: '鈴木 一郎', employment: '常勤', qualification: '交通誘導2級', hours: '08:00 − 18:00', area: '渋谷・新宿エリア', color: 'teal' },
  { id: 'G034', name: '三浦 翔太', employment: '非常勤', hours: '08:00 − 17:00', area: '世田谷・渋谷エリア', color: 'blue' },
  { id: 'G035', name: '福田 健', employment: '常勤', qualification: '交通誘導2級', hours: '08:00 − 18:00', area: '新宿・中野エリア', color: 'violet' },
  { id: 'G036', name: '坂本 裕二', employment: '常勤', qualification: '施設警備2級', hours: '09:00 − 20:00', area: '品川・港エリア', color: 'amber' },
  { id: 'G037', name: '西村 亮', employment: '非常勤', hours: '08:00 − 18:00', area: '世田谷・目黒エリア', color: 'slate' },
];

export const siteDetails: Record<string, { meeting: string; contact: string; note: string; condition?: string }> = {
  S001: { meeting: '渋谷駅東口 仮設事務所前', contact: '現場担当：小川さん', condition: '交通誘導2級保有者を1名含む', note: '歩行者の通行が多いため、朝の打ち合わせで誘導位置を確認してください。' },
  S002: { meeting: '新宿駅西口 工事車両入口', contact: '現場担当：青木さん', condition: '交通誘導2級保有者を1名含む', note: '車両の出入り時は歩行者の安全確認を優先してください。' },
  S005: { meeting: '現場北側 資材置き場前', contact: '現場担当：井田さん', condition: '交通誘導2級保有者を1名含む', note: '周辺住民への声かけと、作業車両の誘導をお願いします。' },
};

export function getSiteDetails(site: Placement) {
  return siteDetails[site.id] ?? {
    meeting: '現場の管理事務所前',
    contact: '現場担当者へ確認',
    note: '上番前に集合場所と業務内容を確認してください。',
  };
}
