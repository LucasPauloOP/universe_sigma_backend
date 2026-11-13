const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/universes', require('./universe'));

module.exports = router;
