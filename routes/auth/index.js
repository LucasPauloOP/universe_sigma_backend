const express = require('express');
const schemas = require('../../validators/schemas');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const auth = require('../../controllers/authController');

const router = express.Router();

router.post('/register', validate(schemas.auth.register), auth.register);
router.post('/login', validate(schemas.auth.login), auth.login);
router.post(
  '/forgot-password',
  validate(schemas.auth.forgotPassword),
  auth.forgotPassword,
);
router.post(
  '/reset-password',
  validate(schemas.auth.resetPassword),
  auth.resetPassword,
);
router.post('/refresh', validate(schemas.auth.refresh), auth.refresh);
router.post('/logout', validate(schemas.auth.refresh), auth.logout);
router.get('/me', requireAuth, auth.me);

module.exports = router;
