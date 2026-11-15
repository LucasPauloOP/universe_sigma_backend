const express = require('express');
const schemas = require('../../validators/schemas');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const loadUniverse = require('../../middleware/universe');
const universe = require('../../controllers/universeController');
const { scopedRouter } = require('../crud');

// Módulos que vivem DENTRO de um universe (/universes/:universeId/...)
const modules = [
  require('../roster'),
  require('../titles'),
  require('../shows'),
  require('../tournaments'),
  require('../media'),
  require('../stats'),
  require('../import'),
];

const router = express.Router();
router.use(requireAuth);

// Universes do usuário
router.get('/', universe.list);
router.post('/', validate(schemas.universe.create), universe.create);

// Um universe específico (só o dono acessa)
const scoped = scopedRouter();
router.use('/:universeId', loadUniverse, scoped);

scoped.get('/', universe.get);
scoped.put('/', validate(schemas.universe.update), universe.update);
scoped.patch('/', validate(schemas.universe.update), universe.update);
scoped.delete('/', universe.remove);
scoped.post('/reset', validate(schemas.universe.reset), universe.reset);

modules.forEach((m) => scoped.use(m));

module.exports = router;
