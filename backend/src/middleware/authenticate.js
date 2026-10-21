const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');
const { COOKIES } = require('../utils/constants');

/**
 * Reads the access token (httpOnly cookie, or `Authorization: Bearer` for
 * API clients), verifies it, then loads the user + permissions fresh from the
 * DB so a deactivated user or changed role takes effect immediately.
 */
module.exports = asyncHandler(async (req, _res, next) => {
  let token = req.cookies?.[COOKIES.ACCESS];
  const header = req.headers.authorization;
  if (!token && header?.startsWith('Bearer ')) token = header.slice(7);
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Session expired or invalid');
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.is_active, r.name AS role,
            COALESCE(ARRAY_AGG(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id, r.name`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw ApiError.unauthorized('Account is not active');

  req.user = user;
  next();
});
