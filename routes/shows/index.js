const schemas = require('../../validators/schemas');
const validate = require('../../middleware/validate');
const episodes = require('../../controllers/episodeController');
const activation = require('../../controllers/activationController');
const { scopedRouter, crudRoutes } = require('../crud');

const router = scopedRouter();

crudRoutes(router, '/seasons', 'season');
router.get('/shows/:id/impact', activation.show);
crudRoutes(router, '/shows', 'show');
crudRoutes(router, '/match-types', 'matchType');

// Rotas especiais de episódio ANTES de /episodes/:id
router.post(
  '/episodes/generate',
  validate(schemas.generateEpisodes),
  episodes.generate,
);
router.get('/episodes/:id/card', episodes.card);
router.post(
  '/episodes/:id/segments',
  validate(schemas.buildCard),
  episodes.buildCard,
);
router.put(
  '/episodes/:id/segments/order',
  validate(schemas.reorderSegments),
  episodes.reorder,
);
crudRoutes(router, '/episodes', 'episode');
crudRoutes(router, '/segments', 'segment');

module.exports = router;
