const { scopedRouter, crudRoutes } = require('../crud');

const router = scopedRouter();

crudRoutes(router, '/brands', 'brand');
crudRoutes(router, '/wrestlers', 'wrestler');
crudRoutes(router, '/teams', 'team');
crudRoutes(router, '/rivalries', 'rivalry');
// Tabelas de apoio do lutador
crudRoutes(router, '/alignments', 'alignment');
crudRoutes(router, '/divisions', 'division');
crudRoutes(router, '/weight-classes', 'weightClass');

module.exports = router;
