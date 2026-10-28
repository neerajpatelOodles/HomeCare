const env = require('../../config/env');

const sign = '\n\n— Home-Care Central';
const fmt = (d) =>
  new Intl.DateTimeFormat('en-CA', { dateStyle: 'full', timeStyle: 'short', timeZone: env.appTimezone }).format(new Date(d));

exports.fmt = fmt;

exports.applicationReceived = (a) => ({
  subject: 'We received your application',
  text: `Hi ${a.firstName},\n\nThank you for applying for the ${a.profession} position. Our HR team will review your application and contact you about next steps.${sign}`,
});

exports.hrNewApplication = (a) => ({
  subject: `New application: ${a.firstName} ${a.lastName} (${a.profession})`,
  text: `${a.firstName} ${a.lastName} (${a.email}, ${a.phone}) applied as ${a.profession}.\n\nReview: ${env.appUrl}/hr/dashboard${sign}`,
});

const STATUS_COPY = {
  screening: 'Your application is now being screened by our team.',
  interview: 'Good news: we would like to interview you. We will contact you to arrange a time.',
  offer: 'Good news: we would like to make you an offer. We will be in touch with the details.',
  rejected: 'Thank you for your interest. After careful review we will not be moving forward with your application at this time.',
};
exports.hasStatusEmail = (status) => Object.hasOwn(STATUS_COPY, status);
exports.applicantStatus = (a, status, message) => ({
  subject: `Update on your application (${a.profession})`,
  text: `Hi ${a.firstName},\n\n${STATUS_COPY[status]}${message ? `\n\n${message}` : ''}${sign}`,
});

exports.invite = (a, link, hours) => ({
  subject: 'Welcome! Set up your caregiver account',
  text: `Hi ${a.firstName},\n\nCongratulations, you are hired! Create your password to sign in:\n\n${link}\n\nThis link works once and expires in ${hours} hours.${sign}`,
});

exports.visitReminder = (v, audience) => ({
  subject: `Visit reminder: ${fmt(v.startAt)}`,
  text:
    audience === 'caregiver'
      ? `Hi ${v.caregiverFirstName},\n\nReminder: ${v.serviceType} visit with ${v.clientName} on ${fmt(v.startAt)}${v.address ? `\nAddress: ${v.address}` : ''}.${sign}`
      : `Hi ${v.clientFirstName},\n\nReminder: your ${v.serviceType} visit with ${v.caregiverName} is on ${fmt(v.startAt)}.${sign}`,
});

exports.visitCancelled = (v) => ({
  subject: `Visit cancelled: ${fmt(v.startAt)}`,
  text: `The ${v.serviceType} visit planned for ${fmt(v.startAt)} has been cancelled.${sign}`,
});
