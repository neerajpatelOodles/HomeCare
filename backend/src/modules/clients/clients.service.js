const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../../config/db');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { paginationMeta, likePattern } = require('../../utils/schemas');

const SELECT = `
  SELECT c.*, u.email AS login_email, u.is_active AS login_active
    FROM clients c LEFT JOIN users u ON u.id = c.user_id`;

const toDto = (r) => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  phone: r.phone,
  dateOfBirth: r.date_of_birth,
  addressLine1: r.address_line1,
  addressLine2: r.address_line2,
  city: r.city,
  region: r.region,
  postalCode: r.postal_code,
  careNeeds: r.care_needs,
  emergencyContactName: r.emergency_contact_name,
  emergencyContactPhone: r.emergency_contact_phone,
  notes: r.notes,
  status: r.status,
  hasLogin: !!r.user_id,
  userId: r.user_id,
  loginEmail: r.login_email ?? null,
  createdAt: r.created_at,
});

const COLS = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  status: 'status',
  phone: 'phone',
  dateOfBirth: 'date_of_birth',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  city: 'city',
  region: 'region',
  postalCode: 'postal_code',
  careNeeds: 'care_needs',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  notes: 'notes',
  userId: 'user_id',
};

async function getById(id) {
  const { rows } = await query(`${SELECT} WHERE c.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Client not found');
  return { ...toDto(rows[0]), carePlan: await activePlan(id) };
}

async function list({ status, search, page, limit }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
  if (search) {
    params.push(likePattern(search));
    const n = params.length;
    where.push(`(c.first_name ILIKE $${n} OR c.last_name ILIKE $${n} OR c.email ILIKE $${n} OR c.phone ILIKE $${n})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await query(`SELECT COUNT(*)::int AS n FROM clients c ${whereSql}`, params)).rows[0].n;
  const { rows } = await query(
    `${SELECT} ${whereSql} ORDER BY LOWER(c.last_name), LOWER(c.first_name)
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows.map(toDto), pagination: paginationMeta(total, page, limit) };
}

/** Make sure `userId` is an existing client-role user that no other client record uses. */
async function assertLinkable(db, userId, exceptClientId = null) {
  const { rows } = await db.query(
    `SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId]
  );
  if (!rows[0]) throw ApiError.badRequest('That login user does not exist');
  if (rows[0].role !== 'client') throw ApiError.badRequest('Only users with the "client" role can be linked to a client record');
  const used = await db.query('SELECT id FROM clients WHERE user_id = $1 AND id IS DISTINCT FROM $2', [userId, exceptClientId]);
  if (used.rowCount) throw ApiError.conflict('That login is already linked to another client');
}

async function create(input) {
  const { login, userId, ...fields } = input;
  const passwordHash = login ? await bcrypt.hash(login.password, env.auth.bcryptRounds) : null;

  const id = await withTransaction(async (db) => {
    let linkedUserId = userId ?? null;

    if (login) {
      const taken = await db.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [login.email]);
      if (taken.rowCount) throw ApiError.conflict('A user with this login email already exists');
      const u = await db.query(
        `INSERT INTO users (email, password_hash, role_id)
         VALUES ($1, $2, (SELECT id FROM roles WHERE name = 'client')) RETURNING id`,
        [login.email, passwordHash]
      );
      linkedUserId = u.rows[0].id;
      await db.query('INSERT INTO profiles (user_id, first_name, last_name, phone) VALUES ($1, $2, $3, $4)', [
        linkedUserId,
        fields.firstName,
        fields.lastName,
        fields.phone ?? null,
      ]);
    } else if (userId) {
      await assertLinkable(db, userId);
    }

    const cols = ['user_id'];
    const vals = [linkedUserId];
    for (const [key, col] of Object.entries(COLS)) {
      if (key !== 'userId' && fields[key] !== undefined) {
        cols.push(col);
        vals.push(fields[key]);
      }
    }
    const { rows } = await db.query(
      `INSERT INTO clients (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      vals
    );
    return rows[0].id;
  });
  return getById(id);
}

async function update(id, input) {
  await getById(id);
  await withTransaction(async (db) => {
    if (input.userId) await assertLinkable(db, input.userId, id);
    const sets = [];
    const vals = [];
    for (const [key, col] of Object.entries(COLS)) {
      if (input[key] !== undefined) {
        vals.push(input[key]);
        sets.push(`${col} = $${vals.length}`);
      }
    }
    if (sets.length) {
      await db.query(`UPDATE clients SET ${sets.join(', ')} WHERE id = $${vals.length + 1}`, [...vals, id]);
    }
  });
  return getById(id);
}

// ---------------------------------------------------------------- care plans
const planDto = (r) => ({
  id: r.id, clientId: r.client_id, title: r.title, summary: r.summary, goals: r.goals,
  dailyTasks: r.daily_tasks, precautions: r.precautions, startDate: r.start_date,
  reviewDate: r.review_date, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
});

async function activePlan(clientId, db = { query }) {
  const { rows } = await db.query(`SELECT * FROM care_plans WHERE client_id = $1 AND status = 'active'`, [clientId]);
  return rows[0] ? planDto(rows[0]) : null;
}

async function listPlans(clientId) {
  await getById(clientId);
  const { rows } = await query('SELECT * FROM care_plans WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
  return rows.map(planDto);
}

/** Creating a plan archives the previous active one, so history is kept and only one is ever active. */
async function createPlan(clientId, input, actorId) {
  await getById(clientId);
  return withTransaction(async (db) => {
    await db.query(`UPDATE care_plans SET status = 'archived' WHERE client_id = $1 AND status = 'active'`, [clientId]);
    const { rows } = await db.query(
      `INSERT INTO care_plans (client_id, title, summary, goals, daily_tasks, precautions, start_date, review_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [clientId, input.title, input.summary ?? null, input.goals ?? null, input.dailyTasks ?? null,
       input.precautions ?? null, input.startDate ?? null, input.reviewDate ?? null, actorId]
    );
    return planDto(rows[0]);
  });
}

const PLAN_COLS = { title: 'title', summary: 'summary', goals: 'goals', dailyTasks: 'daily_tasks', precautions: 'precautions', startDate: 'start_date', reviewDate: 'review_date' };

async function updatePlan(clientId, planId, input) {
  const cur = (await query('SELECT * FROM care_plans WHERE id = $1 AND client_id = $2', [planId, clientId])).rows[0];
  if (!cur) throw ApiError.notFound('Care plan not found');
  if (cur.status !== 'active') throw ApiError.badRequest('Archived care plans are read-only. Create a new plan instead.');
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(PLAN_COLS)) {
    if (input[key] !== undefined) { vals.push(input[key]); sets.push(`${col} = $${vals.length}`); }
  }
  const { rows } = await query(`UPDATE care_plans SET ${sets.join(', ')} WHERE id = $${vals.length + 1} RETURNING *`, [...vals, planId]);
  return planDto(rows[0]);
}

module.exports = { list, getById, create, update, activePlan, listPlans, createPlan, updatePlan };
