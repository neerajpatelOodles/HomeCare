const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/authorize');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const service = require('./dashboard.service');
const { query } = require('../../config/db');
const env = require('../../config/env');

// Some databases do not know old zone names (e.g. "Asia/Calcutta" is now "Asia/Kolkata").
const ALIASES = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires' };
const checked = new Map();
async function dbZone(tz) {
  if (checked.has(tz)) return checked.get(tz);
  let found = null;
  for (const candidate of [tz, ALIASES[tz], env.appTimezone, 'UTC'].filter(Boolean)) {
    try {
      await query('SELECT NOW() AT TIME ZONE $1', [candidate]);
      found = candidate;
      break;
    } catch { /* try the next one */ }
  }
  checked.set(tz, found);
  return found;
}

// Valid IANA time zone name, e.g. "Asia/Kolkata" (defaults to UTC).
function timeZone(req) {
  const tz = req.query.tz || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw ApiError.badRequest('Invalid time zone');
  }
  return tz;
}

const respond = (portal, label, loader) =>
  asyncHandler(async (req, res) => {
    const data = await loader(req, req.query.tz ? await dbZone(timeZone(req)) : 'UTC');
    res.json({
      success: true,
      data: {
        portal,
        message: `Welcome ${label}`, // greeting; the real content is in the fields below
        user: { id: req.user.id, email: req.user.email, role: req.user.role },
        ...data,
      },
    });
  });

// Each portal is guarded by its own permission, so a client can never read
// the staff, HR or admin dashboard even with a valid login.
router.use(authenticate);
router.get('/client', requirePermission('dashboard:client'), respond('client', 'Client', (req) => service.client(req.user.id)));
// Office staff get the same read-only overview numbers as the admin dashboard.
router.get('/staff', requirePermission('dashboard:staff'), respond('staff', 'Staff', (req, tz) => service.admin(tz)));
router.get('/caregiver', requirePermission('dashboard:caregiver'), respond('caregiver', 'Caregiver', (req, tz) => service.caregiver(req.user.id, tz)));
router.get('/hr', requirePermission('dashboard:hr'), respond('hr', 'HR', () => service.hr()));
router.get('/admin', requirePermission('dashboard:admin'), respond('admin', 'Admin', (req, tz) => service.admin(tz)));

module.exports = router;
