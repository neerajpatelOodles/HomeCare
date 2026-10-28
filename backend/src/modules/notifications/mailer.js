const nodemailer = require('nodemailer');
const env = require('../../config/env');

let transport;
function getTransport() {
  if (transport) return transport;
  const { smtp } = env.email;
  if (!smtp.host) throw new Error('EMAIL_DRIVER=smtp requires SMTP_HOST');
  transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return transport;
}

/** Sends one email. Throws on failure so the worker can retry. */
async function send({ to, subject, text }) {
  if (env.email.driver === 'smtp') {
    await getTransport().sendMail({ from: env.email.from, to, subject, text });
    return;
  }
  // "log" driver: development only. Never prints in tests.
  if (env.nodeEnv !== 'test') {
    console.log(`\n[email:log] To: ${to}\n[email:log] Subject: ${subject}\n${text}\n`);
  }
}

module.exports = { send };
