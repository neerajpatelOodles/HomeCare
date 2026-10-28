const ApiError = require('../utils/ApiError');
const env = require('../config/env');

const notFound = (req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.details && { errors: err.details }),
    });
  }
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }
  // File upload problems (size, too many files, unexpected field)
  if (err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large (max ${env.storage.maxFileMb} MB)`
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Unexpected file field "${err.field}"`
          : 'Invalid file upload';
    return res.status(400).json({ success: false, message });
  }
  // PostgreSQL error codes
  if (err.code === '22P02') {
    return res.status(400).json({ success: false, message: 'Invalid identifier' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Record already exists' });
  }
  if (err.code === '23P01') {
    // exclusion_violation: caregiver double-booked
    return res.status(409).json({ success: false, message: 'The caregiver already has a visit during that time' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'A referenced record does not exist' });
  }
  console.error(err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(!env.isProd && { debug: err.message }),
  });
};

module.exports = { notFound, errorHandler };
