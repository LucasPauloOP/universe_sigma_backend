const express = require('express');
const schemas = require('../../validators/schemas');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const auth = require('../../controllers/authController');

const router = express.Router();

router.post('/register', validate(schemas.auth.register), auth.register);
router.post('/login', validate(schemas.auth.login), auth.login);
router.get('/me', requireAuth, auth.me);

module.exports = router;
