const history = require('../../controllers/titleHistoryController');
const { scopedRouter, crudRoutes } = require('../crud');

const router = scopedRouter();

crudRoutes(router, '/titles', 'title');
crudRoutes(router, '/title-reigns', 'titleReign');
router.post('/title-baselines/defaults', history.importDefaults);
crudRoutes(router, '/title-baselines', 'titleBaseline');

module.exports = router;
