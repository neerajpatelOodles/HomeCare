const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { loginBody, registerBody } = require('./auth.validation');
const controller = require('./auth.controller');

// Brute-force protection on login only.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, try again later' },
});

router.post('/login', loginLimiter, validate({ body: loginBody }), controller.login);
router.post('/register', validate({ body: registerBody }), controller.register);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
