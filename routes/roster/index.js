const schemas = require('../../validators/schemas');
const validate = require('../../middleware/validate');
const divisions = require('../../controllers/divisionController');
const activation = require('../../controllers/activationController');
const { scopedRouter, crudRoutes } = require('../crud');

const router = scopedRouter();

router.get('/brands/:id/impact', activation.brand);
crudRoutes(router, '/brands', 'brand');

// Divisões de card (ranking). Rotas especiais ANTES de /card-divisions/:id
router.get('/card-divisions/board', divisions.board);
router.post('/card-divisions/defaults', divisions.defaults);
router.put(
  '/card-divisions/:id/entries',
  validate(schemas.divisionEntries),
  divisions.setEntries,
);
router.put(
  '/card-divisions/:id/champion',
  validate(schemas.divisionChampion),
  divisions.setChampion,
);
crudRoutes(router, '/card-divisions', 'cardDivision');
crudRoutes(router, '/wrestlers', 'wrestler');
crudRoutes(router, '/teams', 'team');
crudRoutes(router, '/rivalries', 'rivalry');
// Tabelas de apoio do lutador
crudRoutes(router, '/alignments', 'alignment');
crudRoutes(router, '/divisions', 'division');
crudRoutes(router, '/weight-classes', 'weightClass');

module.exports = router;
