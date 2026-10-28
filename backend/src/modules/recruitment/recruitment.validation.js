const { z, optText } = require('../../utils/schemas');
const { PROFESSIONS } = require('../../utils/constants');

// Multipart forms send every field as a string, so numbers are coerced.
const applicationBody = z.object({
  firstName: z.string().trim().min(1, 'First name required').max(100),
  lastName: z.string().trim().min(1, 'Last name required').max(100),
  email: z.string().trim().toLowerCase().email('Valid email required'),
  phone: z.string().trim().min(7, 'Valid phone number required').max(30),
  profession: z.enum(PROFESSIONS, { error: `Profession must be one of ${PROFESSIONS.join(', ')}` }),
  licenseNumber: optText(100),
  yearsExperience: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(60).optional()
  ),
  city: optText(100),
  region: optText(100),
  coverNote: optText(2000),
  website: z.string().optional(), // honeypot: real people leave this empty
});

module.exports = { applicationBody };
