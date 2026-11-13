const tournaments = require('../../controllers/tournamentController');
const { scopedRouter, crudRoutes } = require('../crud');

const router = scopedRouter();

crudRoutes(router, '/tournaments', 'tournament');
router.get('/tournaments/:id/bracket', tournaments.bracket);
router.post('/tournaments/:id/generate-bracket', tournaments.generateBracket);
crudRoutes(router, '/tournament-entrants', 'tournamentEntrant');
crudRoutes(router, '/tournament-matches', 'tournamentMatch');

module.exports = router;
