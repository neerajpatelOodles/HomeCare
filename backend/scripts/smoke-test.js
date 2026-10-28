/**
 * End-to-end smoke test. Start the API first (npm start), then: npm run test:smoke
 * Uses the seeded admin. Creates temporary client/staff users with unique emails.
 */
require('dotenv').config({ quiet: true });

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@homecare.local',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
};

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ok   ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name} ${extra}`); }
};

/** Tiny client with its own cookie jar (one per simulated browser). */
function makeClient() {
  const jar = {};
  return {
    jar,
    async req(method, path, body) {
      const res = await fetch(BASE + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const val = pair.slice(i + 1);
        if (!val || /Expires=Thu, 01 Jan 1970/i.test(c)) delete jar[name];
        else jar[name] = val;
      }
      let json = null;
      try { json = await res.json(); } catch { /* no body */ }
      return { status: res.status, body: json };
    },
  };
}

(async () => {
  const stamp = Date.now();
  const admin = makeClient();
  const clientUser = makeClient();
  const staffUser = makeClient();
  const anon = makeClient();

  console.log('Health & auth basics');
  check('health', (await anon.req('GET', '/health')).status === 200);
  check('me without login -> 401', (await anon.req('GET', '/auth/me')).status === 401);
  check('wrong password -> 401', (await anon.req('POST', '/auth/login', { email: ADMIN.email, password: 'nope' })).status === 401);
  check('unknown email -> 401', (await anon.req('POST', '/auth/login', { email: 'x@y.com', password: 'nope' })).status === 401);
  check('invalid body -> 400', (await anon.req('POST', '/auth/login', { email: 'bad' })).status === 400);

  console.log('Admin login & user creation');
  let r = await admin.req('POST', '/auth/login', ADMIN);
  check('admin login 200', r.status === 200);
  check('admin redirectTo /admin/dashboard', r.body?.data?.redirectTo === '/admin/dashboard');
  check('password hash never returned', !JSON.stringify(r.body).includes('password'));
  check('access + refresh cookies set', !!admin.jar.hc_access && !!admin.jar.hc_refresh);

  const cEmail = `client${stamp}@test.com`;
  const sEmail = `staff${stamp}@test.com`;
  r = await admin.req('POST', '/admin/users', { email: cEmail, password: 'Client1234', role: 'client', firstName: 'Cara', lastName: 'Client', phone: '555-0100' });
  check('create client 201', r.status === 201, JSON.stringify(r.body));
  const clientId = r.body?.data?.user?.id;
  r = await admin.req('POST', '/admin/users', { email: sEmail, password: 'Staff12345', role: 'staff', firstName: 'Sam', lastName: 'Staff' });
  check('create staff 201', r.status === 201);
  const staffId = r.body?.data?.user?.id;
  check('duplicate email -> 409', (await admin.req('POST', '/admin/users', { email: cEmail.toUpperCase(), password: 'Client1234', role: 'client', firstName: 'a', lastName: 'b' })).status === 409);
  check('weak password -> 400', (await admin.req('POST', '/admin/users', { email: `w${stamp}@test.com`, password: 'short', role: 'client', firstName: 'a', lastName: 'b' })).status === 400);
  check('invalid role -> 400', (await admin.req('POST', '/admin/users', { email: `r${stamp}@test.com`, password: 'Client1234', role: 'superuser', firstName: 'a', lastName: 'b' })).status === 400);

  console.log('Role-based redirect & dashboards');
  r = await clientUser.req('POST', '/auth/login', { email: cEmail, password: 'Client1234' });
  check('client login -> /client/dashboard', r.body?.data?.redirectTo === '/client/dashboard');
  r = await staffUser.req('POST', '/auth/login', { email: sEmail, password: 'Staff12345' });
  check('staff login -> /staff/dashboard', r.body?.data?.redirectTo === '/staff/dashboard');

  r = await clientUser.req('GET', '/dashboard/client');
  check('client dashboard message', r.status === 200 && r.body.data.message === 'Welcome Client', JSON.stringify(r.body));
  r = await staffUser.req('GET', '/dashboard/staff');
  check('staff dashboard message', r.status === 200 && r.body.data.message === 'Welcome Staff');
  r = await admin.req('GET', '/dashboard/admin');
  check('admin dashboard message', r.status === 200 && r.body.data.message === 'Welcome Admin');

  console.log('Access control');
  check('client -> staff dashboard 403', (await clientUser.req('GET', '/dashboard/staff')).status === 403);
  check('client -> admin dashboard 403', (await clientUser.req('GET', '/dashboard/admin')).status === 403);
  check('staff -> client dashboard 403', (await staffUser.req('GET', '/dashboard/client')).status === 403);
  check('admin -> client dashboard 403 (portals are separate)', (await admin.req('GET', '/dashboard/client')).status === 403);
  check('client -> admin users 403', (await clientUser.req('GET', '/admin/users')).status === 403);
  check('staff -> create user 403', (await staffUser.req('POST', '/admin/users', {})).status === 403);
  check('anon -> dashboard 401', (await anon.req('GET', '/dashboard/client')).status === 401);

  console.log('Admin user management');
  r = await admin.req('GET', '/admin/users?role=client&search=Cara');
  check('list + filter', r.status === 200 && r.body.data.items.some((u) => u.id === clientId));
  check('get by id', (await admin.req('GET', `/admin/users/${clientId}`)).status === 200);
  check('bad uuid -> 400', (await admin.req('GET', '/admin/users/not-a-uuid')).status === 400);
  check('unknown uuid -> 404', (await admin.req('GET', '/admin/users/00000000-0000-0000-0000-000000000000')).status === 404);
  r = await admin.req('PATCH', `/admin/users/${clientId}`, { lastName: 'Updated', city: 'Noida' });
  check('update profile', r.status === 200 && r.body.data.user.profile.lastName === 'Updated' && r.body.data.user.profile.city === 'Noida');
  const adminId = (await admin.req('GET', '/auth/me')).body.data.user.id;
  check('admin cannot deactivate self', (await admin.req('PATCH', `/admin/users/${adminId}`, { isActive: false })).status === 400);

  console.log('Sessions: refresh, rotation, reuse detection, logout');
  const oldRefresh = clientUser.jar.hc_refresh;
  r = await clientUser.req('POST', '/auth/refresh');
  check('refresh 200', r.status === 200);
  check('refresh token rotated', clientUser.jar.hc_refresh && clientUser.jar.hc_refresh !== oldRefresh);
  const thief = makeClient();
  thief.jar.hc_refresh = oldRefresh;
  check('old refresh token rejected', (await thief.req('POST', '/auth/refresh')).status === 401);
  check('reuse revokes all sessions', (await clientUser.req('POST', '/auth/refresh')).status === 401);

  r = await staffUser.req('POST', '/auth/logout');
  check('logout 200', r.status === 200);
  check('refresh after logout -> 401', (await staffUser.req('POST', '/auth/refresh')).status === 401);

  console.log('Deactivation takes effect immediately');
  const again = makeClient();
  await again.req('POST', '/auth/login', { email: cEmail, password: 'Client1234' });
  check('client can reach dashboard', (await again.req('GET', '/dashboard/client')).status === 200);
  await admin.req('PATCH', `/admin/users/${clientId}`, { isActive: false });
  check('deactivated -> 401 on existing token', (await again.req('GET', '/dashboard/client')).status === 401);
  check('deactivated cannot log in (403)', (await makeClient().req('POST', '/auth/login', { email: cEmail, password: 'Client1234' })).status === 403);

  console.log('Role change takes effect immediately');
  await admin.req('PATCH', `/admin/users/${staffId}`, { password: 'NewStaff123' });
  const s2 = makeClient();
  await s2.req('POST', '/auth/login', { email: sEmail, password: 'NewStaff123' });
  check('password reset works', (await s2.req('GET', '/dashboard/staff')).status === 200);

  console.log('404 handler');
  check('unknown route 404', (await anon.req('GET', '/nope')).status === 404);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
