const asyncHandler = require('../../utils/asyncHandler');
const documents = require('../documents/documents.service');
const service = require('./applicants.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.validatedQuery) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { applicant: await service.getById(req.params.id) } });
});

exports.changeStatus = asyncHandler(async (req, res) => {
  const applicant = await service.changeStatus(req.params.id, req.body.status, req.body, req.user.id);
  res.json({ success: true, data: { applicant } });
});

exports.addNote = asyncHandler(async (req, res) => {
  const applicant = await service.addNote(req.params.id, req.body.body, req.user.id);
  res.status(201).json({ success: true, data: { applicant } });
});

exports.upload = asyncHandler(async (req, res) => {
  const document = await service.addDocument(req.params.id, req.file, req.body.docType, req.user.id);
  res.status(201).json({ success: true, data: { document } });
});

exports.download = asyncHandler(async (req, res) => {
  const doc = await documents.getScoped(req.params.docId, { applicantId: req.params.id });
  documents.send(res, doc);
});

exports.hire = asyncHandler(async (req, res) => {
  const result = await service.hire(req.params.id, req.body, req.user.id);
  res.status(201).json({ success: true, message: 'Applicant hired. Caregiver account created and a set-password email queued.', data: result });
});
