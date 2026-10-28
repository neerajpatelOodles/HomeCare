const { z, uuid, isoDateTime, optText, nullableText, page, limit } = require('../../utils/schemas');
const { VISIT_STATUSES } = require('../../utils/constants');

const idParams = z.object({ id: uuid('Invalid visit id') });

const dateRange = {
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
};

const listQuery = z.object({
  ...dateRange,
  status: z.enum(VISIT_STATUSES).optional(),
  caregiverId: uuid('Invalid caregiver id').optional(),
  clientId: uuid('Invalid client id').optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  page,
  limit: limit(50, 200),
});

// For the caregiver's and the client's own visit lists.
const ownListQuery = z.object({
  ...dateRange,
  status: z.enum(VISIT_STATUSES).optional(),
  page,
  limit: limit(50, 200),
});

const createBody = z.object({
  clientId: uuid('Invalid client id'),
  caregiverId: uuid('Invalid caregiver id').nullable().optional(),
  startAt: isoDateTime,
  endAt: isoDateTime,
  serviceType: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().min(1).max(100).default('Personal care')),
  instructions: optText(2000),
});

const updateBody = z
  .object({
    caregiverId: uuid('Invalid caregiver id').nullable(),
    startAt: isoDateTime,
    endAt: isoDateTime,
    serviceType: z.string().trim().min(1).max(100),
    instructions: nullableText(2000),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

const cancelBody = z.object({ reason: optText(500) });
const completeBody = z.object({ note: optText(2000) });
const noteBody = z.object({ body: z.string().trim().min(1, 'Note cannot be empty').max(2000) });

module.exports = { idParams, listQuery, ownListQuery, createBody, updateBody, cancelBody, completeBody, noteBody };
