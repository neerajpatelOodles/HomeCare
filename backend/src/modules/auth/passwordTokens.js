/** One-time "set your password" links (new caregiver invites). Only a hash is stored. */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { withTransaction } = require('../../config/db');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { hashToken } = require('../../utils/tokens');

/** A password nobody knows: the account is unusable until the invite is accepted. */
const unusablePasswordHash = () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), env.auth.bcryptRounds);

/** Creates a fresh invite token (older unused ones are voided). Returns the plain token to put in the email. */
async function createInvite(db, userId) {
  await db.query(`UPDATE password_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = 'invite' AND used_at IS NULL`, [userId]);
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, 'invite', NOW() + make_interval(hours => $3))`,
    [userId, hashToken(token), env.email.inviteTtlHours]
  );
  return token;
}

/** Public: exchanges a valid token + new password. The token works exactly once. */
async function setPassword(token, newPassword) {
  const hash = await bcrypt.hash(newPassword, env.auth.bcryptRounds);
  const bad = () => ApiError.badRequest('This link is invalid or has expired. Ask HR to send a new one.');

  const outcome = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.is_active
         FROM password_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 FOR UPDATE OF t`,
      [hashToken(token)]
    );
    const t = rows[0];
    if (!t || t.used_at || new Date(t.expires_at) < new Date() || !t.is_active) return { bad: true };
    await db.query('UPDATE password_tokens SET used_at = NOW() WHERE id = $1', [t.id]);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, t.user_id]);
    await db.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [t.user_id]);
    return { ok: true };
  });
  if (outcome.bad) throw bad();
}

module.exports = { createInvite, setPassword, unusablePasswordHash };
