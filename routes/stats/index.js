const stats = require('../../controllers/statsController');
const { scopedRouter } = require('../crud');

const router = scopedRouter();

// Estatísticas calculadas a partir das lutas
router.get('/wrestlers/:id/record', stats.wrestlerRecord);
router.get('/titles/:id/history', stats.titleHistory);
router.get('/stats/titles', stats.titleStats);

module.exports = router;
