const router = require('express').Router();
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/authorize');
const v = require('./clients.validation');
const controller = require('./clients.controller');

// Mounted at /api/clients behind authenticate. Admin holds these permissions.
router.get('/', requirePermission('clients:read'), validate({ query: v.listQuery }), controller.list);
router.post('/', requirePermission('clients:write'), validate({ body: v.createBody }), controller.create);
router.get('/:id', requirePermission('clients:read'), validate({ params: v.idParams }), controller.get);
router.patch(
  '/:id',
  requirePermission('clients:write'),
  validate({ params: v.idParams, body: v.updateBody }),
  controller.update
);

router.get('/:id/care-plans', requirePermission('clients:read'), validate({ params: v.idParams }), controller.listPlans);
router.post('/:id/care-plans', requirePermission('clients:write'), validate({ params: v.idParams, body: v.planBody }), controller.createPlan);
router.patch('/:id/care-plans/:planId', requirePermission('clients:write'), validate({ params: v.planParams, body: v.planUpdateBody }), controller.updatePlan);

module.exports = router;
