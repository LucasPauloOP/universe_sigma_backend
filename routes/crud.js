const express = require('express');
const schemas = require('../validators/schemas');
const validate = require('../middleware/validate');
const resources = require('../controllers/resources');
const { mountCrud } = require('../utils/crud');

// Router já com :universeId herdado do pai.
const scopedRouter = () => express.Router({ mergeParams: true });

// Monta GET/POST/GET:id/PUT/PATCH/DELETE de um recurso (ver controllers/resources.js).
const crudRoutes = (router, path, key) =>
  mountCrud(router, path, resources[key], schemas[key], validate);

module.exports = { scopedRouter, crudRoutes };
