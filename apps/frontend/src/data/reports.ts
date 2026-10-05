import { notices } from './dashboard';
import { managedSites } from './siteManagement';
import { officers } from './personnel';

export type ReportKind = 'handover' | 'leave' | 'daily' | 'incident';
export type ReportStatus = 'open' | 'checking' | 'done';
export const reportKinds = { handover: '申し送り', leave: '勤務希望', daily: '警備日報', incident: '事故・苦情' } as const;
export const reportStatuses = {
  open: { label: '未対応', tone: 'amber' },
  checking: { label: '確認中', tone: 'blue' },
  done: { label: '対応済み', tone: 'green' },
} as const;
export type Report = {
  id: string; kind: ReportKind; status: ReportStatus; urgent: boolean; title: string;
  date: string; time: string; owner: string; reporter: string; due: string;
  siteId?: string; officerId?: string; body: string; nextAction: string;
  history: { time: string; text: string }[];
};

// Reports share notice IDs so the dashboard can open the same sample content.
export const reports: Report[] = [
  { id: 'N001', kind: 'handover', status: 'open', urgent: false, title: notices[0].title, date: '2026-10-04', time: '09:15', owner: '田中 太郎', reporter: '現場担当 小川 健太', due: '10/4 17:00', siteId: 'S001', body: '10/5（月）より集合場所を東口の仮設事務所前に変更する連絡がありました。配置隊員に前日までに共有してください。', nextAction: '翌日の配置隊員に集合場所を共有し、確認状況を記録する。', history: [{ time: '10/4 09:15', text: '現場担当者からの連絡を受け付け' }] },
  { id: 'N002', kind: 'leave', status: 'open', urgent: false, title: notices[1].title, date: '2026-10-04', time: '08:40', owner: '田中 太郎', reporter: '鈴木 一郎', due: '10/4 17:00', officerId: 'G033', body: '10/5（月）の休暇希望が届いています。翌日の配置調整と隊員への回答内容を確認してください。', nextAction: '勤務希望一覧を確認し、翌日の配置計画を調整する。', history: [{ time: '10/4 08:40', text: '隊員から勤務希望の連絡を受け付け' }] },
  { id: 'N003', kind: 'handover', status: 'done', urgent: false, title: notices[2].title, date: '2026-10-03', time: '16:00', owner: '佐々木 一', reporter: '教育担当', due: '10/3 17:00', body: '10月の教育予定を管制担当者に共有しました。教育予定が未登録の隊員は隊員管理で確認してください。', nextAction: '隊員ごとの教育予定を確認する。', history: [{ time: '10/3 16:00', text: '教育担当が案内を共有' }, { time: '10/3 16:30', text: '管制担当が確認し、共有を完了' }] },
  { id: 'R004', kind: 'incident', status: 'checking', urgent: true, title: '新宿西口：歩行者から誘導へのご意見', date: '2026-10-04', time: '09:05', owner: '田中 太郎', reporter: '田中 和也', due: '10/4 10:00', siteId: 'S002', officerId: 'G004', body: '歩行者から誘導案内が分かりにくいとのご意見がありました。負傷や物損の報告はありません。現場責任者が案内位置を確認しています。', nextAction: '現場責任者に対応結果を確認し、取引先への報告内容を整理する。', history: [{ time: '10/4 09:05', text: '現場責任者から管制に報告' }, { time: '10/4 09:20', text: '田中 太郎が現場への確認を開始' }] },
  { id: 'R005', kind: 'daily', status: 'open', urgent: false, title: '品川物流センター：10/3の警備日報', date: '2026-10-03', time: '20:10', owner: '田中 太郎', reporter: '伊藤 修', due: '10/4 12:00', siteId: 'S003', officerId: 'G006', body: '入出庫誘導と巡回の実施報告です。勤務終了後の異常報告はありません。取引先への提出前に記載内容を確認してください。', nextAction: '日報の勤務内容と記載事項を確認する。', history: [{ time: '10/3 20:10', text: '現場責任者から日報を受け付け' }] },
  { id: 'R006', kind: 'daily', status: 'done', urgent: false, title: '秋葉原：早朝巡回の報告', date: '2026-10-04', time: '09:10', owner: '田中 太郎', reporter: '遠藤 洋', due: '10/4 09:30', siteId: 'S012', officerId: 'G032', body: '06:00〜09:00の巡回が終了しました。出入口と共用部の確認を実施し、異常はありませんでした。', nextAction: '報告内容の確認済み。', history: [{ time: '10/4 09:10', text: '隊員から巡回結果を報告' }, { time: '10/4 09:25', text: '管制担当が内容を確認' }] },
];

export const reportSite = (report: Report) => managedSites.find((site) => site.id === report.siteId);
export const reportOfficer = (report: Report) => officers.find((officer) => officer.id === report.officerId);
