const { query, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const { paginationMeta, likePattern } = require('../../utils/schemas');
const documents = require('../documents/documents.service');
const notifications = require('../notifications/notifications.service');
const passwordTokens = require('../auth/passwordTokens');

const SELECT = `
  SELECT u.id, u.email, u.is_active, u.last_login_at,
         p.first_name, p.last_name, p.phone,
         c.applicant_id, c.profession, c.license_body, c.license_number, c.license_expiry, c.hire_date,
         c.employment_status, c.emergency_contact_name, c.emergency_contact_phone, c.notes,
         (SELECT COUNT(*)::int FROM visits v
           WHERE v.caregiver_id = u.id AND v.status = 'scheduled' AND v.start_at >= NOW()) AS upcoming_visits
    FROM caregiver_profiles c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN profiles p ON p.user_id = u.id`;

const toDto = (r) => ({
  id: r.id,
  email: r.email,
  isActive: r.is_active,
  lastLoginAt: r.last_login_at,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  applicantId: r.applicant_id,
  profession: r.profession,
  licenseBody: r.license_body,
  licenseNumber: r.license_number,
  licenseExpiry: r.license_expiry,
  hireDate: r.hire_date,
  employmentStatus: r.employment_status,
  emergencyContactName: r.emergency_contact_name,
  emergencyContactPhone: r.emergency_contact_phone,
  notes: r.notes,
  upcomingVisits: r.upcoming_visits,
});

async function list({ employmentStatus, profession, search, expiringWithinDays, page, limit }) {
  const where = [];
  const params = [];
  if (employmentStatus) { params.push(employmentStatus); where.push(`c.employment_status = $${params.length}`); }
  if (profession) { params.push(profession); where.push(`c.profession = $${params.length}`); }
  if (expiringWithinDays !== undefined) {
    params.push(expiringWithinDays);
    where.push(`c.license_expiry IS NOT NULL AND c.license_expiry <= CURRENT_DATE + $${params.length}::int`);
  }
  if (search) {
    params.push(likePattern(search));
    const n = params.length;
    where.push(`(u.email ILIKE $${n} OR p.first_name ILIKE $${n} OR p.last_name ILIKE $${n})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (
    await query(
      `SELECT COUNT(*)::int AS n FROM caregiver_profiles c JOIN users u ON u.id = c.user_id
         LEFT JOIN profiles p ON p.user_id = u.id ${whereSql}`,
      params
    )
  ).rows[0].n;
  const { rows } = await query(
    `${SELECT} ${whereSql} ORDER BY p.last_name, p.first_name
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return { items: rows.map(toDto), pagination: paginationMeta(total, page, limit) };
}

async function getById(id) {
  const { rows } = await query(`${SELECT} WHERE u.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Caregiver not found');
  return { ...toDto(rows[0]), ...(await details(id)), documents: await documents.listFor({ userId: id }) };
}

const hhmm = (t) => String(t).slice(0, 5);

/** Availability, service areas and certifications for one caregiver. */
async function details(id, db = { query }) {
  const [av, areas, certs] = await Promise.all([
    db.query('SELECT id, weekday, start_time, end_time FROM caregiver_availability WHERE user_id = $1 ORDER BY weekday, start_time', [id]),
    db.query('SELECT name FROM caregiver_service_areas WHERE user_id = $1 ORDER BY LOWER(name)', [id]),
    db.query('SELECT * FROM caregiver_certifications WHERE user_id = $1 ORDER BY expires_on NULLS LAST, name', [id]),
  ]);
  return {
    availability: av.rows.map((r) => ({ weekday: r.weekday, startTime: hhmm(r.start_time), endTime: hhmm(r.end_time) })),
    serviceAreas: areas.rows.map((r) => r.name),
    certifications: certs.rows.map(certDto),
  };
}

const certDto = (r) => ({
  id: r.id, name: r.name, issuer: r.issuer, issuedOn: r.issued_on, expiresOn: r.expires_on, documentId: r.document_id,
});

async function assertCaregiver(id, db = { query }) {
  const r = await db.query('SELECT 1 FROM caregiver_profiles WHERE user_id = $1', [id]);
  if (!r.rowCount) throw ApiError.notFound('Caregiver not found');
}

/** Replaces the whole weekly schedule. Windows on the same weekday may not overlap. */
async function setAvailability(id, windows) {
  await assertCaregiver(id);
  const byDay = {};
  for (const w of windows) (byDay[w.weekday] ||= []).push(w);
  for (const list of Object.values(byDay)) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].startTime < list[i - 1].endTime) throw ApiError.badRequest('Availability windows on the same day overlap');
    }
  }
  await withTransaction(async (db) => {
    await db.query('DELETE FROM caregiver_availability WHERE user_id = $1', [id]);
    for (const w of windows) {
      await db.query('INSERT INTO caregiver_availability (user_id, weekday, start_time, end_time) VALUES ($1, $2, $3, $4)', [id, w.weekday, w.startTime, w.endTime]);
    }
  });
  return (await details(id)).availability;
}

async function setServiceAreas(id, names) {
  await assertCaregiver(id);
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
  await withTransaction(async (db) => {
    await db.query('DELETE FROM caregiver_service_areas WHERE user_id = $1', [id]);
    for (const n of unique) await db.query('INSERT INTO caregiver_service_areas (user_id, name) VALUES ($1, $2)', [id, n]);
  });
  return (await details(id)).serviceAreas;
}

async function checkDocOwner(db, documentId, userId) {
  if (!documentId) return;
  const r = await db.query('SELECT 1 FROM documents WHERE id = $1 AND user_id = $2', [documentId, userId]);
  if (!r.rowCount) throw ApiError.badRequest('That document does not belong to this caregiver');
}

async function addCertification(id, input) {
  await assertCaregiver(id);
  await checkDocOwner({ query }, input.documentId, id);
  const { rows } = await query(
    `INSERT INTO caregiver_certifications (user_id, name, issuer, issued_on, expires_on, document_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, input.name, input.issuer ?? null, input.issuedOn ?? null, input.expiresOn ?? null, input.documentId ?? null]
  );
  return certDto(rows[0]);
}

async function updateCertification(id, certId, input) {
  const cur = (await query('SELECT * FROM caregiver_certifications WHERE id = $1 AND user_id = $2', [certId, id])).rows[0];
  if (!cur) throw ApiError.notFound('Certification not found');
  await checkDocOwner({ query }, input.documentId, id);
  const pick = (k, col) => (input[k] !== undefined ? input[k] : cur[col]);
  const { rows } = await query(
    `UPDATE caregiver_certifications SET name = $1, issuer = $2, issued_on = $3, expires_on = $4, document_id = $5
      WHERE id = $6 RETURNING *`,
    [pick('name', 'name'), pick('issuer', 'issuer'), pick('issuedOn', 'issued_on'), pick('expiresOn', 'expires_on'), pick('documentId', 'document_id'), certId]
  );
  return certDto(rows[0]);
}

async function removeCertification(id, certId) {
  const r = await query('DELETE FROM caregiver_certifications WHERE id = $1 AND user_id = $2', [certId, id]);
  if (!r.rowCount) throw ApiError.notFound('Certification not found');
}

/** HR can re-send the set-password email if the link expired or was lost (only before the first login). */
async function resendInvite(id) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.last_login_at, p.first_name FROM users u
       JOIN caregiver_profiles c ON c.user_id = u.id LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [id]
  );
  const u = rows[0];
  if (!u) throw ApiError.notFound('Caregiver not found');
  if (u.last_login_at) throw ApiError.badRequest('This caregiver has already signed in; no invite is needed');
  await withTransaction(async (db) => {
    const token = await passwordTokens.createInvite(db, id);
    await notifications.queueInvite(db, { firstName: u.first_name, email: u.email, userId: id }, token);
  });
}

const PROFILE_COLS = { firstName: 'first_name', lastName: 'last_name', phone: 'phone' };
const CAREGIVER_COLS = {
  profession: 'profession',
  licenseBody: 'license_body',
  licenseNumber: 'license_number',
  licenseExpiry: 'license_expiry',
  employmentStatus: 'employment_status',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  notes: 'notes',
};

function buildSet(input, map) {
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(map)) {
    if (input[key] !== undefined) {
      vals.push(input[key]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  return { sets, vals };
}

async function update(id, input) {
  const exists = await query('SELECT 1 FROM caregiver_profiles WHERE user_id = $1', [id]);
  if (!exists.rowCount) throw ApiError.notFound('Caregiver not found');

  await withTransaction(async (db) => {
    const p = buildSet(input, PROFILE_COLS);
    if (p.sets.length) {
      await db.query(`UPDATE profiles SET ${p.sets.join(', ')} WHERE user_id = $${p.vals.length + 1}`, [...p.vals, id]);
    }
    const c = buildSet(input, CAREGIVER_COLS);
    if (c.sets.length) {
      await db.query(
        `UPDATE caregiver_profiles SET ${c.sets.join(', ')} WHERE user_id = $${c.vals.length + 1}`,
        [...c.vals, id]
      );
    }
    // Employment status controls the login: "inactive" locks the caregiver out
    // immediately; "active" and "on_leave" keep the account usable.
    if (input.employmentStatus) {
      const active = input.employmentStatus !== 'inactive';
      await db.query('UPDATE users SET is_active = $1 WHERE id = $2', [active, id]);
      if (!active) {
        await db.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      }
    }
  });
  return getById(id);
}

async function addDocument(id, file, docType, actorId) {
  if (!file) throw ApiError.badRequest('Attach a file in the "file" field');
  const exists = await query('SELECT 1 FROM caregiver_profiles WHERE user_id = $1', [id]);
  if (!exists.rowCount) throw ApiError.notFound('Caregiver not found');
  return documents.addOne({ file, docType, userId: id, uploadedBy: actorId });
}

module.exports = { list, getById, details, update, addDocument, setAvailability, setServiceAreas, addCertification, updateCertification, removeCertification, resendInvite };
