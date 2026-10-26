const asyncHandler = require('../../utils/asyncHandler');
const documents = require('../documents/documents.service');
const service = require('./caregivers.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.validatedQuery) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { caregiver: await service.getById(req.params.id) } });
});

exports.update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { caregiver: await service.update(req.params.id, req.body) } });
});

exports.upload = asyncHandler(async (req, res) => {
  const document = await service.addDocument(req.params.id, req.file, req.body.docType, req.user.id);
  res.status(201).json({ success: true, data: { document } });
});

exports.download = asyncHandler(async (req, res) => {
  const doc = await documents.getScoped(req.params.docId, { userId: req.params.id });
  documents.send(res, doc);
});

exports.setAvailability = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { availability: await service.setAvailability(req.params.id, req.body.availability) } });
});
exports.setServiceAreas = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { serviceAreas: await service.setServiceAreas(req.params.id, req.body.serviceAreas) } });
});
exports.addCertification = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { certification: await service.addCertification(req.params.id, req.body) } });
});
exports.updateCertification = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { certification: await service.updateCertification(req.params.id, req.params.certId, req.body) } });
});
exports.removeCertification = asyncHandler(async (req, res) => {
  await service.removeCertification(req.params.id, req.params.certId);
  res.json({ success: true, message: 'Certification removed' });
});
exports.resendInvite = asyncHandler(async (req, res) => {
  await service.resendInvite(req.params.id);
  res.json({ success: true, message: 'Invite email queued' });
});
