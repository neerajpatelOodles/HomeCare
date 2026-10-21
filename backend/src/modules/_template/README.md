# Module template

Copy this folder to `src/modules/<name>` for each new feature (appointments, tasks, notes, ...).

Each module follows the same 4-file layout:

- `<name>.routes.js`      – Express router, wires middleware + controller
- `<name>.controller.js`  – HTTP layer only (read req, call service, send res)
- `<name>.service.js`     – business logic + SQL
- `<name>.validation.js`  – zod schemas for body/query/params

Then:

1. Add `src/db/migrations/00N_<name>.sql` (reference `users(id)`; add `updated_at` + the
   `set_updated_at` trigger like in `001_foundation.sql`).
2. Add the permission codes (e.g. `appointments:read`) in `src/db/seed.js` and map them to roles.
3. Register the router in `src/routes.js`, guarded by `authenticate` and `authorizeRoles(...)`
   or `requirePermission(...)`.
