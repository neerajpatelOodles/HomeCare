const { z, uuid, isoDate, optText, nullableText, page, limit, password } = require('../../utils/schemas');
const { CLIENT_STATUSES } = require('../../utils/constants');

const idParams = z.object({ id: uuid('Invalid client id') });

const listQuery = z.object({
  status: z.enum(CLIENT_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  page,
  limit: limit(20, 100),
});

const contactFields = {
  phone: optText(30),
  dateOfBirth: z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional()),
  addressLine1: optText(255),
  addressLine2: optText(255),
  city: optText(100),
  region: optText(100),
  postalCode: optText(20),
  careNeeds: optText(4000),
  emergencyContactName: optText(150),
  emergencyContactPhone: optText(30),
  notes: optText(4000),
};

const createBody = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toLowerCase().email().optional()),
    status: z.enum(CLIENT_STATUSES).default('active'),
    ...contactFields,
    // Give the client a portal login now (creates a "client" user), OR link an existing one.
    login: z.object({ email: z.string().trim().toLowerCase().email(), password }).optional(),
    userId: uuid('Invalid user id').optional(),
  })
  .refine((o) => !(o.login && o.userId), { message: 'Provide either login or userId, not both' });

const nullable = (schema) => schema.nullable().optional();

const updateBody = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: nullable(z.string().trim().toLowerCase().email()),
    status: z.enum(CLIENT_STATUSES),
    phone: nullableText(30),
    dateOfBirth: nullable(isoDate),
    addressLine1: nullableText(255),
    addressLine2: nullableText(255),
    city: nullableText(100),
    region: nullableText(100),
    postalCode: nullableText(20),
    careNeeds: nullableText(4000),
    emergencyContactName: nullableText(150),
    emergencyContactPhone: nullableText(30),
    notes: nullableText(4000),
    userId: nullable(uuid('Invalid user id')),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

const planParams = z.object({ id: uuid('Invalid client id'), planId: uuid('Invalid care plan id') });
const dateOpt = z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional());
const planBody = z.object({
  title: z.string().trim().min(1).max(200),
  summary: optText(4000),
  goals: optText(4000),
  dailyTasks: optText(4000),
  precautions: optText(4000),
  startDate: dateOpt,
  reviewDate: dateOpt,
});
const planUpdateBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: nullableText(4000),
    goals: nullableText(4000),
    dailyTasks: nullableText(4000),
    precautions: nullableText(4000),
    startDate: isoDate.nullable(),
    reviewDate: isoDate.nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

module.exports = { idParams, listQuery, createBody, updateBody, planParams, planBody, planUpdateBody };
