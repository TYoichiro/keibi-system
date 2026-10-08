import { placements } from './assignments';
import { attendanceRecords } from './attendance';
import { dashboardDate } from './dashboard';
import { officers } from './personnel';
import { reports } from './reports';
import { companyDefaults } from './settings';
import { shiftPlans } from './shiftPlanning';
import { managedSites } from './siteManagement';
import { mockDutySlots } from './mockDutySlots';
import type { MockPublicDuty } from './mockDutySlots';

// A fixed fictional officer for reviewing the portal. This is not an authenticated session.
export const guardOfficer = officers.find((officer) => officer.id === 'G004')!;
export const guardCompany = companyDefaults;
export const guardPlacement = placements.find((site) => site.id === guardOfficer.assignment?.siteId)!;
export const guardSite = managedSites.find((site) => site.id === guardPlacement.id)!;
export const guardAttendance = attendanceRecords.filter((record) => record.officerId === guardOfficer.id);
export const guardToday = guardAttendance.find((record) => record.date === dashboardDate.iso)!;
export const guardShiftPlan = shiftPlans.find((plan) => plan.officer.id === guardOfficer.id)!;
export const guardReports = reports.filter((report) => report.officerId === guardOfficer.id);
// Display/invitation example only; this fictional email is not a real Google identity.
export const guardLoginEmail = 'g004-login@example.invalid';

export type GuardDutySummary = {
  dutyId: string;
  date: string;
  siteName: string;
  startAt: string;
  endAt: string;
  status: 'published' | 'completed' | 'cancelled';
  publicDuty?: MockPublicDuty;
};

// Copy only the current officer's public fields into the portal display sample.
// This filtering is a mock preview, not authentication or access control.
export const guardPublishedDuties: GuardDutySummary[] = mockDutySlots
  .filter((slot) => (slot.state === 'published' || slot.state === 'revision') && slot.publicDuty && slot.officers.some((officer) => officer.id === guardOfficer.id))
  .map((slot) => ({
    dutyId: slot.dutyId,
    date: slot.date,
    siteName: slot.publicDuty!.siteName,
    startAt: slot.publicDuty!.startAt,
    endAt: slot.publicDuty!.endAt,
    status: 'published',
    publicDuty: slot.publicDuty,
  }));

const guardCancelledDuties: GuardDutySummary[] = mockDutySlots
  .filter((slot) => slot.state === 'cancelled' && slot.formerOfficers?.some((officer) => officer.id === guardOfficer.id))
  .map((slot) => ({ dutyId: slot.dutyId, date: slot.date, siteName: slot.name, startAt: slot.startAt, endAt: slot.endAt, status: 'cancelled' }));

export const guardDutySummaries: GuardDutySummary[] = [
  { dutyId: 'D20261003-S002-D', date: '2026-10-03', siteName: guardSite.name, startAt: '2026-10-03T09:00', endAt: '2026-10-03T18:00', status: 'completed' },
  ...guardPublishedDuties,
  ...guardCancelledDuties,
];

export const guardSchedule = ['土', '日', '月', '火', '水', '木', '金', '土'].map((weekday, index) => {
  const date = `2026-10-${String(index + 3).padStart(2, '0')}`;
  return { date, weekday, duties: guardDutySummaries.filter((duty) => duty.date === date) };
});

export const guardNotices = [
  { id: 'GN001', category: '現場連絡', title: '工事車両入口の誘導位置を確認してください', date: '10/4 09:20', sender: '田中 太郎・管制担当', unread: true, body: `${guardSite.name}では、歩行者への案内位置を現場担当者と確認してください。車両の出入り時は歩行者の安全確認を優先し、変更点は次の隊員へ申し送ってください。`, site: true },
  { id: 'GN002', category: '勤務連絡', title: '10/4（日）の配置を確認してください', date: '10/3 17:00', sender: '田中 太郎・管制担当', unread: false, body: `勤務は${guardSite.hours}、集合場所は${guardSite.meeting}です。出発前に現場情報と持ち物をご確認ください。遅れが見込まれる場合は管制へ連絡してください。`, site: true },
  { id: 'N003', category: '社内共有', title: '10月の安全教育について', date: '10/3 16:00', sender: '教育担当', unread: false, body: reports.find((report) => report.id === 'N003')!.body, site: false },
];

// Independent display examples; submitting forms does not create or update these records.
export const guardRequests = [
  { id: 'GR001', kind: '打刻修正', title: '10/4 上番時刻の確認', status: '確認待ち', tone: 'amber', date: '10/4 09:15', body: '予定09:00に対して、上番記録は09:06です。実際の勤務開始時刻を管制担当者に確認しています。' },
  { id: 'GR002', kind: '休暇', title: '9/28 休暇申請', status: '承認済み', tone: 'green', date: '9/25 15:00', body: '私用による休暇申請の表示例です。勤務希望・配置表には反映されません。' },
];

export const guardChecklist = ['制服・安全靴', 'ヘルメット・反射ベスト', '誘導灯・無線機', '資格者証・身分証'];
