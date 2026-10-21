const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../../config/db');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { ROLE_HOME } = require('../../utils/constants');
const { signAccessToken, generateRefreshToken, hashToken } = require('../../utils/tokens');

// A real bcrypt hash of a random string, used to keep login timing similar
// whether or not the email exists (prevents user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.auth.bcryptRounds);

const refreshExpiry = () => new Date(Date.now() + env.auth.refreshTtlDays * 24 * 60 * 60 * 1000);

/** Shape returned to the frontend for any authenticated user. */
function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    redirectTo: ROLE_HOME[row.role],
    profile: {
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone ?? null,
    },
  };
}

const USER_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.is_active, r.name AS role,
         p.first_name, p.last_name, p.phone
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN profiles p ON p.user_id = u.id`;

async function createSession(client, userId, meta) {
  const { token, hash } = generateRefreshToken();
  await client.query(
    `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hash, meta.userAgent?.slice(0, 500) ?? null, meta.ip ?? null, refreshExpiry()]
  );
  return token;
}

async function login(email, password, meta) {
  const { rows } = await query(`${USER_SELECT} WHERE LOWER(u.email) = LOWER($1)`, [email]);
  const row = rows[0];

  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) throw ApiError.unauthorized('Invalid email or password');
  if (!row.is_active) throw ApiError.forbidden('Your account has been deactivated');

  const refreshToken = await withTransaction(async (db) => {
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.id]);
    return createSession(db, row.id, meta);
  });

  return {
    user: toPublicUser(row),
    accessToken: signAccessToken(row),
    refreshToken,
  };
}

async function register({ email, password, firstName, lastName, role = 'client' }, meta) {
  const exists = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (exists.rowCount) throw ApiError.conflict('A user with this email already exists');

  const hash = await bcrypt.hash(password, env.auth.bcryptRounds);

  const created = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, role_id)
       VALUES ($1, $2, (SELECT id FROM roles WHERE name = $3))
       RETURNING id`,
      [email, hash, role]
    );

    const userId = rows[0].id;
    await db.query(
      'INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, $3)',
      [userId, firstName, lastName]
    );

    const userResult = await db.query(`${USER_SELECT} WHERE u.id = $1`, [userId]);
    return { row: userResult.rows[0], userId };
  });

  const { row } = created;
  if (!row) throw new ApiError(500, 'Unable to create account');

  const refreshToken = await withTransaction(async (db) => {
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.id]);
    return createSession(db, row.id, meta);
  });

  return {
    user: toPublicUser(row),
    accessToken: signAccessToken(row),
    refreshToken,
  };
}

/** Rotate: the presented refresh token is revoked and a new one issued. */
async function refresh(presentedToken, meta) {
  if (!presentedToken) throw ApiError.unauthorized('No refresh token');
  const hash = hashToken(presentedToken);

  const outcome = await withTransaction(async (db) => {
    const { rows } = await db.query(
      'SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_token_hash = $1 FOR UPDATE',
      [hash]
    );
    const session = rows[0];
    if (!session) return { error: 'Invalid session' };

    if (session.revoked_at) {
      // Token reuse after rotation => likely stolen. Kill every session of this user.
      // (Returned, not thrown, so this UPDATE is committed instead of rolled back.)
      await db.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [session.user_id]);
      return { error: 'Session revoked, please log in again' };
    }
    if (new Date(session.expires_at) < new Date()) return { error: 'Session expired' };

    const userRes = await db.query(`${USER_SELECT} WHERE u.id = $1`, [session.user_id]);
    const row = userRes.rows[0];
    if (!row || !row.is_active) return { error: 'Account is not active' };

    await db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);
    const refreshToken = await createSession(db, row.id, meta);

    return { result: { user: toPublicUser(row), accessToken: signAccessToken(row), refreshToken } };
  });

  if (outcome.error) throw ApiError.unauthorized(outcome.error);
  return outcome.result;
}

async function logout(presentedToken) {
  if (!presentedToken) return;
  await query(
    'UPDATE sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1 AND revoked_at IS NULL',
    [hashToken(presentedToken)]
  );
}

async function getCurrentUser(userId) {
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [userId]);
  if (!rows[0]) throw ApiError.notFound('User not found');
  return toPublicUser(rows[0]);
}

module.exports = { login, register, refresh, logout, getCurrentUser, toPublicUser };
