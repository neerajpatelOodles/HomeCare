/**
 * Central route registry. To add a new module:
 *   1. copy src/modules/_template to src/modules/<name>
 *   2. add a numbered SQL file in src/db/migrations
 *   3. register the module's router below
 */
const router = require('express').Router();
const authenticate = require('./middleware/authenticate');
const { authorizeRoles } = require('./middleware/authorize');
const { ROLES } = require('./utils/constants');
const visits = require('./modules/visits/visits.routes');

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));

// ---- Public ---------------------------------------------------------------
router.use('/auth', require('./modules/auth/auth.routes'));
router.use('/recruitment', require('./modules/recruitment/recruitment.routes')); // job application form

// ---- Portals (each router enforces its own login + permissions) -----------
router.use('/dashboard', require('./modules/dashboard/dashboard.routes'));
router.use('/caregiver/visits', authenticate, visits.caregiver);
router.use('/client/visits', authenticate, visits.client);
router.use('/client/care-plan', authenticate, visits.carePlan);

// ---- HR + Admin -------------------------------------------------------------
router.use('/hr/applicants', authenticate, authorizeRoles(ROLES.HR, ROLES.ADMIN), require('./modules/applicants/applicants.routes'));
router.use('/caregivers', authenticate, authorizeRoles(ROLES.HR, ROLES.ADMIN), require('./modules/caregivers/caregivers.routes'));
router.use('/admin/users', authenticate, authorizeRoles(ROLES.HR, ROLES.ADMIN), require('./modules/users/users.routes'));

// ---- Admin only -------------------------------------------------------------
router.use('/admin/notifications', authenticate, authorizeRoles(ROLES.ADMIN), require('./modules/notifications/notifications.routes'));
router.use('/clients', authenticate, authorizeRoles(ROLES.ADMIN), require('./modules/clients/clients.routes'));
router.use('/visits', authenticate, authorizeRoles(ROLES.ADMIN), visits.admin);

module.exports = router;
