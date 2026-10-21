# Home-Care Central – Frontend (Phase 1)

Next.js (App Router) + React. One app, three portals: Client, Staff, Admin.

## Run

Start the backend first (port 5000), then:

```bash
cp .env.example .env     # BACKEND_URL=http://localhost:5000
npm install
npm run dev              # http://localhost:3000
```

Production: `npm run build && npm start`.

## How it connects to the backend

`next.config.mjs` proxies `/api/*` to `BACKEND_URL`. The browser only talks to the Next.js app,
so login cookies are first-party and no CORS setup is needed. In production set `BACKEND_URL`
to the deployed API URL.

## Pages

| Route | Who |
|---|---|
| `/login` | everyone |
| `/client/dashboard` | client only – "Welcome Client – Phase 1 Placeholder" |
| `/staff/dashboard` | staff only – "Welcome Staff – Phase 1 Placeholder" |
| `/admin/dashboard` | admin only – "Welcome Admin – Phase 1 Placeholder" |

After login the user is sent to the portal for their role. Visiting another role's portal sends
them back to their own. The backend enforces the same rules, so the UI guard is only for tidiness.

## Structure

```
src/
  app/            routes (login, client/, staff/, admin/), each portal has its own layout guard
  components/     ProtectedRoute, DashboardShell (shared header + placeholder)
  context/        AuthContext (user state, login, logout, session restore)
  lib/            api.js (fetch wrapper, auto token refresh on 401), roles.js
```

New Phase 2 pages go inside the matching portal folder (e.g. `src/app/client/appointments/page.js`)
and are protected automatically by that portal's `layout.js`.
