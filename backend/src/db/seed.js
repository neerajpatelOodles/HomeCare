/**
 * Seeds roles, permissions, role->permission mapping and the default accounts
 * (admin, plus a default staff, caregiver, client and HR user unless SEED_DEFAULT_USERS=false).
 * Safe to run repeatedly (idempotent): existing accounts are never changed.
 */
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const { ROLES } = require('../utils/constants');

const ROLE_DEFS = [
  { name: ROLES.CLIENT, description: 'Care recipient / client portal user' },
  { name: ROLES.STAFF, description: 'Office staff portal user (read-only overview)' },
  { name: ROLES.CAREGIVER, description: 'Caregiver / field worker portal user' },
  { name: ROLES.ADMIN, description: 'Administrator with full system access' },
  { name: ROLES.HR, description: 'HR / recruitment portal user' },
];

const PERMISSION_DEFS = [
  { code: 'auth:login', description: 'Can log in' },
  { code: 'dashboard:client', description: 'Access client dashboard' },
  { code: 'dashboard:staff', description: 'Access office staff dashboard' },
  { code: 'dashboard:caregiver', description: 'Access caregiver dashboard' },
  { code: 'dashboard:admin', description: 'Access admin dashboard' },
  { code: 'users:read', description: 'List and view users' },
  { code: 'users:create', description: 'Create users' },
  { code: 'users:update', description: 'Update users (role, status, profile)' },
  { code: 'dashboard:hr', description: 'Access HR dashboard' },
  { code: 'applicants:read', description: 'View job applicants and their documents' },
  { code: 'applicants:write', description: 'Move applicants through stages, add notes, hire' },
  { code: 'caregivers:read', description: 'View caregivers and their documents' },
  { code: 'caregivers:write', description: 'Update caregivers, upload their documents' },
  { code: 'clients:read', description: 'View client records' },
  { code: 'clients:write', description: 'Create and update client records' },
  { code: 'visits:read', description: 'View all scheduled visits' },
  { code: 'visits:write', description: 'Schedule, reassign and cancel visits' },
  { code: 'visits:own', description: 'View own visits (caregiver or client)' },
];

const ROLE_PERMISSIONS = {
  [ROLES.CLIENT]: ['auth:login', 'dashboard:client', 'visits:own'],
  [ROLES.STAFF]: ['auth:login', 'dashboard:staff'],
  [ROLES.CAREGIVER]: ['auth:login', 'dashboard:caregiver', 'visits:own'],
  [ROLES.HR]: [
    'auth:login',
    'dashboard:hr',
    'users:read',
    'users:update',
    'applicants:read',
    'applicants:write',
    'caregivers:read',
    'caregivers:write',
  ],
  [ROLES.ADMIN]: [
    'auth:login',
    'dashboard:admin',
    'users:read',
    'users:create',
    'users:update',
    'applicants:read',
    'applicants:write',
    'caregivers:read',
    'caregivers:write',
    'clients:read',
    'clients:write',
    'visits:read',
    'visits:write',
  ],
};

/** Creates the user + profile if the email is not already taken. */
async function ensureUser(db, { role, email, password, firstName, lastName }) {
  const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rowCount > 0) {
    console.log(`${role} ${email} already exists - skipped.`);
    return;
  }
  const hash = await bcrypt.hash(password, env.auth.bcryptRounds);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, role_id)
     VALUES (LOWER($1), $2, (SELECT id FROM roles WHERE name = $3))
     RETURNING id`,
    [email, hash, role]
  );
  await db.query(
    'INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, $3)',
    [rows[0].id, firstName, lastName]
  );
  console.log(`Created default ${role}: ${email}`);
}

async function seed() {
  await withTransaction(async (db) => {
    for (const r of ROLE_DEFS) {
      await db.query(
        `INSERT INTO roles (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [r.name, r.description]
      );
    }
    for (const p of PERMISSION_DEFS) {
      await db.query(
        `INSERT INTO permissions (code, description) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
        [p.code, p.description]
      );
    }
    for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const code of codes) {
        await db.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT r.id, p.id FROM roles r, permissions p
           WHERE r.name = $1 AND p.code = $2
           ON CONFLICT DO NOTHING`,
          [role, code]
        );
      }
    }

    await ensureUser(db, { role: ROLES.ADMIN, ...env.seedAdmin });
    if (env.seedDefaultUsers) {
      await ensureUser(db, { role: ROLES.STAFF, ...env.seedStaff });
      await ensureUser(db, { role: ROLES.CAREGIVER, ...env.seedCaregiver });
      await ensureUser(db, { role: ROLES.CLIENT, ...env.seedClient });
      await ensureUser(db, { role: ROLES.HR, ...env.seedHr });
    }
  });
  console.log('Seed complete.');
}

if (require.main === module) {
  seed()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { seed };
