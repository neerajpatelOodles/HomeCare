const router = require('express').Router();
const validate = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/authorize');
const { upload } = require('../../middleware/upload');
const v = require('./applicants.validation');
const controller = require('./applicants.controller');

// Mounted at /api/hr/applicants behind authenticate. HR and Admin hold these permissions.
const read = requirePermission('applicants:read');
const write = requirePermission('applicants:write');

router.get('/', read, validate({ query: v.listQuery }), controller.list);
router.get('/:id', read, validate({ params: v.idParams }), controller.get);
router.get('/:id/documents/:docId/download', read, validate({ params: v.docParams }), controller.download);

router.patch('/:id/status', write, validate({ params: v.idParams, body: v.statusBody }), controller.changeStatus);
router.post('/:id/notes', write, validate({ params: v.idParams, body: v.noteBody }), controller.addNote);
router.post(
  '/:id/documents',
  write,
  upload.single('file'),
  validate({ params: v.idParams, body: v.uploadBody }),
  controller.upload
);
router.post('/:id/hire', write, validate({ params: v.idParams, body: v.hireBody }), controller.hire);

module.exports = router;
