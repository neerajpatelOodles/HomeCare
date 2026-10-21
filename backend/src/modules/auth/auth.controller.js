const env = require('../../config/env');
const asyncHandler = require('../../utils/asyncHandler');
const { COOKIES } = require('../../utils/constants');
const authService = require('./auth.service');

const baseCookie = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
};

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(COOKIES.ACCESS, accessToken, {
    ...baseCookie,
    maxAge: env.auth.accessTtlMinutes * 60 * 1000,
  });
  res.cookie(COOKIES.REFRESH, refreshToken, {
    ...baseCookie,
    path: '/api/auth', // refresh token is only ever sent to auth endpoints
    maxAge: env.auth.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(COOKIES.ACCESS, baseCookie);
  res.clearCookie(COOKIES.REFRESH, { ...baseCookie, path: '/api/auth' });
}

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body.email, req.body.password, meta(req));
  setAuthCookies(res, result);
  res.json({ success: true, data: { user: result.user, redirectTo: result.user.redirectTo } });
});

exports.register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, meta(req));
  setAuthCookies(res, result);
  res.status(201).json({ success: true, data: { user: result.user, redirectTo: result.user.redirectTo } });
});

exports.refresh = asyncHandler(async (req, res) => {
  try {
    const result = await authService.refresh(req.cookies?.[COOKIES.REFRESH], meta(req));
    setAuthCookies(res, result);
    res.json({ success: true, data: { user: result.user } });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[COOKIES.REFRESH]);
  clearAuthCookies(res);
  res.json({ success: true, message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ success: true, data: { user } });
});
