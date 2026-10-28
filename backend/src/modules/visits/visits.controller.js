const asyncHandler = require('../../utils/asyncHandler');
const service = require('./visits.service');

// ---- Admin scheduling ------------------------------------------------------
exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.validatedQuery) });
});

exports.options = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.options() });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { visit: await service.getDetail(req.params.id) } });
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.create(req.body, req.user.id) });
});

exports.update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.params.id, req.body) });
});

exports.cancel = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { visit: await service.cancel(req.params.id, req.body.reason) } });
});

exports.missed = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { visit: await service.markMissed(req.params.id) } });
});

// ---- Caregiver portal (own visits only) ------------------------------------
exports.myCaregiverVisits = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.validatedQuery, { caregiverId: req.user.id, view: 'caregiver' }) });
});

exports.myCaregiverVisit = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { visit: await service.getForCaregiver(req.params.id, req.user.id) } });
});

exports.complete = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { visit: await service.complete(req.params.id, req.user.id, req.body.note) } });
});

exports.addNote = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { visit: await service.addNote(req.params.id, req.user.id, req.body.body) } });
});

// ---- Client portal (own visits only) ---------------------------------------
exports.myClientVisits = asyncHandler(async (req, res) => {
  const clientId = await service.clientIdForUser(req.user.id);
  if (!clientId) {
    const { page, limit } = req.validatedQuery;
    return res.json({ success: true, data: { items: [], pagination: { page, limit, total: 0, totalPages: 0 } } });
  }
  res.json({ success: true, data: await service.list(req.validatedQuery, { clientId, view: 'client' }) });
});

exports.myCarePlan = asyncHandler(async (req, res) => {
  const clientId = await service.clientIdForUser(req.user.id);
  const carePlan = clientId ? await require('../clients/clients.service').activePlan(clientId) : null;
  res.json({ success: true, data: { carePlan } });
});
