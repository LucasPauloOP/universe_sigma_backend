const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { assertIds } = require('../utils/crud');
const { resolveImages } = require('../services/storage');

// Cria os episódios que faltam: shows semanais (N semanas por mês) e PLEs
// (um por mês, no ppvMonth). Não duplica o que já existe.
exports.generate = asyncHandler(async (req, res) => {
  const { seasonId, showIds, months, weeks } = req.body;
  const u = req.universe.id;
  await assertIds('season', [seasonId], u);
  if (showIds) await assertIds('show', showIds, u);

  const shows = await prisma.show.findMany({
    where: { universeId: u, ...(showIds ? { id: { in: showIds } } : {}) },
  });
  const monthList = months || Array.from({ length: 12 }, (_, i) => i + 1);

  const existing = await prisma.episode.findMany({
    where: { seasonId, showId: { in: shows.map((s) => s.id) } },
    select: { showId: true, month: true, week: true },
  });
  const has = new Set(
    existing.map((e) => `${e.showId}:${e.month}:${e.week ?? 0}`),
  );

  const data = [];
  for (const show of shows) {
    for (const month of monthList) {
      if (show.kind === 'WEEKLY') {
        for (let week = 1; week <= weeks; week++) {
          if (has.has(`${show.id}:${month}:${week}`)) continue;
          data.push({
            showId: show.id,
            seasonId,
            month,
            week,
            title: `${show.name} - Semana ${week}`,
          });
        }
      } else if (show.ppvMonth === month && !has.has(`${show.id}:${month}:0`)) {
        data.push({ showId: show.id, seasonId, month, title: show.name });
      }
    }
  }
  const result = await prisma.episode.createMany({ data });
  res.status(201).json({ created: result.count });
});

// Card completo de um episódio, já ordenado.
exports.card = asyncHandler(async (req, res) => {
  const episode = await prisma.episode.findFirst({
    where: { id: req.params.id, show: { universeId: req.universe.id } },
    include: {
      show: true,
      segments: {
        orderBy: { position: 'asc' },
        include: {
          matchType: true,
          title: true,
          participants: { include: { wrestler: true } },
        },
      },
    },
  });
  if (!episode) throw new HttpError(404, 'Registro não encontrado');
  res.json(await resolveImages(episode));
});

// Reordena o card: body { order: [idSegmento1, idSegmento2, ...] }
exports.reorder = asyncHandler(async (req, res) => {
  const { order } = req.body;
  const episode = await prisma.episode.findFirst({
    where: { id: req.params.id, show: { universeId: req.universe.id } },
    include: { segments: { select: { id: true } } },
  });
  if (!episode) throw new HttpError(404, 'Registro não encontrado');

  const current = new Set(episode.segments.map((s) => s.id));
  if (order.length !== current.size || !order.every((id) => current.has(id))) {
    throw new HttpError(
      400,
      'A lista deve conter exatamente os segmentos do episódio',
    );
  }

  // Duas fases para não violar o @@unique([episodeId, position]).
  await prisma.$transaction([
    ...order.map((id, i) =>
      prisma.segment.update({ where: { id }, data: { position: -(i + 1) } }),
    ),
    ...order.map((id, i) =>
      prisma.segment.update({ where: { id }, data: { position: i + 1 } }),
    ),
  ]);
  res.json({ order });
});
