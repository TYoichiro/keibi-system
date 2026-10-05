import { availableOfficers, placements } from './assignments';

export type OfficerStatus = 'active' | 'leave' | 'retired';
export type Officer = {
  id: string;
  name: string;
  employment: '常勤' | '非常勤';
  status: OfficerStatus;
  qualifications: string[];
  area: string;
  availability: string;
  joinedOn: string;
  phone: string;
  email: string;
  color: string;
  educationPending: boolean;
  educationDate?: string;
  note: string;
  assignment?: { siteId: string; siteName: string; hours: string; shift: string; leader: boolean };
};

function contactFields(id: string, index: number) {
  return {
    joinedOn: `${2020 + index % 6}-04-01`,
    phone: `090-0000-${id.slice(1).padStart(4, '0')}`,
    email: `${id.toLowerCase()}@example.invalid`,
  };
}

const colors = ['teal', 'blue', 'violet', 'amber', 'slate'];
const assignedOfficers: Officer[] = placements.flatMap((site) => site.officers.map((officer) => {
  const index = Number(officer.id.slice(1)) - 1;
  return {
    ...contactFields(officer.id, index),
    ...officer,
    employment: index % 4 === 3 ? '非常勤' : '常勤',
    status: 'active',
    qualifications: officer.leader || index % 4 === 1 ? [`${site.category}2級`] : [],
    area: site.type === 'traffic' ? '渋谷・新宿・世田谷' : site.type === 'event' ? '都内イベント会場' : '品川・千代田・中央',
    availability: site.hours,
    color: colors[index % colors.length],
    educationPending: false,
    educationDate: '2026-05-20',
    note: officer.leader ? '現場責任者として配置。初回勤務の隊員への集合場所・業務内容の共有をお願いします。' : '勤務前の現場情報の確認と、上番・下番の報告をお願いします。',
    assignment: { siteId: site.id, siteName: site.name, hours: site.hours, shift: site.shift, leader: officer.leader },
  };
}));

const unassignedOfficers: Officer[] = availableOfficers.map((officer, index) => ({
  ...contactFields(officer.id, 32 + index),
  id: officer.id,
  name: officer.name,
  employment: officer.employment as Officer['employment'],
  status: 'active',
  qualifications: officer.qualification ? [officer.qualification] : [],
  area: officer.area,
  availability: officer.hours,
  color: officer.color,
  educationPending: index < 2,
  educationDate: index < 2 ? undefined : '2026-06-10',
  note: index === 0 ? '本日は配置可能。10/5（月）は休暇希望のため、翌日の配置時に確認してください。' : '本日のシフト提出済み。勤務可能時間と移動エリアを確認して配置してください。',
}));

// All personal information and education records are fictional display samples.
const inactiveOfficers: Officer[] = [
  { ...contactFields('G038', 37), id: 'G038', name: '原田 誠', employment: '常勤', status: 'leave', qualifications: ['施設警備2級'], area: '品川・港', availability: '配置対象外', color: 'slate', educationPending: false, note: '休職中のため配置対象外です。復職時に勤務条件を確認してください。' },
  { ...contactFields('G039', 38), id: 'G039', name: '藤井 達也', employment: '非常勤', status: 'leave', qualifications: [], area: '新宿・中野', availability: '配置対象外', color: 'blue', educationPending: false, note: '休職中。管制担当者と復職予定を共有してください。' },
  { ...contactFields('G040', 39), id: 'G040', name: '大野 浩', employment: '常勤', status: 'retired', qualifications: ['交通誘導2級'], area: '世田谷・目黒', availability: '配置対象外', color: 'slate', educationPending: false, note: '2026/9/30付で退職。過去の勤務情報を参照するための表示サンプルです。' },
];

export const officers: Officer[] = [...assignedOfficers, ...unassignedOfficers, ...inactiveOfficers];
export const officerStatuses = {
  active: { label: '在籍', tone: 'green' },
  leave: { label: '休職', tone: 'amber' },
  retired: { label: '退職', tone: 'gray' },
} as const;

export const normalizeSearch = (value: string) => value.replace(/\s/g, '').toLowerCase();
