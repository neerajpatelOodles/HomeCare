# Home-Care Central Control System – Backend (Phase 1)

Node.js + Express + PostgreSQL. Foundation for the Client, Staff and Admin portals.

## Quick start

```bash
cp .env.example .env        # set DATABASE_URL and a long random JWT_ACCESS_SECRET
createdb homecare_central   # or create the database any way you like
npm install
npm run db:setup            # runs migrations + seeds roles, permissions, first admin
npm run dev                 # http://localhost:5000
npm run test:smoke          # (with the server running) 43 end-to-end checks
```

Initial admin comes from `SEED_ADMIN_*` in `.env` (default `admin@homecare.local` / `Admin@12345`).
**Change this password before deploying.**

## Structure

```
src/
  config/        env + Postgres pool
  db/            migrate.js, seed.js, migrations/001_foundation.sql
  middleware/    authenticate, authorize (roles/permissions), validate, errorHandler
  modules/       one folder per feature: auth, users, dashboard, _template (for Phase 2)
  utils/         constants, ApiError, token helpers
  routes.js      central route registry
  app.js / server.js
scripts/smoke-test.js
```

## Database

| Table | Purpose |
|---|---|
| `roles` | `client`, `staff`, `admin` |
| `permissions`, `role_permissions` | Permission codes per role (login, dashboard access, user management) |
| `users` | email (case-insensitive unique), bcrypt hash, role, `is_active`, `last_login_at` |
| `profiles` | 1:1 with users: name, phone, DOB, address fields, avatar |
| `sessions` | Refresh sessions (SHA-256 hashed token, expiry, revoked flag) |
| `schema_migrations` | Applied migration files |

New modules add a numbered file in `src/db/migrations/` (see `src/modules/_template/README.md`).

## Authentication

- Password hashing: bcrypt (12 rounds).
- Login sets two **httpOnly** cookies: a 15-minute access JWT and a 7-day opaque refresh token (path `/api/auth`).
- `POST /api/auth/refresh` rotates the refresh token. Reusing an old one revokes all of that user's sessions.
- Each request re-checks the user in the DB, so deactivation or a role change applies immediately.
- `Authorization: Bearer <accessToken>` is also accepted (API clients / testing).
- Login is rate-limited (20 attempts / 15 min / IP).

## API

All responses: `{ success, data? , message?, errors? }`.

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` `{email,password}` → user + `redirectTo` | public |
| POST | `/api/auth/refresh` | refresh cookie |
| POST | `/api/auth/logout` | any |
| GET | `/api/auth/me` | logged in |
| GET | `/api/dashboard/client` | client only |
| GET | `/api/dashboard/staff` | staff only |
| GET | `/api/dashboard/admin` | admin only |
| GET | `/api/admin/users?role=&isActive=&search=&page=&limit=` | admin |
| POST | `/api/admin/users` | admin |
| GET | `/api/admin/users/:id` | admin |
| PATCH | `/api/admin/users/:id` (role, isActive, password, profile fields) | admin |
| GET | `/api/health` | public |

`redirectTo` values: `/client/dashboard`, `/staff/dashboard`, `/admin/dashboard`.

Dashboard endpoints return the placeholder text, e.g. `Welcome Client – Phase 1 Placeholder`.

## Decisions to confirm with the client

- **No self-registration.** Admins create client/staff accounts via `/api/admin/users`.
- Each portal dashboard is strictly separate (an admin does not get the client dashboard).
- Production: set `NODE_ENV=production` (secure, SameSite=None cookies, HTTPS required), a strong
  `JWT_ACCESS_SECRET`, and `CLIENT_ORIGIN` to the real frontend URL.
