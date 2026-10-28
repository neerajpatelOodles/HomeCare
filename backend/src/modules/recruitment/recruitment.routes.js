const router = require('express').Router();
const { upload } = require('../../middleware/upload');
const { applicationLimiter } = require('../../middleware/rateLimiters');
const validate = require('../../middleware/validate');
const { applicationBody } = require('./recruitment.validation');
const controller = require('./recruitment.controller');

// PUBLIC: no login needed. Mounted at /api/recruitment.
router.get('/options', controller.options);

router.post(
  '/applications',
  applicationLimiter,
  upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'cprFirstAid', maxCount: 1 },
    { name: 'policeCheck', maxCount: 1 },
    { name: 'governmentId', maxCount: 1 },
    { name: 'certifications', maxCount: 3 },
  ]),
  validate({ body: applicationBody }),
  controller.apply
);

module.exports = router;
