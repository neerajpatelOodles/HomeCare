const { query, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const { APPLICANT_TRANSITIONS, REQUIRED_DOC_TYPES } = require('../../utils/constants');
const { paginationMeta, likePattern } = require('../../utils/schemas');
const documents = require('../documents/documents.service');
const notifications = require('../notifications/notifications.service');
const passwordTokens = require('../auth/passwordTokens');

const toDto = (r) => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  phone: r.phone,
  profession: r.profession,
  licenseNumber: r.license_number,
  yearsExperience: r.years_experience,
  city: r.city,
  region: r.region,
  coverNote: r.cover_note,
  status: r.status,
  rejectionReason: r.rejection_reason,
  hiredUserId: r.hired_user_id,
  appliedAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.document_count !== undefined && { documentCount: r.document_count }),
  ...(r.doc_types && { missingDocuments: REQUIRED_DOC_TYPES.filter((t) => !r.doc_types.includes(t)) }),
});

async function list({ status, profession, search, page, limit }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`a.status = $${params.length}`); }
  if (profession) { params.push(profession); where.push(`a.profession = $${params.length}`); }
  if (search) {
    params.push(likePattern(search));
    const n = params.length;
    where.push(`(a.first_name ILIKE $${n} OR a.last_name ILIKE $${n} OR a.email ILIKE $${n})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await query(`SELECT COUNT(*)::int AS n FROM applicants a ${whereSql}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT a.*, (SELECT COUNT(*)::int FROM documents d WHERE d.applicant_id = a.id) AS document_count,
            COALESCE((SELECT ARRAY_AGG(DISTINCT d.doc_type) FROM documents d WHERE d.applicant_id = a.id), '{}') AS doc_types
       FROM applicants a ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows.map(toDto), pagination: paginationMeta(total, page, limit) };
}

async function getById(id) {
  const { rows } = await query('SELECT * FROM applicants WHERE id = $1', [id]);
  if (!rows[0]) throw ApiError.notFound('Applicant not found');

  const [docs, notes, history] = await Promise.all([
    documents.listFor({ applicantId: id }),
    query(
      `SELECT n.id, n.body, n.created_at, p.first_name, p.last_name
         FROM applicant_notes n LEFT JOIN profiles p ON p.user_id = n.author_id
        WHERE n.applicant_id = $1 ORDER BY n.created_at DESC`,
      [id]
    ),
    query(
      `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at, p.first_name, p.last_name
         FROM applicant_status_history h LEFT JOIN profiles p ON p.user_id = h.changed_by
        WHERE h.applicant_id = $1 ORDER BY h.created_at DESC, h.id DESC`,
      [id]
    ),
  ]);

  const who = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || null;
  const have = docs.map((d) => d.docType);
  return {
    ...toDto({ ...rows[0], doc_types: have }),
    documents: docs,
    notes: notes.rows.map((n) => ({ id: n.id, body: n.body, author: who(n), createdAt: n.created_at })),
    history: history.rows.map((h) => ({
      id: h.id,
      from: h.from_status,
      to: h.to_status,
      note: h.note,
      changedBy: who(h),
      createdAt: h.created_at,
    })),
  };
}

async function changeStatus(id, to, { note, notifyApplicant = true, message }, actorId) {
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM applicants WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw ApiError.notFound('Applicant not found');
    const from = rows[0].status;

    if (from === to) throw ApiError.badRequest(`Applicant is already "${to}"`);
    if (!APPLICANT_TRANSITIONS[from].includes(to)) {
      const allowed = APPLICANT_TRANSITIONS[from].join(', ') || 'none';
      throw ApiError.badRequest(`Cannot move an applicant from "${from}" to "${to}". Allowed next steps: ${allowed}`);
    }

    await db.query('UPDATE applicants SET status = $1, rejection_reason = $2 WHERE id = $3', [
      to,
      to === 'rejected' ? note ?? null : null,
      id,
    ]);
    await db.query(
      `INSERT INTO applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, from, to, actorId, note ?? null]
    );
    if (notifyApplicant) {
      const a = rows[0];
      await notifications.queueApplicantStatus(db, id, { firstName: a.first_name, profession: a.profession, email: a.email }, to, message);
    }
  });
  return getById(id);
}

async function addNote(id, body, actorId) {
  const exists = await query('SELECT 1 FROM applicants WHERE id = $1', [id]);
  if (!exists.rowCount) throw ApiError.notFound('Applicant not found');
  await query('INSERT INTO applicant_notes (applicant_id, author_id, body) VALUES ($1, $2, $3)', [id, actorId, body]);
  return getById(id);
}

async function addDocument(id, file, docType, actorId) {
  if (!file) throw ApiError.badRequest('Attach a file in the "file" field');
  const exists = await query('SELECT 1 FROM applicants WHERE id = $1', [id]);
  if (!exists.rowCount) throw ApiError.notFound('Applicant not found');
  return documents.addOne({ file, docType, applicantId: id, uploadedBy: actorId });
}

/**
 * Turns an applicant who reached the "offer" stage into a caregiver:
 * creates the caregiver login + profile + caregiver profile, links the applicant's
 * documents to the new user, and marks the applicant as hired. All-or-nothing.
 */
async function hire(id, input, actorId) {
  const hash = await passwordTokens.unusablePasswordHash();

  const userId = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM applicants WHERE id = $1 FOR UPDATE', [id]);
    const a = rows[0];
    if (!a) throw ApiError.notFound('Applicant not found');
    if (a.status !== 'offer') {
      throw ApiError.badRequest(`Only applicants at the "offer" stage can be hired (this one is "${a.status}")`);
    }

    const taken = await db.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [a.email]);
    if (taken.rowCount) throw ApiError.conflict('A user with this email already exists');

    const user = await db.query(
      `INSERT INTO users (email, password_hash, role_id)
       VALUES (LOWER($1), $2, (SELECT id FROM roles WHERE name = 'caregiver')) RETURNING id`,
      [a.email, hash]
    );
    const uid = user.rows[0].id;

    await db.query('INSERT INTO profiles (user_id, first_name, last_name, phone) VALUES ($1, $2, $3, $4)', [
      uid,
      a.first_name,
      a.last_name,
      a.phone,
    ]);
    await db.query(
      `INSERT INTO caregiver_profiles
         (user_id, applicant_id, profession, license_number, license_expiry, hire_date,
          emergency_contact_name, emergency_contact_phone)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8)`,
      [
        uid,
        id,
        a.profession,
        input.licenseNumber ?? a.license_number,
        input.licenseExpiry ?? null,
        input.hireDate ?? null,
        input.emergencyContactName ?? null,
        input.emergencyContactPhone ?? null,
      ]
    );

    await db.query('UPDATE documents SET user_id = $1 WHERE applicant_id = $2', [uid, id]);
    await db.query('UPDATE applicants SET status = $1, hired_user_id = $2, rejection_reason = NULL WHERE id = $3', [
      'hired',
      uid,
      id,
    ]);
    await db.query(
      `INSERT INTO applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
       VALUES ($1, 'offer', 'hired', $2, 'Hired and caregiver account created')`,
      [id, actorId]
    );

    // The new caregiver chooses their own password through an emailed one-time link.
    const token = await passwordTokens.createInvite(db, uid);
    await notifications.queueInvite(db, { firstName: a.first_name, email: a.email, userId: uid }, token);
    return uid;
  });

  // Lazy require avoids a circular import (caregivers does not depend on applicants).
  const caregivers = require('../caregivers/caregivers.service');
  return { applicant: await getById(id), caregiver: await caregivers.getById(userId) };
}

module.exports = { list, getById, changeStatus, addNote, addDocument, hire };
