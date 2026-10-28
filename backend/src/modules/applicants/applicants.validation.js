const { z, uuid, isoDate, optText, page, limit } = require('../../utils/schemas');
const { PROFESSIONS, APPLICANT_STATUSES, DOC_TYPES } = require('../../utils/constants');

const idParams = z.object({ id: uuid('Invalid applicant id') });
const docParams = z.object({ id: uuid('Invalid applicant id'), docId: uuid('Invalid document id') });

const listQuery = z.object({
  status: z.enum(APPLICANT_STATUSES).optional(),
  profession: z.enum(PROFESSIONS).optional(),
  search: z.string().trim().max(100).optional(),
  page,
  limit: limit(20, 100),
});

// "hired" is intentionally missing: it only happens through the hire action.
const statusBody = z.object({
  status: z.enum(['applied', 'screening', 'interview', 'offer', 'rejected'], {
    error: 'Status must be applied, screening, interview, offer or rejected. Use the hire action to hire.',
  }),
  // Internal note / rejection reason. Never emailed to the applicant.
  note: optText(1000),
  // Email the applicant about this change (default yes). "message" is an optional extra line in that email.
  notifyApplicant: z.boolean().default(true),
  message: optText(1000),
});

const noteBody = z.object({ body: z.string().trim().min(1, 'Note cannot be empty').max(2000) });

const uploadBody = z.object({ docType: z.enum(DOC_TYPES).default('other') });

const hireBody = z.object({
  licenseNumber: optText(100),
  licenseExpiry: z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional()),
  hireDate: z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional()),
  emergencyContactName: optText(150),
  emergencyContactPhone: optText(30),
});

module.exports = { idParams, docParams, listQuery, statusBody, noteBody, uploadBody, hireBody };
