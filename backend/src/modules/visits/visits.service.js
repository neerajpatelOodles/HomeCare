const { query, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const { paginationMeta } = require('../../utils/schemas');
const notifications = require('../notifications/notifications.service');
const clientsService = require('../clients/clients.service');

const SELECT = `
  SELECT v.*,
         c.first_name AS client_first, c.last_name AS client_last,
         c.address_line1 AS client_address, c.city AS client_city, c.phone AS client_phone,
         cp.first_name AS cg_first, cp.last_name AS cg_last
    FROM visits v
    JOIN clients c ON c.id = v.client_id
    LEFT JOIN profiles cp ON cp.user_id = v.caregiver_id`;

const fullName = (a, b) => [a, b].filter(Boolean).join(' ');

// view: 'admin' | 'caregiver' | 'client'. Clients never see internal instructions or caregiver notes.
const toDto = (r, view = 'admin') => ({
  id: r.id,
  status: r.status,
  serviceType: r.service_type,
  startAt: r.start_at,
  endAt: r.end_at,
  ...(view !== 'client' && { instructions: r.instructions }),
  cancelReason: r.cancel_reason,
  completedAt: r.completed_at,
  client: {
    id: r.client_id,
    name: fullName(r.client_first, r.client_last),
    address: r.client_address,
    city: r.client_city,
    ...(view !== 'client' && { phone: r.client_phone }),
  },
  caregiver: r.caregiver_id ? { id: r.caregiver_id, name: fullName(r.cg_first, r.cg_last) } : null,
  createdAt: r.created_at,
});

async function getById(id, view = 'admin') {
  const { rows } = await query(`${SELECT} WHERE v.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Visit not found');
  return toDto(rows[0], view);
}

async function notesFor(visitId) {
  const { rows } = await query(
    `SELECT n.id, n.body, n.created_at, n.author_id, p.first_name, p.last_name
       FROM visit_notes n LEFT JOIN profiles p ON p.user_id = n.author_id
      WHERE n.visit_id = $1 ORDER BY n.created_at, n.id`,
    [visitId]
  );
  return rows.map((n) => ({ id: n.id, body: n.body, author: fullName(n.first_name, n.last_name) || null, createdAt: n.created_at }));
}

/** Admin detail: the visit plus every caregiver note. */
async function getDetail(id) {
  return { ...(await getById(id)), notes: await notesFor(id) };
}

/**
 * Caregiver detail: everything needed to do the visit (client care needs,
 * emergency contact, active care plan) and the notes written so far.
 * Only the assigned caregiver can open it.
 */
async function getForCaregiver(id, caregiverId) {
  const { rows } = await query(`${SELECT} WHERE v.id = $1 AND v.caregiver_id = $2`, [id, caregiverId]);
  if (!rows[0]) throw ApiError.notFound('Visit not found');
  const c = (await query('SELECT * FROM clients WHERE id = $1', [rows[0].client_id])).rows[0];
  return {
    ...toDto(rows[0], 'caregiver'),
    notes: await notesFor(id),
    clientDetails: {
      careNeeds: c.care_needs,
      notes: c.notes,
      addressLine1: c.address_line1,
      addressLine2: c.address_line2,
      city: c.city,
      region: c.region,
      postalCode: c.postal_code,
      emergencyContactName: c.emergency_contact_name,
      emergencyContactPhone: c.emergency_contact_phone,
    },
    carePlan: await clientsService.activePlan(rows[0].client_id),
  };
}

/**
 * Shared list builder. `scope` pins the list to one caregiver or one client
 * (used by the caregiver/client portals so they can never see anyone else's visits).
 */
async function list(filters, scope = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  if (scope.caregiverId) add('v.caregiver_id = ?', scope.caregiverId);
  if (scope.clientId) add('v.client_id = ?', scope.clientId);
  if (filters.caregiverId) add('v.caregiver_id = ?', filters.caregiverId);
  if (filters.clientId) add('v.client_id = ?', filters.clientId);
  if (filters.status) add('v.status = ?', filters.status);
  if (filters.unassigned === 'true') where.push('v.caregiver_id IS NULL');
  // A visit is in range when it overlaps [from, to).
  if (filters.from) add('v.end_at > ?', filters.from);
  if (filters.to) add('v.start_at < ?', filters.to);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await query(`SELECT COUNT(*)::int AS n FROM visits v ${whereSql}`, params)).rows[0].n;
  const { rows } = await query(
    `${SELECT} ${whereSql} ORDER BY v.start_at, v.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.limit, (filters.page - 1) * filters.limit]
  );
  return { items: rows.map((r) => toDto(r, scope.view || 'admin')), pagination: paginationMeta(total, filters.page, filters.limit) };
}

/** Caregiver must be an active caregiver user, and if they have a caregiver profile it must be "active". */
async function assertCaregiverBookable(db, caregiverId) {
  const { rows } = await db.query(
    `SELECT u.is_active, r.name AS role, cp.employment_status
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN caregiver_profiles cp ON cp.user_id = u.id
      WHERE u.id = $1`,
    [caregiverId]
  );
  const c = rows[0];
  if (!c || c.role !== 'caregiver') throw ApiError.badRequest('The selected caregiver does not exist');
  if (!c.is_active) throw ApiError.badRequest('That caregiver account is inactive');
  if (c.employment_status && c.employment_status !== 'active') {
    throw ApiError.badRequest(`That caregiver is not available (status: ${c.employment_status})`);
  }
}

const assertTimes = (start, end) => {
  if (!(end > start)) throw ApiError.badRequest('End time must be after start time');
  if (end - start > 24 * 60 * 60 * 1000) throw ApiError.badRequest('A visit cannot be longer than 24 hours');
};

/**
 * Soft checks that never block scheduling (the admin decides): returns human-readable warnings
 * when the visit falls outside the caregiver's stated availability or service area.
 */
async function warningsFor(db, caregiverId, clientId, start, end) {
  if (!caregiverId) return [];
  const warnings = [];
  const { rows } = await db.query(
    `SELECT (s::date = e::date) AS same_day,
            EXISTS (SELECT 1 FROM caregiver_availability a WHERE a.user_id = $1) AS has_any,
            EXISTS (SELECT 1 FROM caregiver_availability a
                     WHERE a.user_id = $1 AND a.weekday = EXTRACT(DOW FROM s)::int
                       AND a.start_time <= s::time AND a.end_time >= e::time) AS covered
       FROM (SELECT $2::timestamptz AT TIME ZONE $4 AS s, $3::timestamptz AT TIME ZONE $4 AS e) t`,
    [caregiverId, start, end, env.appTimezone]
  );
  const a = rows[0];
  if (a.has_any && (!a.same_day || !a.covered)) warnings.push("This visit is outside the caregiver's stated availability");

  const areas = await db.query('SELECT LOWER(name) AS n FROM caregiver_service_areas WHERE user_id = $1', [caregiverId]);
  if (areas.rowCount) {
    const c = (await db.query('SELECT city, postal_code FROM clients WHERE id = $1', [clientId])).rows[0];
    const hay = [c.city, c.postal_code].filter(Boolean).map((x) => x.toLowerCase());
    const match = areas.rows.some(({ n }) => hay.some((h) => h === n || h.startsWith(n)));
    if (!match) warnings.push("The client's location is outside the caregiver's service areas");
  }
  return warnings;
}

async function create(input, actorId) {
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  assertTimes(start, end);

  const { id, warnings } = await withTransaction(async (db) => {
    const client = await db.query('SELECT status FROM clients WHERE id = $1', [input.clientId]);
    if (!client.rows[0]) throw ApiError.badRequest('The selected client does not exist');
    if (client.rows[0].status !== 'active') throw ApiError.badRequest('Visits can only be scheduled for active clients');
    if (input.caregiverId) await assertCaregiverBookable(db, input.caregiverId);

    // A database constraint also blocks overlaps (-> 409); this friendlier check explains why.
    if (input.caregiverId) await assertNoOverlap(db, input.caregiverId, start, end);

    const { rows } = await db.query(
      `INSERT INTO visits (client_id, caregiver_id, service_type, start_at, end_at, instructions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.clientId, input.caregiverId ?? null, input.serviceType, start, end, input.instructions ?? null, actorId]
    );
    return { id: rows[0].id, warnings: await warningsFor(db, input.caregiverId, input.clientId, start, end) };
  });
  return { visit: await getById(id), warnings };
}

async function assertNoOverlap(db, caregiverId, start, end, exceptVisitId = null) {
  const { rows } = await db.query(
    `SELECT v.start_at, v.end_at FROM visits v
      WHERE v.caregiver_id = $1 AND v.status IN ('scheduled', 'completed')
        AND tstzrange(v.start_at, v.end_at) && tstzrange($2::timestamptz, $3::timestamptz)
        AND v.id IS DISTINCT FROM $4
      LIMIT 1`,
    [caregiverId, start, end, exceptVisitId]
  );
  if (rows[0]) throw ApiError.conflict('The caregiver already has a visit during that time');
}

async function update(id, input) {
  const warnings = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM visits WHERE id = $1 FOR UPDATE', [id]);
    const v = rows[0];
    if (!v) throw ApiError.notFound('Visit not found');
    if (v.status !== 'scheduled') throw ApiError.badRequest(`Only scheduled visits can be changed (this one is "${v.status}")`);

    const start = input.startAt ? new Date(input.startAt) : v.start_at;
    const end = input.endAt ? new Date(input.endAt) : v.end_at;
    assertTimes(start, end);

    const caregiverId = input.caregiverId !== undefined ? input.caregiverId : v.caregiver_id;
    if (caregiverId) {
      if (input.caregiverId) await assertCaregiverBookable(db, caregiverId);
      await assertNoOverlap(db, caregiverId, start, end, id);
    }

    await db.query(
      `UPDATE visits SET caregiver_id = $1, start_at = $2, end_at = $3, service_type = $4, instructions = $5 WHERE id = $6`,
      [
        caregiverId,
        start,
        end,
        input.serviceType ?? v.service_type,
        input.instructions !== undefined ? input.instructions : v.instructions,
        id,
      ]
    );
    // A moved or re-assigned visit must not keep a reminder for the old slot.
    if (start.getTime() !== v.start_at.getTime() || caregiverId !== v.caregiver_id) {
      await notifications.voidReminders(db, id);
    }
    return warningsFor(db, caregiverId, v.client_id, start, end);
  });
  return { visit: await getById(id), warnings };
}

async function cancel(id, reason) {
  const done = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE visits SET status = 'cancelled', cancel_reason = $2
        WHERE id = $1 AND status = 'scheduled' RETURNING start_at`,
      [id, reason ?? null]
    );
    if (!rows[0]) return false;
    if (rows[0].start_at > new Date()) await notifications.queueVisitCancelled(db, id);
    return true;
  });
  if (!done) await explainNoChange(id, 'cancelled');
  return getById(id);
}

async function markMissed(id) {
  const { rowCount } = await query(
    `UPDATE visits SET status = 'missed' WHERE id = $1 AND status = 'scheduled' AND start_at < NOW()`,
    [id]
  );
  if (!rowCount) {
    const v = await getById(id); // 404 if missing
    if (v.status === 'scheduled') throw ApiError.badRequest('A visit can only be marked missed after its start time');
    throw ApiError.badRequest(`Only scheduled visits can be marked missed (this one is "${v.status}")`);
  }
  return getById(id);
}

async function explainNoChange(id, action) {
  const v = await getById(id); // 404 if missing
  throw ApiError.badRequest(`A visit that is "${v.status}" cannot be ${action}`);
}

/**
 * Caregiver marks a visit completed (no clock-in/out). Allowed once the visit has
 * begun, only for their own scheduled visits. An optional note is saved with it.
 */
async function complete(id, caregiverId, note) {
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM visits WHERE id = $1 AND caregiver_id = $2 FOR UPDATE', [id, caregiverId]);
    const v = rows[0];
    if (!v) throw ApiError.notFound('Visit not found');
    if (v.status !== 'scheduled') throw ApiError.badRequest(`Only scheduled visits can be completed (this one is "${v.status}")`);
    if (v.start_at.getTime() > Date.now()) throw ApiError.badRequest('This visit has not started yet');

    await db.query(`UPDATE visits SET status = 'completed', completed_at = NOW() WHERE id = $1`, [id]);
    if (note) await db.query('INSERT INTO visit_notes (visit_id, author_id, body) VALUES ($1, $2, $3)', [id, caregiverId, note]);
  });
  return getForCaregiver(id, caregiverId);
}

/** Caregiver adds a note to one of their own visits (scheduled or completed; not cancelled/missed). */
async function addNote(id, caregiverId, body) {
  const { rows } = await query('SELECT status FROM visits WHERE id = $1 AND caregiver_id = $2', [id, caregiverId]);
  if (!rows[0]) throw ApiError.notFound('Visit not found');
  if (!['scheduled', 'completed'].includes(rows[0].status)) {
    throw ApiError.badRequest(`Notes cannot be added to a "${rows[0].status}" visit`);
  }
  await query('INSERT INTO visit_notes (visit_id, author_id, body) VALUES ($1, $2, $3)', [id, caregiverId, body]);
  return getForCaregiver(id, caregiverId);
}

/** The client record that belongs to a logged-in client user (or null). */
async function clientIdForUser(userId) {
  const { rows } = await query('SELECT id FROM clients WHERE user_id = $1', [userId]);
  return rows[0]?.id ?? null;
}

/** Dropdown data for the scheduling screen. */
async function options() {
  const [caregivers, clients] = await Promise.all([
    query(
      `SELECT u.id, p.first_name, p.last_name, cp.profession, cp.employment_status
         FROM users u
         JOIN roles r ON r.id = u.role_id AND r.name = 'caregiver'
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN caregiver_profiles cp ON cp.user_id = u.id
        WHERE u.is_active AND COALESCE(cp.employment_status, 'active') = 'active'
        ORDER BY p.last_name, p.first_name`
    ),
    query(`SELECT id, first_name, last_name FROM clients WHERE status = 'active' ORDER BY last_name, first_name`),
  ]);
  return {
    caregivers: caregivers.rows.map((r) => ({
      id: r.id,
      name: fullName(r.first_name, r.last_name),
      profession: r.profession,
    })),
    clients: clients.rows.map((r) => ({ id: r.id, name: fullName(r.first_name, r.last_name) })),
  };
}

module.exports = { list, getById, getDetail, getForCaregiver, create, update, cancel, markMissed, complete, addNote, clientIdForUser, options };
