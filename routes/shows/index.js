const schemas = require('../../validators/schemas');
const validate = require('../../middleware/validate');
const episodes = require('../../controllers/episodeController');
const activation = require('../../controllers/activationController');
const aiLimit = require('../../middleware/aiLimit');
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
router.post(
  '/episodes/suggest-range',
  aiLimit,
  validate(schemas.suggestRange),
  episodes.suggestRange,
);
router.get('/episodes/suggest-range/:jobId', episodes.rangeStatus);
router.delete('/episodes/suggest-range/:jobId', episodes.rangeCancel);
router.post(
  '/episodes/segments/bulk',
  validate(schemas.bulkCards),
  episodes.bulkCards,
);
router.get('/episodes/:id/card', episodes.card);
router.post(
  '/episodes/:id/segments/suggest',
  aiLimit,
  validate(schemas.suggestSegments),
  episodes.suggest,
);
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
