const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const make = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.rateLimitDisabled,
    message: { success: false, message },
  });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

module.exports = {
  // Brute-force protection on login
  loginLimiter: make({ windowMs: 15 * MINUTE, limit: 20, message: 'Too many login attempts, try again later' }),
  // Mass fake-account creation through public signup
  registerLimiter: make({ windowMs: HOUR, limit: 10, message: 'Too many sign-ups from this address, try again later' }),
  // Spam on the public job application form
  applicationLimiter: make({ windowMs: HOUR, limit: 10, message: 'Too many applications from this address, try again later' }),
};
