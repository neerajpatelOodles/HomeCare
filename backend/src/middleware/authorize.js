const ApiError = require('../utils/ApiError');

/** Allow only the listed roles: authorizeRoles('admin', 'staff') */
const authorizeRoles = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};

/** Require ALL listed permission codes: requirePermission('users:read') */
const requirePermission = (...codes) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const has = codes.every((c) => req.user.permissions.includes(c));
  if (!has) return next(ApiError.forbidden());
  next();
};

module.exports = { authorizeRoles, requirePermission };
