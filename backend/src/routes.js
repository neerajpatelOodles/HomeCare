/**
 * Central route registry. To add a Phase 2 module (appointments, tasks, notes...):
 *   1. copy src/modules/_template to src/modules/<name>
 *   2. add a numbered SQL file in src/db/migrations
 *   3. register the module's router below
 */
const router = require('express').Router();
const authenticate = require('./middleware/authenticate');
const { authorizeRoles } = require('./middleware/authorize');
const { ROLES } = require('./utils/constants');

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));

router.use('/auth', require('./modules/auth/auth.routes'));
router.use('/dashboard', require('./modules/dashboard/dashboard.routes'));
router.use('/admin/users', authenticate, authorizeRoles(ROLES.ADMIN), require('./modules/users/users.routes'));

// Phase 2+ modules register here, e.g.:
// router.use('/appointments', require('./modules/appointments/appointments.routes'));

module.exports = router;
