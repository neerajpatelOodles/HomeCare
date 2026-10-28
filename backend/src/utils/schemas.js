/** Small zod building blocks shared by the Milestone 2 modules. */
const { z } = require('zod');

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);

/** Optional trimmed string. Empty string counts as "not provided". */
const optText = (max) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

/** Optional text that may also be cleared with null (for PATCH). */
const nullableText = (max) => z.string().trim().max(max).nullable().optional();

const uuid = (msg = 'Invalid id') => z.string().uuid(msg);

const isoDate = z.iso.date('Use the format YYYY-MM-DD');
const isoDateTime = z.iso.datetime({ offset: true, message: 'Use an ISO date-time, e.g. 2026-11-02T09:00:00+05:30' });

const page = z.coerce.number().int().min(1).default(1);
const limit = (def = 20, max = 100) => z.coerce.number().int().min(1).max(max).default(def);

/** Strong-enough password rule used everywhere an admin/HR sets a password. */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const paginationMeta = (total, pageNo, pageSize) => ({
  page: pageNo,
  limit: pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});

/** Escape % and _ so user search text is matched literally by ILIKE. */
const likePattern = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

module.exports = {
  z,
  optText,
  nullableText,
  uuid,
  isoDate,
  isoDateTime,
  page,
  limit,
  password,
  paginationMeta,
  likePattern,
};
