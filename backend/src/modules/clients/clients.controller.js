const asyncHandler = require('../../utils/asyncHandler');
const service = require('./clients.service');

exports.list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.validatedQuery) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { client: await service.getById(req.params.id) } });
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { client: await service.create(req.body) } });
});

exports.update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { client: await service.update(req.params.id, req.body) } });
});

exports.listPlans = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { carePlans: await service.listPlans(req.params.id) } });
});
exports.createPlan = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { carePlan: await service.createPlan(req.params.id, req.body, req.user.id) } });
});
exports.updatePlan = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { carePlan: await service.updatePlan(req.params.id, req.params.planId, req.body) } });
});
