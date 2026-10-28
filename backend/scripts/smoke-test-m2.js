/**
 * Milestone 2 end-to-end test: recruitment -> HR -> hire -> caregivers -> clients ->
 * scheduling -> dashboards, including permission and failure cases.
 *
 * Start the API with rate limits off, then run:
 *   NODE_ENV=test npm start        (or RATE_LIMIT_DISABLED=true npm start)
 *   npm run test:m2
 * Uses the default seeded admin, HR, staff and client accounts. Creates its own
 * uniquely named test data, so it can be run repeatedly.
 */
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const cred = (role, email, password) => ({ role, email, password });
const ACCOUNTS = {
  admin: cred('admin', process.env.SEED_ADMIN_EMAIL || 'admin@homecare.local', process.env.SEED_ADMIN_PASSWORD || 'Admin@12345'),
  hr: cred('hr', process.env.SEED_HR_EMAIL || 'hr@homecare.local', process.env.SEED_HR_PASSWORD || 'Hr@12345678'),
  staff: cred('staff', process.env.SEED_STAFF_EMAIL || 'staff@homecare.local', process.env.SEED_STAFF_PASSWORD || 'Staff@12345'),
  caregiver: cred('caregiver', process.env.SEED_CAREGIVER_EMAIL || 'caregiver@homecare.local', process.env.SEED_CAREGIVER_PASSWORD || 'Caregiver@12345'),
  client: cred('client', process.env.SEED_CLIENT_EMAIL || 'client@homecare.local', process.env.SEED_CLIENT_PASSWORD || 'Client@12345'),
};

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ok   ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name} ${extra}`); }
};
const section = (t) => console.log(`\n${t}`);

/** One simulated browser with its own cookie jar. */
function makeClient() {
  const jar = {};
  return {
    jar,
    async req(method, path, body) {
      const isForm = body instanceof FormData;
      const res = await fetch(BASE + path, {
        method,
        headers: {
          ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
          Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
        },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const val = pair.slice(i + 1);
        if (!val || /Expires=Thu, 01 Jan 1970/i.test(c)) delete jar[name];
        else jar[name] = val;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      let json = null;
      try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary or empty */ }
      return { status: res.status, body: json, raw: buf, headers: res.headers };
    },
  };
}

async function loginAs(acct) {
  const c = makeClient();
  const r = await c.req('POST', '/auth/login', { email: acct.email, password: acct.password });
  if (r.status !== 200) throw new Error(`Login failed for ${acct.email}: ${r.status} ${JSON.stringify(r.body)}. Run "npm run db:setup" first.`);
  c.redirectTo = r.body.data.redirectTo;
  c.userId = r.body.data.user.id;
  return c;
}

// ---- tiny fake files --------------------------------------------------------
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const EXE = Buffer.from('MZ\x90\x00 this is not a pdf');
const file = (buf, name, type = 'application/octet-stream') => new Blob([buf], { type });

function applicationForm(fields, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  for (const [field, list] of Object.entries(files)) {
    for (const f of [].concat(list)) fd.append(field, f.blob, f.name);
  }
  return fd;
}

const dbPool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

(async () => {
  const stamp = Date.now();
  const anon = makeClient();
  const admin = await loginAs(ACCOUNTS.admin);
  const hr = await loginAs(ACCOUNTS.hr);
  const staffDefault = await loginAs(ACCOUNTS.staff);
  const otherCaregiver = await loginAs(ACCOUNTS.caregiver);
  const clientDefault = await loginAs(ACCOUNTS.client);

  // ===========================================================================
  section('Signup (public, client only) and the HR login');
  const signup = makeClient(); // keeps the new client's cookies apart from the anonymous browser
  let r = await signup.req('POST', '/auth/register', { email: `signup${stamp}@t.com`, password: 'Passw0rd1', firstName: 'Sig', lastName: 'Nup' });
  check('signup -> 201 as client', r.status === 201 && r.body.data.user.role === 'client' && r.body.data.redirectTo === '/client/dashboard', JSON.stringify(r.body));
  check('signup cannot pick staff', (await anon.req('POST', '/auth/register', { email: `s2${stamp}@t.com`, password: 'Passw0rd1', firstName: 'a', lastName: 'b', role: 'staff' })).status === 400);
  check('signup cannot pick admin', (await anon.req('POST', '/auth/register', { email: `s3${stamp}@t.com`, password: 'Passw0rd1', firstName: 'a', lastName: 'b', role: 'admin' })).status === 400);
  check('signup cannot pick hr', (await anon.req('POST', '/auth/register', { email: `s4${stamp}@t.com`, password: 'Passw0rd1', firstName: 'a', lastName: 'b', role: 'hr' })).status === 400);
  check('signup duplicate email -> 409', (await anon.req('POST', '/auth/register', { email: `signup${stamp}@t.com`, password: 'Passw0rd1', firstName: 'a', lastName: 'b' })).status === 409);
  check('signup weak password -> 400', (await anon.req('POST', '/auth/register', { email: `s5${stamp}@t.com`, password: 'abc', firstName: 'a', lastName: 'b' })).status === 400);
  check('HR login redirects to /hr/dashboard', hr.redirectTo === '/hr/dashboard');
  const signedUpUserId = (await admin.req('GET', `/admin/users?search=signup${stamp}`)).body.data.items[0]?.id;
  check('admin can create an HR user via Users API', (await admin.req('POST', '/admin/users', { email: `hr2${stamp}@t.com`, password: 'Passw0rd1', role: 'hr', firstName: 'H', lastName: 'R' })).status === 201);

  // ===========================================================================
  section('Public job application');
  r = await anon.req('GET', '/recruitment/options');
  check('options (public)', r.status === 200 && r.body.data.professions.includes('PSW') && !r.body.data.allowedFiles.includes('DOC') && r.body.data.documentTypes.includes('cpr_first_aid'));

  const email1 = `rn${stamp}@t.com`;
  const base = { firstName: 'Riya', lastName: 'Nurse', email: email1, phone: '+1 416 555 0101', profession: 'RN', licenseNumber: 'CNO-123', yearsExperience: '6', city: 'Toronto', region: 'ON', coverNote: 'Hello' };
  const resume = { blob: file(PDF, 'resume.pdf', 'application/pdf'), name: 'resume.pdf' };

  check('no résumé -> 400', (await anon.req('POST', '/recruitment/applications', applicationForm(base))).status === 400);
  r = await anon.req('POST', '/recruitment/applications', applicationForm(base, { resume: { blob: file(EXE, 'resume.pdf'), name: 'resume.pdf' } }));
  check('exe renamed to .pdf -> 400', r.status === 400, JSON.stringify(r.body));
  r = await anon.req('POST', '/recruitment/applications', applicationForm(base, { resume: { blob: file(Buffer.from('hello'), 'resume.txt'), name: 'resume.txt' } }));
  check('.txt file -> 400', r.status === 400);
  const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
  r = await anon.req('POST', '/recruitment/applications', applicationForm(base, { resume: { blob: file(DOCX, 'resume.docx'), name: 'resume.docx' } }));
  check('Word file (.docx) is no longer accepted -> 400', r.status === 400, JSON.stringify(r.body));
  r = await anon.req('POST', '/recruitment/applications', applicationForm({ ...base, profession: 'MD' }, { resume }));
  check('invalid profession -> 400', r.status === 400);
  r = await anon.req('POST', '/recruitment/applications', applicationForm({ ...base, phone: undefined }, { resume }));
  check('missing phone -> 400', r.status === 400);
  r = await anon.req('POST', '/recruitment/applications', applicationForm(base, { resume: { blob: file(Buffer.alloc(0), 'e.pdf'), name: 'e.pdf' } }));
  check('empty file -> 400', r.status === 400);

  r = await anon.req('POST', '/recruitment/applications', applicationForm(base, { resume, cprFirstAid: { blob: file(PNG, 'cpr.png', 'image/png'), name: 'cpr.png' }, certifications: [{ blob: file(PDF, 'c1.pdf'), name: 'c1.pdf' }] }));
  check('valid application -> 201 with reference', r.status === 201 && !!r.body.data.reference, JSON.stringify(r.body));
  check('duplicate live application -> 409', (await anon.req('POST', '/recruitment/applications', applicationForm(base, { resume }))).status === 409);
  check('same person, different profession -> 201', (await anon.req('POST', '/recruitment/applications', applicationForm({ ...base, profession: 'PSW' }, { resume }))).status === 201);
  r = await anon.req('POST', '/recruitment/applications', applicationForm({ ...base, email: `bot${stamp}@t.com`, website: 'http://spam' }, { resume }));
  check('honeypot answered 201 but nothing stored', r.status === 201 && (await hr.req('GET', `/hr/applicants?search=bot${stamp}`)).body.data.pagination.total === 0);

  // ===========================================================================
  section('HR applicant management');
  check('anonymous cannot list applicants (401)', (await anon.req('GET', '/hr/applicants')).status === 401);
  check('client cannot list applicants (403)', (await clientDefault.req('GET', '/hr/applicants')).status === 403);
  check('staff cannot list applicants (403)', (await staffDefault.req('GET', '/hr/applicants')).status === 403);
  r = await hr.req('GET', `/hr/applicants?search=${email1}&profession=RN`);
  check('HR can list + filter', r.status === 200 && r.body.data.items.length === 1);
  const app1 = r.body.data.items[0];
  check('applicant starts as "applied" with 3 documents', app1.status === 'applied' && app1.documentCount === 3);
  check('missing documents checklist', JSON.stringify(app1.missingDocuments) === JSON.stringify(['police_check', 'government_id']), JSON.stringify(app1.missingDocuments));
  check('admin can also list applicants', (await admin.req('GET', '/hr/applicants')).status === 200);
  check('bad status filter -> 400', (await hr.req('GET', '/hr/applicants?status=nope')).status === 400);

  r = await hr.req('GET', `/hr/applicants/${app1.id}`);
  const detail = r.body.data.applicant;
  check('detail has documents + history', detail.documents.length === 3 && detail.history.length === 1 && detail.history[0].to === 'applied');
  const resumeDoc = detail.documents.find((d) => d.docType === 'resume');
  r = await hr.req('GET', `/hr/applicants/${app1.id}/documents/${resumeDoc.id}/download`);
  check('download résumé: exact bytes, attachment, nosniff', r.status === 200 && r.raw.equals(PDF) && /attachment/.test(r.headers.get('content-disposition')) && r.headers.get('x-content-type-options') === 'nosniff');
  check('anonymous cannot download (401)', (await anon.req('GET', `/hr/applicants/${app1.id}/documents/${resumeDoc.id}/download`)).status === 401);
  check('client cannot download (403)', (await clientDefault.req('GET', `/hr/applicants/${app1.id}/documents/${resumeDoc.id}/download`)).status === 403);

  check('applied -> offer not allowed (400)', (await hr.req('PATCH', `/hr/applicants/${app1.id}/status`, { status: 'offer' })).status === 400);
  check('cannot set "hired" through status (400)', (await hr.req('PATCH', `/hr/applicants/${app1.id}/status`, { status: 'hired' })).status === 400);
  check('hire before offer stage -> 400', (await hr.req('POST', `/hr/applicants/${app1.id}/hire`, {})).status === 400);
  for (const s of ['screening', 'interview', 'offer']) {
    r = await hr.req('PATCH', `/hr/applicants/${app1.id}/status`, { status: s, note: `moved to ${s}` });
    check(`move to ${s}`, r.status === 200 && r.body.data.applicant.status === s, JSON.stringify(r.body));
  }
  check('same status again -> 400', (await hr.req('PATCH', `/hr/applicants/${app1.id}/status`, { status: 'offer' })).status === 400);
  r = await hr.req('POST', `/hr/applicants/${app1.id}/notes`, { body: 'Great interview.' });
  check('add note', r.status === 201 && r.body.data.applicant.notes[0].body === 'Great interview.' && r.body.data.applicant.notes[0].author);
  check('empty note -> 400', (await hr.req('POST', `/hr/applicants/${app1.id}/notes`, { body: '  ' })).status === 400);
  const fd = new FormData(); fd.append('docType', 'other'); fd.append('file', file(PDF, 'x.pdf'), 'cpr.pdf');
  r = await hr.req('POST', `/hr/applicants/${app1.id}/documents`, fd);
  check('HR uploads an extra document', r.status === 201 && r.body.data.document.docType === 'other');
  const fdBad = new FormData(); fdBad.append('file', file(EXE, 'x.pdf'), 'bad.pdf');
  check('HR upload of a fake PDF -> 400', (await hr.req('POST', `/hr/applicants/${app1.id}/documents`, fdBad)).status === 400);
  check('upload without a file -> 400', (await hr.req('POST', `/hr/applicants/${app1.id}/documents`, new FormData())).status === 400);
  const fdBig = new FormData(); fdBig.append('file', file(Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)]), 'big.pdf'), 'big.pdf');
  check('11 MB file -> 400 (too large)', (await hr.req('POST', `/hr/applicants/${app1.id}/documents`, fdBig)).status === 400);

  // Reject / reopen flow on the PSW application
  const psw = (await hr.req('GET', `/hr/applicants?search=${email1}&profession=PSW`)).body.data.items[0];
  r = await hr.req('PATCH', `/hr/applicants/${psw.id}/status`, { status: 'rejected', note: 'No openings' });
  check('reject with reason', r.status === 200 && r.body.data.applicant.rejectionReason === 'No openings');
  r = await hr.req('PATCH', `/hr/applicants/${psw.id}/status`, { status: 'applied' });
  check('reopen rejected -> applied clears reason', r.status === 200 && r.body.data.applicant.rejectionReason === null);

  // ===========================================================================
  section('Hire: applicant -> caregiver (invite link, no password typed by HR)');
  check('client cannot hire (403)', (await clientDefault.req('POST', `/hr/applicants/${app1.id}/hire`, {})).status === 403);
  const inThirtyDays = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  r = await hr.req('POST', `/hr/applicants/${app1.id}/hire`, { licenseExpiry: inThirtyDays, emergencyContactName: 'Sam', emergencyContactPhone: '555-0102' });
  check('hire -> 201', r.status === 201, JSON.stringify(r.body));
  const cgId = r.body?.data?.caregiver?.id;
  check('applicant now "hired" and linked to the new user', r.body.data.applicant.status === 'hired' && r.body.data.applicant.hiredUserId === cgId);
  check('caregiver carries the 4 documents over', r.body.data.caregiver.documents.length === 4);
  check('hire twice -> 400', (await hr.req('POST', `/hr/applicants/${app1.id}/hire`, {})).status === 400);
  check('no password is ever returned', !JSON.stringify(r.body.data).toLowerCase().includes('password'));

  const inviteRow = (await dbPool.query(`SELECT body_text FROM notifications WHERE to_email = $1 AND kind = 'caregiver_invite' ORDER BY id DESC LIMIT 1`, [email1])).rows[0];
  const inviteToken = inviteRow?.body_text.match(/token=([a-f0-9]+)/)?.[1];
  check('invite email queued with a set-password link', !!inviteToken && inviteRow.body_text.includes('/set-password?token='));
  check('cannot log in before accepting the invite', (await makeClient().req('POST', '/auth/login', { email: email1, password: 'Caregiver1' })).status === 401);
  check('bad token -> 400', (await anon.req('POST', '/auth/set-password', { token: 'x'.repeat(64), password: 'Caregiver1' })).status === 400);
  check('weak password -> 400', (await anon.req('POST', '/auth/set-password', { token: inviteToken, password: 'abc' })).status === 400);
  check('set password with the invite token', (await anon.req('POST', '/auth/set-password', { token: inviteToken, password: 'Caregiver1' })).status === 200);
  check('token works only once -> 400', (await anon.req('POST', '/auth/set-password', { token: inviteToken, password: 'Another123' })).status === 400);
  const cg = await makeClient().req('POST', '/auth/login', { email: email1, password: 'Caregiver1' });
  check('new caregiver can log in -> /caregiver/dashboard', cg.status === 200 && cg.body.data.redirectTo === '/caregiver/dashboard' && cg.body.data.user.role === 'caregiver');
  const caregiver = makeClient();
  await caregiver.req('POST', '/auth/login', { email: email1, password: 'Caregiver1' });
  check('resend invite after first login -> 400', (await hr.req('POST', `/caregivers/${cgId}/resend-invite`)).status === 400);
  check('client cannot resend invite (403)', (await clientDefault.req('POST', `/caregivers/${cgId}/resend-invite`)).status === 403);

  // ===========================================================================
  section('Caregiver management');
  r = await hr.req('GET', `/caregivers?search=${email1}`);
  check('HR lists the new caregiver', r.status === 200 && r.body.data.items.some((c) => c.id === cgId && c.profession === 'RN'));
  check('licence expiring filter finds them', (await hr.req('GET', '/caregivers?expiringWithinDays=30')).body.data.items.some((c) => c.id === cgId));
  check('profession filter excludes them for PSW', !(await hr.req('GET', `/caregivers?profession=PSW&search=${email1}`)).body.data.items.length);
  check('client cannot list caregivers (403)', (await clientDefault.req('GET', '/caregivers')).status === 403);
  check('staff cannot list caregivers (403)', (await staffDefault.req('GET', '/caregivers')).status === 403);
  r = await hr.req('GET', `/caregivers/${cgId}`);
  const cgDoc = r.body.data.caregiver.documents[0];
  r = await hr.req('GET', `/caregivers/${cgId}/documents/${cgDoc.id}/download`);
  check('download a caregiver document', r.status === 200 && r.raw.length > 0);
  check('document of another applicant is not reachable by id (404)', (await hr.req('GET', `/hr/applicants/${psw.id}/documents/${cgDoc.id}/download`)).status === 404);
  r = await hr.req('PATCH', `/caregivers/${cgId}`, { phone: '555-1111', licenseNumber: 'CNO-999', notes: 'Prefers mornings' });
  check('update caregiver', r.status === 200 && r.body.data.caregiver.licenseNumber === 'CNO-999' && r.body.data.caregiver.phone === '555-1111');
  check('empty update -> 400', (await hr.req('PATCH', `/caregivers/${cgId}`, {})).status === 400);
  const fd2 = new FormData(); fd2.append('docType', 'government_id'); fd2.append('file', file(PNG, 'x.png'), 'id.png');
  check('HR uploads a caregiver document', (await hr.req('POST', `/caregivers/${cgId}/documents`, fd2)).status === 201);

  // ===========================================================================
  section('Client management (admin)');
  check('HR cannot manage clients (403)', (await hr.req('GET', '/clients')).status === 403);
  check('staff cannot manage clients (403)', (await staffDefault.req('GET', '/clients')).status === 403);
  r = await admin.req('POST', '/clients', { firstName: 'Carl', lastName: `Client${stamp}`, phone: '555-2000', addressLine1: '1 Main St', city: 'Toronto', careNeeds: 'Mobility help', emergencyContactName: 'Daughter', emergencyContactPhone: '555-2001' });
  check('create client record', r.status === 201 && r.body.data.client.hasLogin === false, JSON.stringify(r.body));
  const clientA = r.body.data.client;
  const loginEmail = `clogin${stamp}@t.com`;
  r = await admin.req('POST', '/clients', { firstName: 'Cora', lastName: `Login${stamp}`, login: { email: loginEmail, password: 'Client1234' } });
  check('create client WITH a portal login', r.status === 201 && r.body.data.client.hasLogin === true && r.body.data.client.loginEmail === loginEmail);
  const clientB = r.body.data.client;
  const clientBsession = makeClient();
  r = await clientBsession.req('POST', '/auth/login', { email: loginEmail, password: 'Client1234' });
  check('that client can log in -> /client/dashboard', r.status === 200 && r.body.data.redirectTo === '/client/dashboard');
  check('duplicate login email -> 409', (await admin.req('POST', '/clients', { firstName: 'D', lastName: 'D', login: { email: loginEmail, password: 'Client1234' } })).status === 409);
  check('login + userId together -> 400', (await admin.req('POST', '/clients', { firstName: 'D', lastName: 'D', userId: signedUpUserId, login: { email: `x${stamp}@t.com`, password: 'Client1234' } })).status === 400);
  check('cannot link a staff user -> 400', (await admin.req('POST', '/clients', { firstName: 'D', lastName: 'D', userId: cgId })).status === 400);
  r = await admin.req('PATCH', `/clients/${clientA.id}`, { userId: signedUpUserId });
  check('link a self-signed-up client login to a record', r.status === 200 && r.body.data.client.hasLogin === true, JSON.stringify(r.body));
  check('same login cannot be linked twice -> 409', (await admin.req('PATCH', `/clients/${clientB.id}`, { userId: signedUpUserId })).status === 409);
  r = await admin.req('GET', `/clients?search=Client${stamp}`);
  check('search clients', r.status === 200 && r.body.data.items.some((c) => c.id === clientA.id));
  check('update client', (await admin.req('PATCH', `/clients/${clientA.id}`, { careNeeds: 'Updated', status: 'active' })).body?.data?.client?.careNeeds === 'Updated');
  check('bad client id -> 400', (await admin.req('GET', '/clients/not-a-uuid')).status === 400);
  check('unknown client -> 404', (await admin.req('GET', '/clients/00000000-0000-0000-0000-000000000000')).status === 404);

  // ===========================================================================
  section('Scheduling');
  const day = (n, h, m = 0) => { const d = new Date(Date.now() + n * 864e5); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };
  const far = 300 + Math.floor(Math.random() * 2000); // far-future days, so re-runs never collide
  r = await admin.req('GET', '/visits/options');
  check('scheduling options list caregivers + clients', r.status === 200 && r.body.data.caregivers.some((c) => c.id === cgId) && r.body.data.clients.some((c) => c.id === clientA.id));
  check('staff cannot open scheduling (403)', (await staffDefault.req('GET', '/visits')).status === 403);
  check('client cannot open scheduling (403)', (await clientDefault.req('GET', '/visits')).status === 403);
  check('HR cannot open scheduling (403)', (await hr.req('GET', '/visits')).status === 403);

  const v1body = { clientId: clientA.id, caregiverId: cgId, startAt: day(far, 9), endAt: day(far, 10), serviceType: 'Personal care' };
  r = await admin.req('POST', '/visits', v1body);
  check('create visit', r.status === 201 && r.body.data.visit.caregiver.id === cgId && r.body.data.visit.client.id === clientA.id, JSON.stringify(r.body));
  const v1 = r.body.data.visit;
  r = await admin.req('POST', '/visits', { ...v1body, startAt: day(far, 9, 30), endAt: day(far, 10, 30) });
  check('overlapping visit for same caregiver -> 409', r.status === 409, JSON.stringify(r.body));
  r = await admin.req('POST', '/visits', { ...v1body, startAt: day(far, 10), endAt: day(far, 11) });
  check('back-to-back visit is allowed', r.status === 201);
  const v2 = r.body?.data?.visit;
  check('end before start -> 400', (await admin.req('POST', '/visits', { ...v1body, startAt: day(far, 12), endAt: day(far, 11) })).status === 400);
  check('longer than 24h -> 400', (await admin.req('POST', '/visits', { ...v1body, startAt: day(far + 5, 9), endAt: day(far + 7, 9) })).status === 400);
  check('bad date format -> 400', (await admin.req('POST', '/visits', { ...v1body, startAt: 'tomorrow' })).status === 400);
  check('unknown client -> 400', (await admin.req('POST', '/visits', { ...v1body, clientId: '00000000-0000-0000-0000-000000000000', startAt: day(far + 2, 9), endAt: day(far + 2, 10) })).status === 400);
  check('assigning an office staff user -> 400', (await admin.req('POST', '/visits', { ...v1body, caregiverId: staffDefault.userId, startAt: day(far + 2, 9), endAt: day(far + 2, 10) })).status === 400);
  check('assigning a non-caregiver user -> 400', (await admin.req('POST', '/visits', { ...v1body, caregiverId: signedUpUserId, startAt: day(far + 2, 9), endAt: day(far + 2, 10) })).status === 400);

  r = await admin.req('POST', '/visits', { clientId: clientA.id, startAt: day(far + 1, 9), endAt: day(far + 1, 10) });
  check('create an unassigned visit', r.status === 201 && r.body.data.visit.caregiver === null);
  const vOpen = r.body.data.visit;
  check('unassigned filter finds it', (await admin.req('GET', '/visits?unassigned=true')).body.data.items.some((v) => v.id === vOpen.id));
  r = await admin.req('PATCH', `/visits/${vOpen.id}`, { caregiverId: cgId });
  check('assign a caregiver later', r.status === 200 && r.body.data.visit.caregiver.id === cgId);
  r = await admin.req('PATCH', `/visits/${vOpen.id}`, { startAt: day(far, 9, 15), endAt: day(far, 9, 45) });
  check('rescheduling onto another visit -> 409', r.status === 409);
  r = await admin.req('PATCH', `/visits/${vOpen.id}`, { startAt: day(far + 1, 14), endAt: day(far + 1, 15), instructions: 'Bring forms' });
  check('reschedule to a free slot', r.status === 200 && r.body.data.visit.instructions === 'Bring forms');
  check('end-before-start on update -> 400', (await admin.req('PATCH', `/visits/${vOpen.id}`, { endAt: day(far + 1, 13) })).status === 400);

  r = await admin.req('GET', `/visits?caregiverId=${cgId}&from=${day(far, 0)}&to=${day(far + 2, 0)}`);
  check('list by caregiver and date range', r.status === 200 && r.body.data.items.length >= 3 && r.body.data.items.every((x) => x.caregiver.id === cgId));
  check('range with no visits is empty', (await admin.req('GET', `/visits?caregiverId=${cgId}&from=${day(far + 50, 0)}&to=${day(far + 51, 0)}`)).body.data.items.length === 0);

  r = await admin.req('POST', `/visits/${v1.id}/cancel`, { reason: 'Client request' });
  check('cancel a visit', r.status === 200 && r.body.data.visit.status === 'cancelled' && r.body.data.visit.cancelReason === 'Client request');
  check('cancelling again -> 400', (await admin.req('POST', `/visits/${v1.id}/cancel`, {})).status === 400);
  check('cancelled visit cannot be edited -> 400', (await admin.req('PATCH', `/visits/${v1.id}`, { instructions: 'x' })).status === 400);
  check('slot is free again after cancel', (await admin.req('POST', '/visits', v1body)).status === 201);

  // caregiver availability rules
  await hr.req('PATCH', `/caregivers/${cgId}`, { employmentStatus: 'on_leave' });
  check('on-leave caregiver cannot be booked -> 400', (await admin.req('POST', '/visits', { ...v1body, startAt: day(far + 3, 9), endAt: day(far + 3, 10) })).status === 400);
  check('on-leave caregiver can still log in', (await makeClient().req('POST', '/auth/login', { email: email1, password: 'Caregiver1' })).status === 200);
  await hr.req('PATCH', `/caregivers/${cgId}`, { employmentStatus: 'active' });
  const inactiveClient = (await admin.req('POST', '/clients', { firstName: 'Ina', lastName: `Ctive${stamp}`, status: 'inactive' })).body.data.client;
  check('inactive client cannot get visits -> 400', (await admin.req('POST', '/visits', { clientId: inactiveClient.id, startAt: day(far + 3, 9), endAt: day(far + 3, 10) })).status === 400);

  // ===========================================================================
  section('Caregiver portal: own schedule, notes, mark completed (no clock-in/out)');
  const now = Date.now();
  const mk = async (offStartMin, offEndMin) => (await admin.req('POST', '/visits', { clientId: clientB.id, caregiverId: cgId, startAt: new Date(now + offStartMin * 60000).toISOString(), endAt: new Date(now + offEndMin * 60000).toISOString(), instructions: 'Ring the bell twice' })).body?.data?.visit;
  const vNow = await mk(-10, 50);
  const vLater = await mk(600, 660);
  const vPast = await mk(-300, -240);
  check('created now / later / past visits', !!vNow && !!vLater && !!vPast);
  await admin.req('POST', `/clients/${clientB.id}/care-plans`, { title: 'Mobility plan', dailyTasks: 'Morning walk', precautions: 'Fall risk' });

  r = await caregiver.req('GET', '/caregiver/visits');
  check('caregiver sees only own visits', r.status === 200 && r.body.data.items.length >= 3 && r.body.data.items.every((v) => v.caregiver.id === cgId));
  check('other caregiver sees none of them', !(await otherCaregiver.req('GET', '/caregiver/visits')).body.data.items.some((v) => v.id === vNow.id));
  check('client cannot use caregiver endpoints (403)', (await clientDefault.req('GET', '/caregiver/visits')).status === 403);
  check('caregiver cannot use admin scheduling (403)', (await caregiver.req('POST', '/visits', v1body)).status === 403);
  check('clock-in endpoint no longer exists (404)', (await caregiver.req('POST', `/caregiver/visits/${vNow.id}/start`)).status === 404);

  r = await caregiver.req('GET', `/caregiver/visits/${vNow.id}`);
  check('caregiver visit detail: instructions, client care needs, care plan', r.status === 200 && r.body.data.visit.instructions === 'Ring the bell twice' && r.body.data.visit.carePlan?.title === 'Mobility plan' && 'careNeeds' in r.body.data.visit.clientDetails, JSON.stringify(r.body));
  check('another caregiver cannot open my visit (404)', (await otherCaregiver.req('GET', `/caregiver/visits/${vNow.id}`)).status === 404);
  r = await caregiver.req('POST', `/caregiver/visits/${vNow.id}/notes`, { body: 'Client was in good spirits.' });
  check('caregiver adds a visit note', r.status === 201 && r.body.data.visit.notes.length === 1 && !!r.body.data.visit.notes[0].author);
  check('empty note -> 400', (await caregiver.req('POST', `/caregiver/visits/${vNow.id}/notes`, { body: ' ' })).status === 400);
  check('another caregiver cannot add a note (404)', (await otherCaregiver.req('POST', `/caregiver/visits/${vNow.id}/notes`, { body: 'hi' })).status === 404);
  check('cannot complete a visit that has not started (400)', (await caregiver.req('POST', `/caregiver/visits/${vLater.id}/complete`, {})).status === 400);
  check('another caregiver cannot complete my visit (404)', (await otherCaregiver.req('POST', `/caregiver/visits/${vNow.id}/complete`, {})).status === 404);
  r = await caregiver.req('POST', `/caregiver/visits/${vNow.id}/complete`, { note: 'All went well' });
  check('mark completed with a final note', r.status === 200 && r.body.data.visit.status === 'completed' && !!r.body.data.visit.completedAt && r.body.data.visit.notes.length === 2, JSON.stringify(r.body));
  check('complete twice -> 400', (await caregiver.req('POST', `/caregiver/visits/${vNow.id}/complete`, {})).status === 400);
  check('can still add a note to a completed visit', (await caregiver.req('POST', `/caregiver/visits/${vNow.id}/notes`, { body: 'Follow-up' })).status === 201);
  r = await admin.req('GET', `/visits/${vNow.id}`);
  check('admin sees all caregiver notes', r.status === 200 && r.body.data.visit.notes.length === 3);
  check('mark a future visit missed -> 400', (await admin.req('POST', `/visits/${vLater.id}/missed`)).status === 400);
  r = await admin.req('POST', `/visits/${vPast.id}/missed`);
  check('mark a past visit missed', r.status === 200 && r.body.data.visit.status === 'missed');
  check('cannot add a note to a missed visit (400)', (await caregiver.req('POST', `/caregiver/visits/${vPast.id}/notes`, { body: 'x' })).status === 400);

  // ===========================================================================
  section('Client portal: own visits only');
  r = await clientBsession.req('GET', '/client/visits');
  check('client sees own visits', r.status === 200 && r.body.data.items.length >= 3 && r.body.data.items.every((v) => v.client.id === clientB.id));
  check('client never sees instructions or caregiver notes', r.body.data.items.every((v) => !('instructions' in v) && !('notes' in v)));
  r = await clientBsession.req('GET', '/client/care-plan');
  check('client reads own care plan', r.status === 200 && r.body.data.carePlan?.title === 'Mobility plan', JSON.stringify(r.body));
  check('staff cannot read client care plan (403)', (await staffDefault.req('GET', '/client/care-plan')).status === 403);
  check('default client (no record) sees none', (await clientDefault.req('GET', '/client/visits')).body.data.items.length === 0);
  check('staff cannot use caregiver endpoint (403)', (await staffDefault.req('GET', '/caregiver/visits')).status === 403);
  check('caregiver cannot open staff dashboard (403)', (await otherCaregiver.req('GET', '/dashboard/staff')).status === 403);
  check('staff dashboard shows overview', (await staffDefault.req('GET', '/dashboard/staff')).body?.data?.stats?.activeClients >= 0);
  check('staff cannot use client endpoint (403)', (await staffDefault.req('GET', '/client/visits')).status === 403);

  // ===========================================================================
  section('Caregiver details: availability, service areas, certifications');
  const win = (weekday, startTime, endTime) => ({ weekday, startTime, endTime });
  check('overlapping windows -> 400', (await hr.req('PUT', `/caregivers/${cgId}/availability`, { availability: [win(1, '09:00', '12:00'), win(1, '11:00', '14:00')] })).status === 400);
  check('end before start -> 400', (await hr.req('PUT', `/caregivers/${cgId}/availability`, { availability: [win(1, '12:00', '09:00')] })).status === 400);
  check('bad time format -> 400', (await hr.req('PUT', `/caregivers/${cgId}/availability`, { availability: [win(1, '9am', '12:00')] })).status === 400);
  r = await hr.req('PUT', `/caregivers/${cgId}/availability`, { availability: [win(1, '09:00', '12:00'), win(1, '13:00', '17:00'), win(3, '09:00', '17:00')] });
  check('set weekly availability', r.status === 200 && r.body.data.availability.length === 3 && r.body.data.availability[0].startTime === '09:00');
  r = await hr.req('PUT', `/caregivers/${cgId}/service-areas`, { serviceAreas: ['Toronto', 'toronto', 'Mississauga'] });
  check('set service areas (case-insensitive de-duplication)', r.status === 200 && r.body.data.serviceAreas.length === 2);
  r = await hr.req('POST', `/caregivers/${cgId}/certifications`, { name: 'CPR / First Aid', issuer: 'Red Cross', issuedOn: '2025-01-10', expiresOn: inThirtyDays });
  check('add certification', r.status === 201 && r.body.data.certification.name === 'CPR / First Aid');
  const certId = r.body.data.certification.id;
    check('certification linked to a document of another person -> 400', (await hr.req('PATCH', `/caregivers/${cgId}/certifications/${certId}`, { documentId: psw ? (await hr.req('GET', `/hr/applicants/${psw.id}`)).body.data.applicant.documents[0].id : null })).status === 400);
  const ownDoc = (await hr.req('GET', `/caregivers/${cgId}`)).body.data.caregiver.documents.find((d) => d.docType === 'cpr_first_aid');
  r = await hr.req('PATCH', `/caregivers/${cgId}/certifications/${certId}`, { documentId: ownDoc.id, issuer: 'St John' });
  check('update certification + link its document', r.status === 200 && r.body.data.certification.documentId === ownDoc.id && r.body.data.certification.issuer === 'St John');
  r = await hr.req('PATCH', `/caregivers/${cgId}`, { licenseBody: 'College of Nurses of Ontario' });
  check('licence body saved', r.status === 200 && r.body.data.caregiver.licenseBody === 'College of Nurses of Ontario');
  r = await hr.req('GET', `/caregivers/${cgId}`);
  check('detail returns availability, areas, certifications', r.body.data.caregiver.availability.length === 3 && r.body.data.caregiver.serviceAreas.length === 2 && r.body.data.caregiver.certifications.length === 1);
  check('staff cannot edit availability (403)', (await staffDefault.req('PUT', `/caregivers/${cgId}/availability`, { availability: [] })).status === 403);
  check('unknown caregiver -> 404', (await hr.req('PUT', '/caregivers/00000000-0000-0000-0000-000000000000/availability', { availability: [] })).status === 404);
  const certDel = (await hr.req('POST', `/caregivers/${cgId}/certifications`, { name: 'Temp' })).body.data.certification.id;
  check('delete certification', (await hr.req('DELETE', `/caregivers/${cgId}/certifications/${certDel}`)).status === 200 && (await hr.req('DELETE', `/caregivers/${cgId}/certifications/${certDel}`)).status === 404);

  section('Availability / service-area warnings when scheduling');
  // Builds the real UTC instant for "this local hour in APP_TIMEZONE" so the test is correct in summer and winter.
  const TZ = process.env.APP_TIMEZONE || 'America/Toronto';
  const localAt = (dow, hour, minute = 0) => {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 7 * (60 + Math.floor(Math.random() * 40)));
    while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
    for (const off of [3, 4, 5, 6, 7, 8]) {
      const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour + off, minute));
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(c);
      const get = (t) => p.find((x) => x.type === t).value;
      if (Number(get('hour')) === hour && Number(get('minute')) === minute) return c;
    }
    throw new Error('no local time found');
  };
  const mondayNoon = localAt(1, 12, 15);      // 12:15 local: in the lunch gap (windows are 09-12 and 13-17)
  const mondayMorning = localAt(1, 9, 30);    // 09:30 local: inside the first window
  const mk2 = (d, clientId = clientA.id) => admin.req('POST', '/visits', { clientId, caregiverId: cgId, startAt: d.toISOString(), endAt: new Date(d.getTime() + 3600e3).toISOString() });
  r = await mk2(mondayNoon);
  check('visit in the lunch gap -> created WITH an availability warning', r.status === 201 && r.body.data.warnings.some((w) => /availability/i.test(w)), JSON.stringify(r.body));
  r = await mk2(mondayMorning);
  check('visit inside availability -> no availability warning', r.status === 201 && !r.body.data.warnings.some((w) => /availability/i.test(w)), JSON.stringify(r.body.data.warnings));
  const farClient = (await admin.req('POST', '/clients', { firstName: 'Far', lastName: `Away${stamp}`, city: 'Vancouver' })).body.data.client;
  const wed = localAt(3, 10);
  r = await mk2(wed, farClient.id);
  check('client outside service areas -> warning', r.status === 201 && r.body.data.warnings.some((w) => /service area/i.test(w)), JSON.stringify(r.body));

  // ===========================================================================
  section('Care plans (admin writes, one active at a time)');
  check('HR cannot write care plans (403)', (await hr.req('POST', `/clients/${clientA.id}/care-plans`, { title: 'x' })).status === 403);
  check('plan needs a title -> 400', (await admin.req('POST', `/clients/${clientA.id}/care-plans`, { summary: 'x' })).status === 400);
  r = await admin.req('POST', `/clients/${clientA.id}/care-plans`, { title: 'Plan v1', summary: 'Support after hip surgery', goals: 'Walk unaided', dailyTasks: 'Meals, mobility', precautions: 'No stairs', startDate: '2026-11-01', reviewDate: '2027-02-01' });
  check('create care plan', r.status === 201 && r.body.data.carePlan.status === 'active');
  const plan1 = r.body.data.carePlan;
  r = await admin.req('POST', `/clients/${clientA.id}/care-plans`, { title: 'Plan v2' });
  check('new plan archives the previous one', r.status === 201 && (await admin.req('GET', `/clients/${clientA.id}/care-plans`)).body.data.carePlans.filter((p) => p.status === 'active').length === 1);
  check('client record shows the active plan', (await admin.req('GET', `/clients/${clientA.id}`)).body.data.client.carePlan.title === 'Plan v2');
  check('archived plan is read-only (400)', (await admin.req('PATCH', `/clients/${clientA.id}/care-plans/${plan1.id}`, { title: 'edit' })).status === 400);
  check('edit active plan', (await admin.req('PATCH', `/clients/${clientA.id}/care-plans/${r.body.data.carePlan.id}`, { goals: 'New goals' })).body?.data?.carePlan?.goals === 'New goals');

  // ===========================================================================
  section('Emails (outbox): applicant, HR, status updates, reminders, cancellations');
  const rows = async (where, params) => (await dbPool.query(`SELECT * FROM notifications WHERE ${where}`, params)).rows;
  check('applicant got a "received" email', (await rows(`to_email = $1 AND kind = 'application_received'`, [email1])).length === 2);
  check('HR got a "new application" email', (await rows(`kind = 'hr_new_application' AND subject LIKE $1`, [`%Riya Nurse%`])).some((x) => x.to_email === ACCOUNTS.hr.email));
  const statusMails = await rows(`to_email = $1 AND kind = 'applicant_status' ORDER BY id`, [email1]);
  check('status emails: PSW rejection + RN screening, interview, offer', statusMails.length === 4, String(statusMails.length));
  check('internal notes/rejection reason never emailed', !(await rows(`body_text LIKE '%No openings%'`, [])).length);
  r = await hr.req('PATCH', `/hr/applicants/${psw.id}/status`, { status: 'screening', notifyApplicant: false });
  check('notifyApplicant=false sends nothing', r.status === 200 && (await rows(`to_email = $1 AND kind = 'applicant_status'`, [email1])).length === 4);
  r = await hr.req('PATCH', `/hr/applicants/${psw.id}/status`, { status: 'rejected', note: 'Internal: weak references', message: 'We will keep your CV on file.' });
  const rej = (await rows(`to_email = $1 AND kind = 'applicant_status' ORDER BY id DESC LIMIT 1`, [email1]))[0];
  check('rejection email carries the public message only', r.status === 200 && /keep your CV/.test(rej.body_text) && !/weak references/.test(rej.body_text));

  // a visit starting in ~2 hours gets a reminder for caregiver + client, once
  const soon = await admin.req('POST', '/visits', { clientId: clientB.id, caregiverId: cgId, startAt: new Date(Date.now() + 2 * 3600e3).toISOString(), endAt: new Date(Date.now() + 3 * 3600e3).toISOString() });
  const soonId = soon.body.data.visit.id;
  check('non-admin cannot run the email worker (403)', (await hr.req('POST', '/admin/notifications/process')).status === 403);
  r = await admin.req('POST', '/admin/notifications/process');
  check('worker runs and sends emails', r.status === 200 && r.body.data.sent >= 1 && r.body.data.failed === 0, JSON.stringify(r.body));
  check('reminders queued for caregiver and client', (await rows(`kind = 'visit_reminder' AND related_id = $1`, [soonId])).length === 2);
  await admin.req('POST', '/admin/notifications/process');
  check('running again never duplicates reminders', (await rows(`kind = 'visit_reminder' AND related_id = $1`, [soonId])).length === 2);
  check('everything pending was sent', (await rows(`status = 'pending' AND send_after <= NOW()`, [])).length === 0);
  r = await admin.req('GET', '/admin/notifications?status=sent&limit=5');
  check('admin can list notifications (no bodies)', r.status === 200 && r.body.data.items.length > 0 && !('body' in r.body.data.items[0]) && !JSON.stringify(r.body).includes('token='));
  check('HR cannot list notifications (403)', (await hr.req('GET', '/admin/notifications')).status === 403);
  await admin.req('POST', `/visits/${soonId}/cancel`, { reason: 'test' });
  check('cancelling queues cancellation emails', (await rows(`kind = 'visit_cancelled' AND related_id = $1`, [soonId])).length === 2);
  // a pending reminder must be dropped when the visit is moved
  const soon2 = (await admin.req('POST', '/visits', { clientId: clientB.id, caregiverId: cgId, startAt: new Date(Date.now() + 5 * 3600e3).toISOString(), endAt: new Date(Date.now() + 6 * 3600e3).toISOString() })).body.data.visit;
  await dbPool.query(`UPDATE notifications SET status = status WHERE false`);
  await admin.req('POST', '/admin/notifications/process');
  await admin.req('PATCH', `/visits/${soon2.id}`, { startAt: new Date(Date.now() + 400 * 3600e3).toISOString(), endAt: new Date(Date.now() + 401 * 3600e3).toISOString() });
  check('moved far-future visit has no pending reminder', (await rows(`kind = 'visit_reminder' AND related_id = $1 AND status = 'pending'`, [soon2.id])).length === 0);

  // ===========================================================================
  section('Dashboards');
  r = await admin.req('GET', '/dashboard/admin?tz=Asia/Kolkata');
  const st = r.body.data.stats;
  check('admin stats', r.status === 200 && st.activeCaregivers >= 1 && st.activeClients >= 2 && st.unassignedVisits >= 0 && st.licensesExpiring >= 1 && st.visitsToday >= 1, JSON.stringify(st));
  check('invalid time zone -> 400', (await admin.req('GET', '/dashboard/admin?tz=Mars/Base')).status === 400);
  r = await hr.req('GET', '/dashboard/hr');
  check('HR dashboard', r.status === 200 && r.body.data.applicantsByStatus.hired >= 1 && r.body.data.recentApplicants.length >= 1 && r.body.data.licensesExpiringSoon.some((c) => c.caregiverId === cgId) && r.body.data.certificationsExpiringSoon.some((c) => c.caregiverId === cgId), JSON.stringify(r.body.data));
  r = await caregiver.req('GET', '/dashboard/caregiver?tz=UTC');
  check('caregiver dashboard shows profile + completed count', r.status === 200 && r.body.data.caregiverProfile.profession === 'RN' && r.body.data.completedThisMonth >= 1);
  check('caregiver dashboard lists today visits ', Array.isArray(r.body.data.todayVisits));
  r = await clientBsession.req('GET', '/dashboard/client');
  check('client dashboard', r.status === 200 && r.body.data.clientRecord.id === clientB.id && r.body.data.upcomingVisits.length >= 1 && r.body.data.recentVisits.length >= 1, JSON.stringify(r.body.data.clientRecord));
  r = await clientDefault.req('GET', '/dashboard/client');
  check('client without a record gets an empty dashboard', r.status === 200 && r.body.data.clientRecord === null);
  check('client cannot open HR dashboard (403)', (await clientDefault.req('GET', '/dashboard/hr')).status === 403);
  check('HR cannot open admin dashboard (403)', (await hr.req('GET', '/dashboard/admin')).status === 403);
  check('admin cannot open HR dashboard (403)', (await admin.req('GET', '/dashboard/hr')).status === 403);

  // ===========================================================================
  section('Caregiver set to inactive loses access immediately');
  const before = await caregiver.req('GET', '/dashboard/caregiver');
  await hr.req('PATCH', `/caregivers/${cgId}`, { employmentStatus: 'inactive' });
  check('was working before', before.status === 200);
  check('existing session rejected (401)', (await caregiver.req('GET', '/dashboard/caregiver')).status === 401);
  check('cannot log in (403)', (await makeClient().req('POST', '/auth/login', { email: email1, password: 'Caregiver1' })).status === 403);
  await hr.req('PATCH', `/caregivers/${cgId}`, { employmentStatus: 'active' });
  check('reactivated caregiver can log in again', (await makeClient().req('POST', '/auth/login', { email: email1, password: 'Caregiver1' })).status === 200);

  await dbPool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
