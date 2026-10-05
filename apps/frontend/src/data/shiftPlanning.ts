import { officers } from './personnel';
import type { Officer } from './personnel';

export const shiftDays = [
  { iso: '2026-10-04', label: '10/4', weekday: '日' },
  { iso: '2026-10-05', label: '10/5', weekday: '月' },
  { iso: '2026-10-06', label: '10/6', weekday: '火' },
  { iso: '2026-10-07', label: '10/7', weekday: '水' },
  { iso: '2026-10-08', label: '10/8', weekday: '木' },
  { iso: '2026-10-09', label: '10/9', weekday: '金' },
  { iso: '2026-10-10', label: '10/10', weekday: '土' },
];

export type ShiftState = 'assigned' | 'available' | 'off' | 'pending';
export const shiftStates = {
  assigned: { label: '配置済み', tone: 'green' },
  available: { label: '勤務可', tone: 'blue' },
  off: { label: '休み希望', tone: 'gray' },
  pending: { label: '未提出', tone: 'amber' },
} as const;
export type ShiftPlan = { officer: Officer; days: ShiftState[]; requestPending: boolean; note: string };

// Today's availability uses the existing roster. Future dates are independent sample requests.
export const shiftPlans: ShiftPlan[] = officers.filter((officer) => officer.status === 'active').map((officer, index) => ({
  officer,
  days: shiftDays.map((_, dayIndex): ShiftState => {
    if (dayIndex === 0) return officer.assignment ? 'assigned' : 'available';
    if (dayIndex === 1 && officer.id === 'G033') return 'off';
    if (index % 7 === 0) return 'pending';
    if ((index + dayIndex) % 9 === 0) return 'off';
    return 'available';
  }),
  requestPending: ['G033', 'G034'].includes(officer.id),
  note: officer.id === 'G033' ? '10/5（月）の休暇希望。翌日の配置に含めないよう確認をお願いします。' : officer.id === 'G034' ? '10/6（火）は17時までの勤務を希望。勤務時間を確認してください。' : index % 7 === 0 ? '翌日以降の勤務希望が未提出です。予定を確認してください。' : '勤務希望を提出済み。配置前に勤務時間と対応エリアを確認してください。',
}));
