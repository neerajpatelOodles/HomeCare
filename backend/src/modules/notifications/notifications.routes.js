const router = require('express').Router();
const { z, page, limit } = require('../../utils/schemas');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./notifications.service');

// Mounted at /api/admin/notifications (admin only).
const listQuery = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  kind: z.string().trim().max(40).optional(),
  page,
  limit: limit(25, 100),
});

router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.validatedQuery) });
}));

// Runs one worker cycle immediately (queue due visit reminders + send what is pending).
router.post('/process', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.tick() });
}));

module.exports = router;
