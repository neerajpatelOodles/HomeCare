const { z } = require('zod');
const { ROLES } = require('../../utils/constants');

const roleEnum = z.enum([ROLES.CLIENT, ROLES.STAFF, ROLES.CAREGIVER, ROLES.ADMIN, ROLES.HR]);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const optionalText = (max) => z.string().trim().max(max).nullable().optional();

const profileFields = {
  phone: optionalText(30),
  dateOfBirth: z.string().date().nullable().optional(),
  addressLine1: optionalText(255),
  addressLine2: optionalText(255),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
};

const createUserBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password,
  role: roleEnum,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  ...profileFields,
});

const updateUserBody = z
  .object({
    role: roleEnum,
    isActive: z.boolean(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    password,
    ...profileFields,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

const idParams = z.object({ id: z.string().uuid('Invalid user id') });

const listQuery = z.object({
  role: roleEnum.optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { createUserBody, updateUserBody, idParams, listQuery };
