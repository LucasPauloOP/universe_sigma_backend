const express = require('express');
const schemas = require('../validators/schemas');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const loadUniverse = require('../middleware/universe');
const { mountCrud } = require('../utils/crud');
const resources = require('../controllers/resources');
const auth = require('../controllers/authController');
const universe = require('../controllers/universeController');
const episodes = require('../controllers/episodeController');
const tournaments = require('../controllers/tournamentController');
const stats = require('../controllers/statsController');
const uploads = require('../controllers/uploadController');

const router = express.Router();

// ── Auth (público) ──
router.post('/auth/register', validate(schemas.auth.register), auth.register);
router.post('/auth/login', validate(schemas.auth.login), auth.login);
router.get('/auth/me', requireAuth, auth.me);

// ── Universes do usuário ──
router.get('/universes', requireAuth, universe.list);
router.post(
  '/universes',
  requireAuth,
  validate(schemas.universe.create),
  universe.create,
);

// ── Tudo abaixo vive dentro de um universe ──
const u = express.Router({ mergeParams: true });
router.use('/universes/:universeId', requireAuth, loadUniverse, u);

u.get('/', universe.get);
u.put('/', validate(schemas.universe.update), universe.update);
u.patch('/', validate(schemas.universe.update), universe.update);
u.delete('/', universe.remove);
u.post('/reset', validate(schemas.universe.reset), universe.reset);

const crud = (path, key) =>
  mountCrud(u, path, resources[key], schemas[key], validate);

crud('/alignments', 'alignment');
crud('/divisions', 'division');
crud('/weight-classes', 'weightClass');
crud('/brands', 'brand');
crud('/wrestlers', 'wrestler');
crud('/teams', 'team');
crud('/titles', 'title');
crud('/title-reigns', 'titleReign');
crud('/seasons', 'season');
crud('/shows', 'show');
crud('/match-types', 'matchType');
crud('/rivalries', 'rivalry');

// Episódios: rotas especiais ANTES de /episodes/:id
u.post(
  '/episodes/generate',
  validate(schemas.generateEpisodes),
  episodes.generate,
);
u.get('/episodes/:id/card', episodes.card);
u.put(
  '/episodes/:id/segments/order',
  validate(schemas.reorderSegments),
  episodes.reorder,
);
crud('/episodes', 'episode');
crud('/segments', 'segment');

// Torneios
crud('/tournaments', 'tournament');
u.get('/tournaments/:id/bracket', tournaments.bracket);
u.post('/tournaments/:id/generate-bracket', tournaments.generateBracket);
crud('/tournament-entrants', 'tournamentEntrant');
crud('/tournament-matches', 'tournamentMatch');

// Upload de imagens (Neon Object Storage). Salve o `imageUrl` retornado.
u.post('/uploads', uploads.single, uploads.create);

// Estatísticas calculadas
u.get('/wrestlers/:id/record', stats.wrestlerRecord);
u.get('/titles/:id/history', stats.titleHistory);

module.exports = router;
