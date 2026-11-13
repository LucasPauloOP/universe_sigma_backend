const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

// O que será apagado ao desativar um show: seus episódios (e os segmentos deles).
const showImpact = async (showIds) => ({
  episodes: await prisma.episode.count({ where: { showId: { in: showIds } } }),
  segments: await prisma.segment.count({
    where: { episode: { showId: { in: showIds } } },
  }),
});

exports.showImpactFor = showImpact;

// GET /shows/:id/impact
exports.show = asyncHandler(async (req, res) => {
  const show = await prisma.show.findFirst({
    where: { id: req.params.id, universeId: req.universe.id },
  });
  if (!show) throw new HttpError(404, 'Registro não encontrado');
  res.json({ shows: [show.name], ...(await showImpact([show.id])) });
});

// GET /brands/:id/impact — desativar a brand desativa todos os shows dela.
exports.brand = asyncHandler(async (req, res) => {
  const brand = await prisma.brand.findFirst({
    where: { id: req.params.id, universeId: req.universe.id },
  });
  if (!brand) throw new HttpError(404, 'Registro não encontrado');
  const shows = await prisma.show.findMany({
    where: { brandId: brand.id, isActive: true },
    select: { id: true, name: true },
  });
  res.json({
    shows: shows.map((s) => s.name),
    ...(await showImpact(shows.map((s) => s.id))),
  });
});
