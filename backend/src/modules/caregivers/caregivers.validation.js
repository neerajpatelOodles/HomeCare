const { z, uuid, isoDate, nullableText, page, limit } = require('../../utils/schemas');
const { PROFESSIONS, EMPLOYMENT_STATUSES, DOC_TYPES } = require('../../utils/constants');

const idParams = z.object({ id: uuid('Invalid caregiver id') });
const docParams = z.object({ id: uuid('Invalid caregiver id'), docId: uuid('Invalid document id') });

const listQuery = z.object({
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  profession: z.enum(PROFESSIONS).optional(),
  search: z.string().trim().max(100).optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  page,
  limit: limit(20, 100),
});

const updateBody = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: nullableText(30),
    profession: z.enum(PROFESSIONS),
    licenseBody: nullableText(100),
    licenseNumber: nullableText(100),
    licenseExpiry: isoDate.nullable(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES),
    emergencyContactName: nullableText(150),
    emergencyContactPhone: nullableText(30),
    notes: nullableText(4000),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

const uploadBody = z.object({ docType: z.enum(DOC_TYPES).default('other') });

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 09:00');
const availabilityBody = z.object({
  availability: z
    .array(
      z.object({ weekday: z.number().int().min(0).max(6), startTime: time, endTime: time })
        .refine((w) => w.endTime > w.startTime, { message: 'endTime must be after startTime' })
    )
    .max(50),
});

const serviceAreasBody = z.object({
  serviceAreas: z.array(z.string().trim().min(1).max(100)).max(50),
});

const certBody = z.object({
  name: z.string().trim().min(1).max(150),
  issuer: nullableText(150),
  issuedOn: isoDate.nullable().optional(),
  expiresOn: isoDate.nullable().optional(),
  documentId: uuid('Invalid document id').nullable().optional(),
});
const certUpdateBody = certBody.partial().refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field' });
const certParams = z.object({ id: uuid('Invalid caregiver id'), certId: uuid('Invalid certification id') });

module.exports = { availabilityBody, serviceAreasBody, certBody, certUpdateBody, certParams, idParams, docParams, listQuery, updateBody, uploadBody };
