const asyncHandler = require('../../utils/asyncHandler');
const env = require('../../config/env');
const { PROFESSIONS, DOC_TYPES, REQUIRED_DOC_TYPES } = require('../../utils/constants');
const { ALLOWED_LABEL } = require('../../middleware/upload');
const service = require('./recruitment.service');

exports.options = (_req, res) => {
  res.json({
    success: true,
    data: {
      professions: PROFESSIONS,
      documentTypes: DOC_TYPES.filter((t) => t !== 'other'),
      requiredDocumentTypes: ['resume'], // only the résumé blocks submission; HR chases the rest
      checklistDocumentTypes: REQUIRED_DOC_TYPES,
      formFields: { resume: 'resume', cprFirstAid: 'cpr_first_aid', policeCheck: 'police_check', governmentId: 'government_id', certifications: 'certification (up to 3)' },
      allowedFiles: ALLOWED_LABEL,
      maxFileMb: env.storage.maxFileMb,
    },
  });
};

exports.apply = asyncHandler(async (req, res) => {
  // Honeypot: bots fill the hidden field. Pretend success, store nothing.
  if (req.body.website) {
    return res.status(201).json({ success: true, data: { reference: 'RECEIVED' } });
  }
  const result = await service.submitApplication(req.body, req.files);
  res.status(201).json({
    success: true,
    message: 'Application received. Our HR team will review it and be in touch.',
    data: result,
  });
});
