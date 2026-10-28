/**
 * Email outbox. enqueue() only writes a row (inside the caller's transaction),
 * processDue() is what actually sends. A mail outage therefore never fails or
 * rolls back the business action that triggered the email.
 */
const { pool, query } = require('../../config/db');
const env = require('../../config/env');
const mailer = require('./mailer');
const tpl = require('./templates');
const { paginationMeta } = require('../../utils/schemas');

/** Queue one email. A repeated dedupe_key is silently ignored (idempotent). */
async function enqueue(db, { to, subject, text, kind, relatedId = null, dedupeKey = null, sendAfter = null }) {
  if (!to) return;
  await db.query(
    `INSERT INTO notifications (to_email, subject, body_text, kind, related_id, dedupe_key, send_after)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [to, subject, text, kind, relatedId, dedupeKey, sendAfter]
  );
}

async function hrRecipients(db) {
  if (env.email.hrNotifyEmail) return env.email.hrNotifyEmail.split(',').map((s) => s.trim()).filter(Boolean);
  const { rows } = await db.query(
    `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'hr' AND u.is_active`
  );
  return rows.map((r) => r.email);
}

async function queueApplicationReceived(db, applicantId, a) {
  await enqueue(db, { to: a.email, ...tpl.applicationReceived(a), kind: 'application_received', relatedId: applicantId, dedupeKey: `app-received:${applicantId}` });
  for (const to of await hrRecipients(db)) {
    await enqueue(db, { to, ...tpl.hrNewApplication(a), kind: 'hr_new_application', relatedId: applicantId, dedupeKey: `hr-new:${applicantId}:${to}` });
  }
}

async function queueApplicantStatus(db, applicantId, a, status, message) {
  if (!tpl.hasStatusEmail(status)) return false;
  await enqueue(db, {
    to: a.email,
    ...tpl.applicantStatus(a, status, message),
    kind: 'applicant_status',
    relatedId: applicantId,
    dedupeKey: `app-status:${applicantId}:${status}:${Date.now()}`,
  });
  return true;
}

async function queueInvite(db, applicant, token) {
  const link = `${env.appUrl}/set-password?token=${token}`;
  await enqueue(db, {
    to: applicant.email,
    ...tpl.invite(applicant, link, env.email.inviteTtlHours),
    kind: 'caregiver_invite',
    relatedId: applicant.userId ?? null,
    dedupeKey: `invite:${applicant.userId}:${Date.now()}`,
  });
}

/** Cancelled visit: tell caregiver + client. Pending reminders for it are dropped. */
async function voidReminders(db, visitId) {
  await db.query(`UPDATE notifications SET status = 'failed', last_error = 'visit cancelled/changed' WHERE related_id = $1 AND kind = 'visit_reminder' AND status = 'pending'`, [visitId]);
}

async function queueVisitCancelled(db, visitId) {
  await voidReminders(db, visitId);
  const v = await visitInfo(db, visitId);
  if (!v) return;
  for (const to of [v.caregiverEmail, v.clientEmail].filter(Boolean)) {
    await enqueue(db, { to, ...tpl.visitCancelled(v), kind: 'visit_cancelled', relatedId: visitId, dedupeKey: `visit-cancelled:${visitId}:${to}` });
  }
}

async function visitInfo(db, visitId) {
  const { rows } = await db.query(
    `SELECT v.id, v.start_at, v.service_type,
            cu.email AS caregiver_email, cp.first_name AS cg_first, cp.last_name AS cg_last,
            c.first_name AS cl_first, c.last_name AS cl_last, COALESCE(c.email, lu.email) AS client_email,
            CONCAT_WS(', ', c.address_line1, c.city) AS address
       FROM visits v
       JOIN clients c ON c.id = v.client_id
       LEFT JOIN users cu ON cu.id = v.caregiver_id
       LEFT JOIN users lu ON lu.id = c.user_id
       LEFT JOIN profiles cp ON cp.user_id = v.caregiver_id
      WHERE v.id = $1`,
    [visitId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    startAt: r.start_at,
    serviceType: r.service_type,
    caregiverEmail: r.caregiver_email,
    caregiverFirstName: r.cg_first,
    caregiverName: [r.cg_first, r.cg_last].filter(Boolean).join(' ') || 'your caregiver',
    clientEmail: r.client_email,
    clientFirstName: r.cl_first,
    clientName: `${r.cl_first} ${r.cl_last}`,
    address: r.address || null,
  };
}

/**
 * Queue reminders for visits starting within the reminder window. Safe to run
 * repeatedly: dedupe keys include the visit start time, so a rescheduled visit
 * gets a fresh reminder and an unchanged one never gets two.
 */
async function queueDueReminders() {
  const { rows } = await query(
    `SELECT id, start_at FROM visits
      WHERE status = 'scheduled' AND caregiver_id IS NOT NULL
        AND start_at > NOW() AND start_at <= NOW() + make_interval(hours => $1)`,
    [env.email.reminderHoursBefore]
  );
  let queued = 0;
  for (const row of rows) {
    const v = await visitInfo(pool, row.id);
    const stamp = new Date(row.start_at).getTime();
    const targets = [
      [v.caregiverEmail, 'caregiver'],
      [v.clientEmail, 'client'],
    ];
    for (const [to, audience] of targets) {
      if (!to) continue;
      const res = await pool.query(
        `INSERT INTO notifications (to_email, subject, body_text, kind, related_id, dedupe_key)
         VALUES ($1, $2, $3, 'visit_reminder', $4, $5) ON CONFLICT (dedupe_key) DO NOTHING`,
        [to, tpl.visitReminder(v, audience).subject, tpl.visitReminder(v, audience).text, row.id, `reminder:${row.id}:${stamp}:${audience}`]
      );
      queued += res.rowCount;
    }
  }
  return queued;
}

/** Sends due emails. FOR UPDATE SKIP LOCKED lets several workers run without double-sending. */
async function processDue() {
  const client = await pool.connect();
  const out = { sent: 0, failed: 0, retrying: 0 };
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM notifications WHERE status = 'pending' AND send_after <= NOW()
        ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [env.email.worker.batchSize]
    );
    for (const n of rows) {
      try {
        await mailer.send({ to: n.to_email, subject: n.subject, text: n.body_text });
        await client.query(`UPDATE notifications SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, last_error = NULL WHERE id = $1`, [n.id]);
        out.sent += 1;
      } catch (err) {
        const attempts = n.attempts + 1;
        const dead = attempts >= env.email.worker.maxAttempts;
        // Exponential back-off: 1, 2, 4, 8 minutes...
        await client.query(
          `UPDATE notifications SET attempts = $2, last_error = $3, status = $4,
                  send_after = NOW() + make_interval(mins => $5) WHERE id = $1`,
          [n.id, attempts, String(err.message).slice(0, 500), dead ? 'failed' : 'pending', 2 ** (attempts - 1)]
        );
        dead ? (out.failed += 1) : (out.retrying += 1);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return out;
}

async function tick() {
  const reminders = await queueDueReminders();
  return { reminders, ...(await processDue()) };
}

/** Admin view: metadata only. Email bodies (which may contain links) are never exposed. */
async function list({ status, kind, page, limit }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await query(`SELECT COUNT(*)::int n FROM notifications ${w}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT id, to_email, subject, kind, status, attempts, last_error, send_after, sent_at, created_at
       FROM notifications ${w} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  return {
    items: rows.map((r) => ({ id: r.id, to: r.to_email, subject: r.subject, kind: r.kind, status: r.status, attempts: r.attempts, lastError: r.last_error, sendAfter: r.send_after, sentAt: r.sent_at, createdAt: r.created_at })),
    pagination: paginationMeta(total, page, limit),
  };
}

module.exports = { enqueue, queueApplicationReceived, queueApplicantStatus, queueInvite, queueVisitCancelled, voidReminders, queueDueReminders, processDue, tick, list };
