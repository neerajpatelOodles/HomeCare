const { z } = require('zod');

const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

// Public self-signup can only ever create a CLIENT. Any other role is rejected.
const registerBody = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  firstName: z.string().trim().min(1, 'First name required').max(100),
  lastName: z.string().trim().min(1, 'Last name required').max(100),
  role: z.literal('client').optional().default('client'),
});

const setPasswordBody = z.object({
  token: z.string().trim().min(20, 'Token required').max(200),
  password: registerBody.shape.password,
});

module.exports = { loginBody, registerBody, setPasswordBody };
