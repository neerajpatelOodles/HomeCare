const router = require('express').Router();
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/authorize');
const v = require('./users.validation');
const controller = require('./users.controller');

// Mounted at /api/admin/users behind authenticate + authorizeRoles('admin').
router.get('/', requirePermission('users:read'), validate({ query: v.listQuery }), controller.list);
router.post('/', requirePermission('users:create'), validate({ body: v.createUserBody }), controller.create);
router.get('/:id', requirePermission('users:read'), validate({ params: v.idParams }), controller.get);
router.patch(
  '/:id',
  requirePermission('users:update'),
  validate({ params: v.idParams, body: v.updateUserBody }),
  controller.update
);

module.exports = router;
