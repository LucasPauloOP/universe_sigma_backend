const asyncHandler = require('../utils/asyncHandler');
const { resolveImages } = require('../services/storage');
const svc = require('../services/tournamentLink');

// GET /tournaments/open-matches — lutas de torneio ainda sem episódio.
exports.openMatches = asyncHandler(async (req, res) => {
  res.json(await resolveImages(await svc.openMatches(req.universe.id)));
});

// POST /tournament-matches/:id/schedule { episodeId, matchTypeId? }
exports.schedule = asyncHandler(async (req, res) => {
  const segment = await svc.schedule(req.universe.id, req.params.id, req.body);
  res.status(201).json(await resolveImages(segment));
});

// POST /tournament-matches/:id/unlink — desvincula (o segmento continua no card).
exports.unlink = asyncHandler(async (req, res) => {
  await svc.unlink(req.universe.id, req.params.id);
  res.status(204).end();
});

// POST /tournaments/:id/schedule-round { round, episodeId }
exports.scheduleRound = asyncHandler(async (req, res) => {
  res
    .status(201)
    .json(await svc.scheduleRound(req.universe.id, req.params.id, req.body));
});
