const asyncHandler = require('../../utils/asyncHandler');
const service = require('./users.service');

exports.list = asyncHandler(async (req, res) => {
  const data = await service.list(req.validatedQuery);
  res.json({ success: true, data });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: await service.getById(req.params.id) } });
});

exports.create = asyncHandler(async (req, res) => {
  const user = await service.create(req.body);
  res.status(201).json({ success: true, data: { user } });
});

exports.update = asyncHandler(async (req, res) => {
  const user = await service.update(req.params.id, req.body, req.user.id, req.user.role);
  res.json({ success: true, data: { user } });
});
