const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../../config/db');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

const SELECT = `
  SELECT u.id, u.email, u.is_active, u.last_login_at, u.created_at, r.name AS role,
         p.first_name, p.last_name, p.phone, p.date_of_birth, p.address_line1,
         p.address_line2, p.city, p.state, p.postal_code, p.country
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN profiles p ON p.user_id = u.id`;

const toDto = (r) => ({
  id: r.id,
  email: r.email,
  role: r.role,
  isActive: r.is_active,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
  profile: {
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    dateOfBirth: r.date_of_birth,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    city: r.city,
    state: r.state,
    postalCode: r.postal_code,
    country: r.country,
  },
});

// camelCase API field -> profiles column
const PROFILE_COLUMNS = {
  firstName: 'first_name',
  lastName: 'last_name',
  phone: 'phone',
  dateOfBirth: 'date_of_birth',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  city: 'city',
  state: 'state',
  postalCode: 'postal_code',
  country: 'country',
};

async function getById(id) {
  const { rows } = await query(`${SELECT} WHERE u.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('User not found');
  return toDto(rows[0]);
}

async function list({ role, isActive, search, page, limit }) {
  const where = [];
  const params = [];
  if (role) { params.push(role); where.push(`r.name = $${params.length}`); }
  if (isActive !== undefined) { params.push(isActive === 'true'); where.push(`u.is_active = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    where.push(`(u.email ILIKE $${n} OR p.first_name ILIKE $${n} OR p.last_name ILIKE $${n})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(
    `SELECT COUNT(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN profiles p ON p.user_id = u.id ${whereSql}`,
    params
  );
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `${SELECT} ${whereSql} ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const total = count.rows[0].total;
  return {
    items: rows.map(toDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function create(input) {
  const exists = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [input.email]);
  if (exists.rowCount) throw ApiError.conflict('A user with this email already exists');

  const hash = await bcrypt.hash(input.password, env.auth.bcryptRounds);
  const id = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, role_id)
       VALUES ($1, $2, (SELECT id FROM roles WHERE name = $3)) RETURNING id`,
      [input.email, hash, input.role]
    );
    const userId = rows[0].id;

    const cols = ['user_id'];
    const vals = [userId];
    for (const [key, col] of Object.entries(PROFILE_COLUMNS)) {
      if (input[key] !== undefined) { cols.push(col); vals.push(input[key]); }
    }
    await db.query(
      `INSERT INTO profiles (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
      vals
    );
    return userId;
  });
  return getById(id);
}

async function update(id, input, actingUserId) {
  await getById(id); // 404 if missing

  if (id === actingUserId && (input.isActive === false || (input.role && input.role !== 'admin'))) {
    throw ApiError.badRequest('You cannot deactivate or demote your own account');
  }

  await withTransaction(async (db) => {
    const userSets = [];
    const userVals = [];
    if (input.role) {
      userVals.push(input.role);
      userSets.push(`role_id = (SELECT id FROM roles WHERE name = $${userVals.length})`);
    }
    if (input.isActive !== undefined) {
      userVals.push(input.isActive);
      userSets.push(`is_active = $${userVals.length}`);
    }
    if (input.password) {
      userVals.push(await bcrypt.hash(input.password, env.auth.bcryptRounds));
      userSets.push(`password_hash = $${userVals.length}`);
    }
    if (userSets.length) {
      userVals.push(id);
      await db.query(`UPDATE users SET ${userSets.join(', ')} WHERE id = $${userVals.length}`, userVals);
    }

    const pSets = [];
    const pVals = [];
    for (const [key, col] of Object.entries(PROFILE_COLUMNS)) {
      if (input[key] !== undefined) { pVals.push(input[key]); pSets.push(`${col} = $${pVals.length}`); }
    }
    if (pSets.length) {
      pVals.push(id);
      await db.query(`UPDATE profiles SET ${pSets.join(', ')} WHERE user_id = $${pVals.length}`, pVals);
    }

    // Revoke sessions when access is removed or credentials/role change.
    if (input.isActive === false || input.password || input.role) {
      await db.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    }
  });
  return getById(id);
}

module.exports = { list, getById, create, update };
