const router = require('express').Router();
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { loginLimiter, registerLimiter } = require('../../middleware/rateLimiters');
const { loginBody, registerBody, setPasswordBody } = require('./auth.validation');
const controller = require('./auth.controller');

router.post('/login', loginLimiter, validate({ body: loginBody }), controller.login);
// Public signup creates CLIENT accounts only.
router.post('/register', registerLimiter, validate({ body: registerBody }), controller.register);
// Public: used by the link in a caregiver's invite email.
router.post('/set-password', registerLimiter, validate({ body: setPasswordBody }), controller.setPassword);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
