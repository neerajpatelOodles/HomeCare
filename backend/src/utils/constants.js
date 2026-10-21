const ROLES = Object.freeze({
  CLIENT: 'client',
  STAFF: 'staff',
  ADMIN: 'admin',
});

// Where each role lands after login. The frontend uses this for redirection.
const ROLE_HOME = Object.freeze({
  client: '/client/dashboard',
  staff: '/staff/dashboard',
  admin: '/admin/dashboard',
});

const COOKIES = Object.freeze({
  ACCESS: 'hc_access',
  REFRESH: 'hc_refresh',
});

module.exports = { ROLES, ROLE_HOME, COOKIES };
