// All records are fictional and scoped to the company shown in this visual mock.
export const dashboardDate = { iso: '2026-10-04', label: '2026年10月4日（日）' };

type Site = {
  id: string;
  name: string;
  client: string;
  type: 'traffic' | 'facility' | 'event';
  category: string;
  hours: string;
  shift: string;
  required: number;
  assigned: number;
  working: number;
};

export const sites: Site[] = [
  { id: 'S001', name: '渋谷駅前 再開発工事', client: '東都建設株式会社', type: 'traffic', category: '交通誘導', hours: '08:00 − 17:00', shift: '日勤', required: 4, assigned: 3, working: 3 },
  { id: 'S002', name: '新宿西口 道路舗装工事', client: '株式会社山田土木', type: 'traffic', category: '交通誘導', hours: '09:00 − 18:00', shift: '日勤', required: 3, assigned: 2, working: 2 },
  { id: 'S003', name: '品川物流センター', client: '日本ロジスティクス株式会社', type: 'facility', category: '施設警備', hours: '08:00 − 20:00', shift: '日勤', required: 4, assigned: 4, working: 4 },
  { id: 'S004', name: '大手町オフィスビル', client: '丸の内ビル管理株式会社', type: 'facility', category: '施設警備', hours: '09:00 − 18:00', shift: '日勤', required: 3, assigned: 3, working: 3 },
  { id: 'S005', name: '世田谷区 水道管更新工事', client: '東京設備工業株式会社', type: 'traffic', category: '交通誘導', hours: '08:30 − 17:30', shift: '日勤', required: 4, assigned: 3, working: 3 },
  { id: 'S006', name: '代々木公園 秋のイベント', client: '株式会社エリア企画', type: 'event', category: '雑踏警備', hours: '09:00 − 19:00', shift: '日勤', required: 5, assigned: 5, working: 5 },
  { id: 'S007', name: '銀座商業施設', client: '銀座ビルサービス株式会社', type: 'facility', category: '施設警備', hours: '09:00 − 18:00', shift: '日勤', required: 4, assigned: 4, working: 4 },
  { id: 'S008', name: '港区 歩道整備工事', client: '株式会社山田土木', type: 'traffic', category: '交通誘導', hours: '08:00 − 17:00', shift: '日勤', required: 3, assigned: 3, working: 3 },
  { id: 'S009', name: '豊洲マンション', client: '豊洲管理サービス株式会社', type: 'facility', category: '施設警備', hours: '08:00 − 17:00', shift: '日勤', required: 2, assigned: 2, working: 2 },
  { id: 'S010', name: '新宿ビル 設備点検', client: '丸の内ビル管理株式会社', type: 'facility', category: '施設警備', hours: '20:00 − 翌05:00', shift: '夜勤', required: 1, assigned: 1, working: 0 },
  { id: 'S011', name: '池袋駅前 夜間工事', client: '東都建設株式会社', type: 'traffic', category: '交通誘導', hours: '21:00 − 翌06:00', shift: '夜勤', required: 1, assigned: 1, working: 0 },
  { id: 'S012', name: '秋葉原 商業施設巡回', client: '銀座ビルサービス株式会社', type: 'facility', category: '施設警備', hours: '06:00 − 09:00', shift: '早朝', required: 1, assigned: 1, working: 0 },
];

export const notices = [
  { id: 'N001', category: '現場連絡', categoryColor: 'blue', time: '09:15', title: '渋谷駅前：集合場所の変更', description: '明日より東口の仮設事務所前に変更します。', unread: true },
  { id: 'N002', category: '隊員連絡', categoryColor: 'amber', time: '08:40', title: '鈴木 一郎さん：明日の休暇希望', description: '10/5（月）の配置調整をお願いします。', unread: true },
  { id: 'N003', category: '社内共有', categoryColor: 'gray', time: '昨日', title: '10月の安全教育について', description: '受講予定を隊員ごとにご確認ください。', unread: false },
];

export const weeklyAssignments = [
  { date: '10/4', weekday: '日', assigned: 32, required: 35 },
  { date: '10/5', weekday: '月', assigned: 35, required: 38 },
  { date: '10/6', weekday: '火', assigned: 36, required: 36 },
  { date: '10/7', weekday: '水', assigned: 37, required: 40 },
  { date: '10/8', weekday: '木', assigned: 37, required: 37 },
  { date: '10/9', weekday: '金', assigned: 30, required: 32 },
  { date: '10/10', weekday: '土', assigned: 24, required: 24 },
];
