const { scopedRouter, crudRoutes } = require('../crud');

const router = scopedRouter();

crudRoutes(router, '/titles', 'title');
crudRoutes(router, '/title-reigns', 'titleReign');

module.exports = router;
