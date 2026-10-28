const ROLES = Object.freeze({
  CLIENT: 'client',
  STAFF: 'staff', // office staff
  CAREGIVER: 'caregiver', // field workers, created when HR hires an applicant
  ADMIN: 'admin',
  HR: 'hr',
});

// Where each role lands after login. The frontend uses this for redirection.
const ROLE_HOME = Object.freeze({
  client: '/client/dashboard',
  staff: '/staff/dashboard',
  caregiver: '/caregiver/dashboard',
  admin: '/admin/dashboard',
  hr: '/hr/dashboard',
});

const COOKIES = Object.freeze({
  ACCESS: 'hc_access',
  REFRESH: 'hc_refresh',
});

// ---- Recruitment ----------------------------------------------------------
const PROFESSIONS = Object.freeze(['RN', 'RPN', 'PSW', 'RSW']);

const APPLICANT_STATUSES = Object.freeze(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']);

// Allowed manual moves. "hired" is NOT here: it only happens through the hire
// endpoint, which also creates the caregiver account.
const APPLICANT_TRANSITIONS = Object.freeze({
  applied: ['screening', 'rejected'],
  screening: ['interview', 'rejected'],
  interview: ['screening', 'offer', 'rejected'],
  offer: ['interview', 'rejected'],
  hired: [],
  rejected: ['applied'],
});

// The five document types the client asked for, plus "other" which only HR/Admin can attach.
const DOC_TYPES = Object.freeze(['resume', 'cpr_first_aid', 'police_check', 'certification', 'government_id', 'other']);
// Shown to HR as a checklist of what an applicant has / has not supplied yet.
const REQUIRED_DOC_TYPES = Object.freeze(['resume', 'cpr_first_aid', 'police_check', 'government_id']);

// ---- Caregivers / clients / scheduling -------------------------------------
const EMPLOYMENT_STATUSES = Object.freeze(['active', 'on_leave', 'inactive']);
const CLIENT_STATUSES = Object.freeze(['active', 'on_hold', 'inactive']);
const VISIT_STATUSES = Object.freeze(['scheduled', 'completed', 'cancelled', 'missed']);

module.exports = {
  ROLES,
  ROLE_HOME,
  COOKIES,
  PROFESSIONS,
  APPLICANT_STATUSES,
  APPLICANT_TRANSITIONS,
  DOC_TYPES,
  REQUIRED_DOC_TYPES,
  EMPLOYMENT_STATUSES,
  CLIENT_STATUSES,
  VISIT_STATUSES,
};
