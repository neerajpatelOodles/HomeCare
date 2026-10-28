/**
 * Data behind the four portal dashboards. "Today" means today in the viewer's
 * time zone, passed as ?tz=Asia/Kolkata (defaults to UTC).
 */
const { query } = require('../../config/db');

const DAY_START = `(date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1)`;

const fullName = (a, b) => [a, b].filter(Boolean).join(' ');

const visitRow = (r) => ({
  id: r.id,
  status: r.status,
  serviceType: r.service_type,
  startAt: r.start_at,
  endAt: r.end_at,
  client: { id: r.client_id, name: fullName(r.client_first, r.client_last), address: r.client_address, city: r.client_city },
  caregiver: r.caregiver_id ? { id: r.caregiver_id, name: fullName(r.cg_first, r.cg_last) } : null,
});

const VISIT_SELECT = `
  SELECT v.id, v.status, v.service_type, v.start_at, v.end_at, v.client_id, v.caregiver_id,
         c.first_name AS client_first, c.last_name AS client_last,
         c.address_line1 AS client_address, c.city AS client_city,
         cp.first_name AS cg_first, cp.last_name AS cg_last
    FROM visits v
    JOIN clients c ON c.id = v.client_id
    LEFT JOIN profiles cp ON cp.user_id = v.caregiver_id`;

async function admin(tz) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE is_active) AS active_users,
       (SELECT COUNT(*)::int FROM applicants WHERE status NOT IN ('hired', 'rejected')) AS open_applicants,
       (SELECT COUNT(*)::int FROM caregiver_profiles WHERE employment_status = 'active') AS active_caregivers,
       (SELECT COUNT(*)::int FROM clients WHERE status = 'active') AS active_clients,
       (SELECT COUNT(*)::int FROM visits
         WHERE start_at >= ${DAY_START} AND start_at < ${DAY_START} + interval '1 day' AND status <> 'cancelled') AS visits_today,
       (SELECT COUNT(*)::int FROM visits
         WHERE status = 'scheduled' AND start_at >= NOW() AND start_at < NOW() + interval '7 days') AS visits_next_7_days,
       (SELECT COUNT(*)::int FROM visits
         WHERE status = 'scheduled' AND caregiver_id IS NULL AND start_at >= NOW()) AS unassigned_visits,
       (SELECT COUNT(*)::int FROM caregiver_profiles
         WHERE license_expiry IS NOT NULL AND license_expiry <= CURRENT_DATE + 30 AND employment_status <> 'inactive') AS licenses_expiring`,
    [tz]
  );
  const r = rows[0];
  return {
    stats: {
      activeUsers: r.active_users,
      openApplicants: r.open_applicants,
      activeCaregivers: r.active_caregivers,
      activeClients: r.active_clients,
      visitsToday: r.visits_today,
      visitsNext7Days: r.visits_next_7_days,
      unassignedVisits: r.unassigned_visits,
      licensesExpiring: r.licenses_expiring,
    },
  };
}

async function hr() {
  const [byStatus, byProfession, recent, expiring, certs] = await Promise.all([
    query('SELECT status, COUNT(*)::int AS n FROM applicants GROUP BY status'),
    query(`SELECT profession, COUNT(*)::int AS n FROM applicants WHERE status NOT IN ('hired', 'rejected') GROUP BY profession`),
    query(
      `SELECT id, first_name, last_name, profession, status, created_at
         FROM applicants ORDER BY created_at DESC LIMIT 5`
    ),
    query(
      `SELECT c.user_id, p.first_name, p.last_name, c.profession, c.license_expiry
         FROM caregiver_profiles c LEFT JOIN profiles p ON p.user_id = c.user_id
        WHERE c.license_expiry IS NOT NULL AND c.license_expiry <= CURRENT_DATE + 30 AND c.employment_status <> 'inactive'
        ORDER BY c.license_expiry LIMIT 10`
    ),
    query(
      `SELECT x.id, x.name, x.expires_on, c.user_id, p.first_name, p.last_name
         FROM caregiver_certifications x
         JOIN caregiver_profiles c ON c.user_id = x.user_id
         LEFT JOIN profiles p ON p.user_id = x.user_id
        WHERE x.expires_on IS NOT NULL AND x.expires_on <= CURRENT_DATE + 30 AND c.employment_status <> 'inactive'
        ORDER BY x.expires_on LIMIT 10`
    ),
  ]);

  const statuses = { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 };
  for (const r of byStatus.rows) statuses[r.status] = r.n;
  const professions = { RN: 0, RPN: 0, PSW: 0, RSW: 0 };
  for (const r of byProfession.rows) professions[r.profession] = r.n;

  return {
    applicantsByStatus: statuses,
    openApplicantsByProfession: professions,
    recentApplicants: recent.rows.map((r) => ({
      id: r.id,
      name: fullName(r.first_name, r.last_name),
      profession: r.profession,
      status: r.status,
      appliedAt: r.created_at,
    })),
    licensesExpiringSoon: expiring.rows.map((r) => ({
      caregiverId: r.user_id,
      name: fullName(r.first_name, r.last_name),
      profession: r.profession,
      licenseExpiry: r.license_expiry,
    })),
    certificationsExpiringSoon: certs.rows.map((r) => ({
      certificationId: r.id,
      caregiverId: r.user_id,
      caregiver: fullName(r.first_name, r.last_name),
      certification: r.name,
      expiresOn: r.expires_on,
    })),
  };
}

async function caregiver(userId, tz) {
  const [today, upcoming, month, profile] = await Promise.all([
    query(
      `${VISIT_SELECT}
        WHERE v.caregiver_id = $2 AND v.status <> 'cancelled'
          AND v.start_at >= ${DAY_START} AND v.start_at < ${DAY_START} + interval '1 day'
        ORDER BY v.start_at`,
      [tz, userId]
    ),
    query(
      `${VISIT_SELECT}
        WHERE v.caregiver_id = $2 AND v.status = 'scheduled'
          AND v.start_at >= ${DAY_START} + interval '1 day' AND v.start_at < ${DAY_START} + interval '8 days'
        ORDER BY v.start_at LIMIT 10`,
      [tz, userId]
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM visits
        WHERE caregiver_id = $2 AND status = 'completed'
          AND completed_at >= (date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1)`,
      [tz, userId]
    ),
    query(
      `SELECT profession, employment_status, license_expiry FROM caregiver_profiles WHERE user_id = $1`,
      [userId]
    ),
  ]);
  const p = profile.rows[0];
  return {
    todayVisits: today.rows.map(visitRow),
    upcomingVisits: upcoming.rows.map(visitRow),
    completedThisMonth: month.rows[0].n,
    caregiverProfile: p
      ? { profession: p.profession, employmentStatus: p.employment_status, licenseExpiry: p.license_expiry }
      : null,
  };
}

async function client(userId) {
  const c = await query('SELECT id, first_name, last_name, status FROM clients WHERE user_id = $1', [userId]);
  if (!c.rows[0]) {
    return { clientRecord: null, upcomingVisits: [], recentVisits: [], upcomingCount: 0 };
  }
  const clientId = c.rows[0].id;
  const [upcoming, recent, count] = await Promise.all([
    query(
      `${VISIT_SELECT} WHERE v.client_id = $1 AND v.status = 'scheduled' AND v.end_at >= NOW()
        ORDER BY v.start_at LIMIT 5`,
      [clientId]
    ),
    query(
      `${VISIT_SELECT} WHERE v.client_id = $1 AND v.status = 'completed' ORDER BY v.start_at DESC LIMIT 5`,
      [clientId]
    ),
    query(`SELECT COUNT(*)::int AS n FROM visits WHERE client_id = $1 AND status = 'scheduled' AND end_at >= NOW()`, [clientId]),
  ]);
  return {
    clientRecord: { id: clientId, name: fullName(c.rows[0].first_name, c.rows[0].last_name), status: c.rows[0].status },
    upcomingVisits: upcoming.rows.map(visitRow),
    recentVisits: recent.rows.map(visitRow),
    upcomingCount: count.rows[0].n,
  };
}

module.exports = { admin, hr, caregiver, client };
