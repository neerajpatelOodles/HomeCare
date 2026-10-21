const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/authorize');

const placeholder = (portal, label) => (req, res) =>
  res.json({
    success: true,
    data: {
      portal,
      message: `Welcome ${label} – Phase 1 Placeholder`,
      user: { id: req.user.id, email: req.user.email, role: req.user.role },
    },
  });

// Each portal is guarded by its own permission, so a client can never read
// the staff or admin dashboard even with a valid login.
router.use(authenticate);
router.get('/client', requirePermission('dashboard:client'), placeholder('client', 'Client'));
router.get('/staff', requirePermission('dashboard:staff'), placeholder('staff', 'Staff'));
router.get('/admin', requirePermission('dashboard:admin'), placeholder('admin', 'Admin'));

module.exports = router;
