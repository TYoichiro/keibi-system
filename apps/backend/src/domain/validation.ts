import { z } from 'zod';

const text = (max: number, required = false) => z.string().trim().refine((value) => [...value].length <= max, 'TOO_LONG').refine((value) => !required || value.length > 0, 'REQUIRED');
export const uuid = z.uuid();
export const code = z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/).transform((value) => value.toUpperCase());
export const name = text(100, true);
export const reason = text(500, true);
const optionalText = (max: number) => text(max).transform((value) => value === '' ? null : value).nullable().optional();
export const version = z.number().int().positive();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'INVALID_DATE');
export const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/)
  .refine((value) => Number.isFinite(Date.parse(value)) && date.safeParse(value.slice(0, 10)).success, 'INVALID_TIMESTAMP');
const email = z.email().max(254).nullable().optional();
const officerFields = {
  code, name, branchId: uuid, status: z.enum(['active', 'leave', 'retired']),
  businessPhone: optionalText(50), businessEmail: email, employmentType: optionalText(100), serviceArea: optionalText(300), internalMemo: optionalText(2000),
};
export const officerCreate = z.strictObject({ ...officerFields, status: officerFields.status.default('active') });
export const officerUpdate = z.strictObject({ ...z.object(officerFields).partial().shape, expectedVersion: version, reason });
const clientFields = { code, name, status: z.enum(['active', 'inactive']), contactName: optionalText(100), businessPhone: optionalText(50), businessEmail: email };
export const clientCreate = z.strictObject({ ...clientFields, status: clientFields.status.default('active') });
export const clientUpdate = z.strictObject({ ...z.object(clientFields).partial().shape, expectedVersion: version, reason });
export const branchAccess = z.strictObject({ branchIds: z.array(uuid).max(1000).refine(unique, 'DUPLICATE'), expectedVersion: version, reason });
export const qualificationCreate = z.strictObject({ code, name, status: z.enum(['active', 'inactive']).default('active') });
export const qualificationUpdate = z.strictObject({ code: code.optional(), name: name.optional(), status: z.enum(['active', 'inactive']).optional(), expectedVersion: version, reason });
export const officerQualification = z.strictObject({ qualificationId: uuid, verificationStatus: z.enum(['unverified', 'verified', 'invalid']), validFrom: date.nullable().optional(), validThrough: date.nullable().optional() })
  .refine((value) => !value.validFrom || !value.validThrough || value.validFrom <= value.validThrough, 'INVALID_PERIOD');
export const officerQualificationUpdate = z.strictObject({ qualifications: z.array(officerQualification).max(100).refine((values) => unique(values.map((item) => item.qualificationId)), 'DUPLICATE'), expectedVersion: version, reason });
const siteFields = {
  code, name, branchId: uuid, clientId: uuid, securityType: z.enum(['traffic', 'facility']),
  location: text(300, true), meetingPoint: text(300, true), status: z.enum(['planned', 'active', 'paused', 'closed']),
  instructions: text(2000).optional(), internalMemo: optionalText(2000), contactName: optionalText(100), businessPhone: optionalText(50),
  contractFrom: date.nullable().optional(), contractThrough: date.nullable().optional(),
};
export const siteCreate = z.strictObject({ ...siteFields, status: siteFields.status.default('planned') });
export const siteUpdate = z.strictObject({ ...z.object(siteFields).partial().shape, expectedVersion: version, reason });
export const snapshot = z.strictObject({ name, location: text(300, true), meetingPoint: text(300, true), instructions: text(2000), contactName: optionalText(100), businessPhone: optionalText(50) });
const confirmation = z.strictObject({ confirmed: z.boolean(), note: text(500).optional() });
const draftFields = {
  dutyDate: date, startsAt: timestamp, endsAt: timestamp, requiredCount: z.number().int().min(1).max(1000),
  assignments: z.array(z.strictObject({ officerId: uuid, isLeader: z.boolean() })).max(1000).refine((values) => unique(values.map((item) => item.officerId)), 'DUPLICATE'),
  qualificationRequirements: z.array(z.strictObject({ qualificationId: uuid, requiredQualifiedCount: z.number().int().min(1).max(1000) })).max(100)
    .refine((values) => unique(values.map((item) => item.qualificationId)), 'DUPLICATE').default([]),
  siteSnapshot: snapshot.optional(), availabilityCheck: confirmation.default({ confirmed: false }), travelRestCheck: confirmation.default({ confirmed: false }),
  reason: text(500).default(''),
};
function validDraft(value: z.infer<typeof draftCreate>) {
  return Date.parse(value.startsAt) < Date.parse(value.endsAt) && jstDate(value.startsAt) === value.dutyDate &&
    value.qualificationRequirements.every((item) => item.requiredQualifiedCount <= value.requiredCount);
}
export const draftCreate = z.strictObject(draftFields);
export const slotCreate = z.strictObject({ ...draftFields, siteId: uuid }).refine(validDraft, 'INVALID_DUTY');
export const draftUpdate = z.strictObject({ ...draftFields, draftVersionId: uuid, expectedVersion: version }).refine(validDraft, 'INVALID_DUTY');
export const slotAction = z.strictObject({ expectedVersion: version, reason });
export const slotConfirm = z.strictObject({ expectedVersion: version, draftVersionId: uuid, reason });
export type DraftInput = z.infer<typeof draftCreate>;
export type Snapshot = z.infer<typeof snapshot>;

export function jstDate(value: string | Date): string {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function dateStart(value: string): number { return Date.parse(`${value}T00:00:00+09:00`); }
export function dateEnd(value: string): number { return dateStart(value) + 24 * 60 * 60 * 1000; }
export function withinPeriod(startsAt: string, endsAt: string, from: string | null, through: string | null): boolean {
  return (!from || Date.parse(startsAt) >= dateStart(from)) && (!through || Date.parse(endsAt) <= dateEnd(through));
}
function unique(values: string[]) { return new Set(values).size === values.length; }
export const listQuery = z.strictObject({
  q: text(100).optional(), branchId: uuid.optional(), page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20), status: z.string().max(30).optional(),
});
export const dutyQuery = z.strictObject({ ...listQuery.shape, from: date, to: date, siteId: uuid.optional(), officerId: uuid.optional() })
  .refine((value) => value.from <= value.to && dateStart(value.to) - dateStart(value.from) <= 92 * 86400000, 'INVALID_SEARCH_PERIOD');
export const guardQuery = z.strictObject({ from: date, to: date })
  .refine((value) => value.from <= value.to && dateStart(value.to) - dateStart(value.from) <= 92 * 86400000, 'INVALID_SEARCH_PERIOD');
