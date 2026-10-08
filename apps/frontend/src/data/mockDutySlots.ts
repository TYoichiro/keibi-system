import { getSiteDetails, placements } from './assignments';
import type { Placement } from './assignments';
import { managedSites } from './siteManagement';

export type MockDutyState = 'draft' | 'published' | 'revision' | 'cancelled' | 'reference';
export type MockPublicDuty = {
  version: number;
  updatedAt: string;
  siteName: string;
  startAt: string;
  endAt: string;
  meeting: string;
  instruction: string;
  contact: string;
  phone: string;
};
export type MockDutySlot = Placement & {
  dutyId: string;
  date: string;
  startAt: string;
  endAt: string;
  state: MockDutyState;
  publicDuty?: MockPublicDuty;
  revisionStartAt?: string;
  revisionEndAt?: string;
  changeReason?: string;
  formerOfficers?: Placement['officers'];
};

function timeParts(placement: Placement) {
  const times = placement.hours.match(/\d{2}:\d{2}/g) ?? ['09:00', '18:00'];
  return { start: times[0], end: times[1], nextDay: placement.hours.includes('翌') };
}

function makeSlot(placement: Placement, date: string, nextDate: string): MockDutySlot {
  const time = timeParts(placement);
  const startAt = `${date}T${time.start}`;
  const endAt = `${time.nextDay ? nextDate : date}T${time.end}`;
  const details = getSiteDetails(placement);
  const site = managedSites.find((item) => item.id === placement.id);
  const state = placement.type === 'event' ? 'reference' : placement.officers.length < placement.required ? 'draft' : 'published';
  return {
    ...placement,
    dutyId: `D${date.replaceAll('-', '')}-${placement.id}-${placement.shift === '夜勤' ? 'N' : 'D'}`,
    date, startAt, endAt, state,
    publicDuty: state === 'published' ? {
      version: 1,
      updatedAt: '2026-10-03T16:00',
      siteName: placement.name,
      startAt, endAt,
      meeting: details.meeting,
      instruction: details.note,
      contact: site?.contact ?? details.contact,
      phone: site?.phone ?? '03-0000-0000',
    } : undefined,
  };
}

// Display samples only. No saved business data or automatic eligibility checks.
const baselineSlots = placements.map((placement) => makeSlot(placement, '2026-10-04', '2026-10-05'));
const shinjuku = placements.find((placement) => placement.id === 'S002')!;
const shinjukuPublic = makeSlot({
  ...shinjuku,
  assigned: 3,
  working: 0,
  officers: [...shinjuku.officers, { id: 'G035', name: '福田 健', leader: false }],
}, '2026-10-05', '2026-10-06');
if (shinjukuPublic.publicDuty) shinjukuPublic.publicDuty.updatedAt = '2026-10-04T09:00';
const nightRevision = makeSlot(placements.find((placement) => placement.id === 'S010')!, '2026-10-05', '2026-10-06');
nightRevision.state = 'revision';
nightRevision.revisionStartAt = '2026-10-05T20:30';
nightRevision.revisionEndAt = '2026-10-06T05:30';
nightRevision.changeReason = '設備点検の開始時刻が30分後ろ倒しとなるため。';

const cancelledSite = shinjuku;
const cancelledSlot: MockDutySlot = {
  ...cancelledSite,
  assigned: 0,
  working: 0,
  officers: [],
  dutyId: 'D20261006-S002-D',
  date: '2026-10-06',
  startAt: '2026-10-06T09:00',
  endAt: '2026-10-06T18:00',
  state: 'cancelled',
  formerOfficers: shinjukuPublic.officers,
  changeReason: '取引先から工事日程変更の連絡。勤務枠全体の取消を確認する表示例。',
};

export const mockDutySlots: MockDutySlot[] = [...baselineSlots, shinjukuPublic, nightRevision, cancelledSlot];
export const mockDutyDates = [
  { iso: '2026-10-04', label: '10/4（日）', note: '基準日' },
  { iso: '2026-10-05', label: '10/5（月）', note: '確定・改訂の例' },
  { iso: '2026-10-06', label: '10/6（火）', note: '取消の例' },
];
export const mockDutyStateLabels: Record<MockDutyState, string> = {
  draft: '下書き・本人非公開',
  published: '確定・公開中',
  revision: '改訂案あり・旧版公開中',
  cancelled: '取消済み',
  reference: '次期の参考サンプル',
};
export function formatDutyDateTime(value: string) {
  return `${value.slice(5, 7)}/${value.slice(8, 10)} ${value.slice(11, 16)}`;
}
