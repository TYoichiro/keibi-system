export function formatDate(value: string) { return new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(value)); }
export function localDateTime(value: string) { const date = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000); return date.toISOString().slice(0, 16); }
export function jstInstant(value: string) { return new Date(`${value}:00+09:00`).toISOString(); }
export const baselineDate = '2026-10-04';
