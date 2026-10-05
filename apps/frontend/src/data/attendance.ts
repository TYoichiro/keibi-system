import { placements } from './assignments';
import { dashboardDate } from './dashboard';

export type AttendanceStatus = 'working' | 'scheduled' | 'finished' | 'unreported';
export type AttendanceRecord = {
  id: string;
  date: string;
  officerId: string;
  name: string;
  siteId: string;
  siteName: string;
  category: string;
  shift: string;
  scheduledHours: string;
  scheduledStart: string;
  scheduledEnd: string;
  endNextDay: boolean;
  clockIn: string | null;
  clockOut: string | null;
  breakMinutes: number;
  actualMinutes: number | null;
  status: AttendanceStatus;
  reviewNote?: string;
};

export const attendanceDays = [
  { iso: '2026-10-03', label: '2026年10月3日（土）', snapshot: '翌日 09:30' },
  { ...dashboardDate, snapshot: '09:30' },
];

export const attendanceStatuses = {
  working: { label: '勤務中', tone: 'green' },
  scheduled: { label: '上番前', tone: 'blue' },
  finished: { label: '下番済み', tone: 'gray' },
  unreported: { label: '未報告', tone: 'amber' },
} as const;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
function shiftClock(time: string, delta: number) {
  const result = minutes(time) + delta;
  return `${String(Math.floor(result / 60)).padStart(2, '0')}:${String(result % 60).padStart(2, '0')}`;
}

export function formatDuration(value: number) {
  return `${Math.floor(value / 60)}時間${String(value % 60).padStart(2, '0')}分`;
}

function makeAttendance(date: string): AttendanceRecord[] {
  const isToday = date === dashboardDate.iso;
  return placements.flatMap((site) => site.officers.map((officer, index) => {
    const [start, end] = site.hours.match(/\d{2}:\d{2}/g) ?? ['08:00', '17:00'];
    const endNextDay = minutes(end) < minutes(start);
    const duration = minutes(end) + (endNextDay ? 1440 : 0) - minutes(start);
    const breakMinutes = duration >= 360 ? 60 : 0;
    const isWorking = isToday && index < site.working;
    const isScheduled = isToday && site.shift === '夜勤';
    const missingReport = !isToday && ['G005', 'G019'].includes(officer.id);
    const status: AttendanceStatus = missingReport ? 'unreported' : isWorking ? 'working' : isScheduled ? 'scheduled' : 'finished';
    const clockIn = isScheduled ? null : officer.id === 'G004' ? shiftClock(start, 6) : status === 'finished' ? start : shiftClock(start, -5);
    const clockOut = status === 'finished' ? end : null;
    let reviewNote: string | undefined;
    if (missingReport) reviewNote = '下番報告が未登録です。隊員への確認をお願いします。';
    else if (officer.id === 'G004') reviewNote = '上番時刻が予定より6分後です。勤務開始時刻を確認してください。';
    else if (isToday && officer.id === 'G007') reviewNote = '隊員から休憩予定の変更連絡があります。現場担当者と確認してください。';

    return {
      id: `${date}-${officer.id}`,
      date,
      officerId: officer.id,
      name: officer.name,
      siteId: site.id,
      siteName: site.name,
      category: site.category,
      shift: site.shift,
      scheduledHours: site.hours,
      scheduledStart: start,
      scheduledEnd: end,
      endNextDay,
      clockIn,
      clockOut,
      breakMinutes,
      actualMinutes: clockIn && clockOut ? minutes(clockOut) + (endNextDay ? 1440 : 0) - minutes(clockIn) - breakMinutes : null,
      status,
      reviewNote,
    };
  }));
}

// Two fixed snapshots for visual review; no attendance reports are sent or persisted.
export const attendanceRecords: AttendanceRecord[] = attendanceDays.flatMap((day) => makeAttendance(day.iso));
