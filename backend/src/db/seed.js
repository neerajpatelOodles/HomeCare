/**
 * Seeds roles, permissions, role->permission mapping and the first admin.
 * Safe to run repeatedly (idempotent).
 */
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { pool, withTransaction } = require('../config/db');
const { ROLES } = require('../utils/constants');

const ROLE_DEFS = [
  { name: ROLES.CLIENT, description: 'Care recipient / client portal user' },
  { name: ROLES.STAFF, description: 'Care staff / caregiver portal user' },
  { name: ROLES.ADMIN, description: 'Administrator with full system access' },
];

const PERMISSION_DEFS = [
  { code: 'auth:login', description: 'Can log in' },
  { code: 'dashboard:client', description: 'Access client dashboard' },
  { code: 'dashboard:staff', description: 'Access staff dashboard' },
  { code: 'dashboard:admin', description: 'Access admin dashboard' },
  { code: 'users:read', description: 'List and view users' },
  { code: 'users:create', description: 'Create users' },
  { code: 'users:update', description: 'Update users (role, status, profile)' },
];

const ROLE_PERMISSIONS = {
  [ROLES.CLIENT]: ['auth:login', 'dashboard:client'],
  [ROLES.STAFF]: ['auth:login', 'dashboard:staff'],
  [ROLES.ADMIN]: [
    'auth:login',
    'dashboard:admin',
    'users:read',
    'users:create',
    'users:update',
  ],
};

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

    const { email, password, firstName, lastName } = env.seedAdmin;
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(password, env.auth.bcryptRounds);
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, role_id)
         VALUES (LOWER($1), $2, (SELECT id FROM roles WHERE name = 'admin'))
         RETURNING id`,
        [email, hash]
      );
      await db.query(
        'INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, $3)',
        [rows[0].id, firstName, lastName]
      );
      console.log(`Created initial admin: ${email}`);
    } else {
      console.log(`Admin ${email} already exists - skipped.`);
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
