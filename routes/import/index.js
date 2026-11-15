const importer = require('../../controllers/importController');
const { scopedRouter } = require('../crud');

const router = scopedRouter();

// Importação da planilha do universe (rosters por brand, divisões e PLEs).
router.post('/import/universe-sheet', importer.single, importer.universeSheet);

module.exports = router;
