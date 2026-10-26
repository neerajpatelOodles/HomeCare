const router = require('express').Router();
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/authorize');
const { upload } = require('../../middleware/upload');
const v = require('./caregivers.validation');
const controller = require('./caregivers.controller');

// Mounted at /api/caregivers behind authenticate. HR and Admin hold these permissions.
const read = requirePermission('caregivers:read');
const write = requirePermission('caregivers:write');

router.get('/', read, validate({ query: v.listQuery }), controller.list);
router.get('/:id', read, validate({ params: v.idParams }), controller.get);
router.get('/:id/documents/:docId/download', read, validate({ params: v.docParams }), controller.download);
router.patch('/:id', write, validate({ params: v.idParams, body: v.updateBody }), controller.update);
router.post(
  '/:id/documents',
  write,
  upload.single('file'),
  validate({ params: v.idParams, body: v.uploadBody }),
  controller.upload
);

router.put('/:id/availability', write, validate({ params: v.idParams, body: v.availabilityBody }), controller.setAvailability);
router.put('/:id/service-areas', write, validate({ params: v.idParams, body: v.serviceAreasBody }), controller.setServiceAreas);
router.post('/:id/certifications', write, validate({ params: v.idParams, body: v.certBody }), controller.addCertification);
router.patch('/:id/certifications/:certId', write, validate({ params: v.certParams, body: v.certUpdateBody }), controller.updateCertification);
router.delete('/:id/certifications/:certId', write, validate({ params: v.certParams }), controller.removeCertification);
router.post('/:id/resend-invite', write, validate({ params: v.idParams }), controller.resendInvite);

module.exports = router;
