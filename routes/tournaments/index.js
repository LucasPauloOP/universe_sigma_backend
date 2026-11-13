const schemas = require('../../validators/schemas');
const validate = require('../../middleware/validate');
const tournaments = require('../../controllers/tournamentController');
const links = require('../../controllers/tournamentLinkController');
const { scopedRouter, crudRoutes } = require('../crud');

const router = scopedRouter();

// Rotas especiais ANTES de /tournaments/:id
router.get('/tournaments/open-matches', links.openMatches);
crudRoutes(router, '/tournaments', 'tournament');
router.post(
  '/tournaments/:id/schedule-round',
  validate(schemas.scheduleRound),
  links.scheduleRound,
);
router.get('/tournaments/:id/bracket', tournaments.bracket);
router.post('/tournaments/:id/generate-bracket', tournaments.generateBracket);
crudRoutes(router, '/tournament-entrants', 'tournamentEntrant');
router.post(
  '/tournament-matches/:id/schedule',
  validate(schemas.scheduleMatch),
  links.schedule,
);
router.post('/tournament-matches/:id/unlink', links.unlink);
crudRoutes(router, '/tournament-matches', 'tournamentMatch');

module.exports = router;
