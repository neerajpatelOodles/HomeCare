export const ROLE_HOME = {
  client: '/client/dashboard',
  staff: '/staff/dashboard',
  caregiver: '/caregiver/dashboard',
  admin: '/admin/dashboard',
  hr: '/hr/dashboard',
};

export const ROLE_LABEL = {
  client: 'Client',
  staff: 'Staff',
  caregiver: 'Caregiver',
  admin: 'Admin',
  hr: 'HR',
};

// Top navigation for each portal.
export const NAV = {
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/visits', label: 'Schedule' },
    { href: '/admin/clients', label: 'Clients' },
    { href: '/hr/applicants', label: 'Applicants' },
    { href: '/hr/caregivers', label: 'Caregivers' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/emails', label: 'Emails' },
  ],
  hr: [
    { href: '/hr/dashboard', label: 'Dashboard' },
    { href: '/hr/applicants', label: 'Applicants' },
    { href: '/hr/caregivers', label: 'Caregivers' },
    { href: '/admin/users', label: 'Users' },
  ],
  staff: [{ href: '/staff/dashboard', label: 'Dashboard' }],
  caregiver: [
    { href: '/caregiver/dashboard', label: 'Dashboard' },
    { href: '/caregiver/visits', label: 'My visits' },
  ],
  client: [
    { href: '/client/dashboard', label: 'Dashboard' },
    { href: '/client/visits', label: 'Visits' },
    { href: '/client/care-plan', label: 'Care plan' },
  ],
};
