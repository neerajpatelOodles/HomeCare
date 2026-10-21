const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    env.auth.accessSecret,
    { expiresIn: `${env.auth.accessTtlMinutes}m` }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.auth.accessSecret); // throws if invalid/expired
}

/** Opaque random refresh token (sent to client) + its hash (stored in DB). */
function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
