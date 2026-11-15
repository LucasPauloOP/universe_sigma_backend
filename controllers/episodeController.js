const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { assertIds } = require('../utils/crud');
const { resolveImages } = require('../services/storage');
const card = require('../services/cardService');
const { segmentToData } = require('./resources');
const { monthsFrom, missingNights } = require('../services/seasonCalendar');
const { episodeDate } = require('../services/timeline');
const { resultProblem } = require('../services/segmentResult');

// Cria os episódios que faltam: shows semanais (N semanas por mês) e PLEs
// (um por mês, no ppvMonth). Não duplica o que já existe.
exports.generate = asyncHandler(async (req, res) => {
  const { seasonId, showIds, months, weeks } = req.body;
  const u = req.universe.id;
  await assertIds('season', [seasonId], u);
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (showIds) await assertIds('show', showIds, u);

  // Shows desativados (ou de brand desativada) não ganham episódios.
  const shows = await prisma.show.findMany({
    where: {
      universeId: u,
      isActive: true,
      OR: [{ brandId: null }, { brand: { isActive: true } }],
      ...(showIds ? { id: { in: showIds } } : {}),
    },
  });
  // Sem meses informados: do mês em que o universe começa nesta temporada até abril.
  const monthList = months || monthsFrom(season.startMonth);

  const existing = await prisma.episode.findMany({
    where: { seasonId, showId: { in: shows.map((s) => s.id) } },
    select: { showId: true, month: true, week: true, night: true },
  });
  const has = new Set(
    existing.map((e) => `${e.showId}:${e.month}:${e.week ?? 0}`),
  );

  // PLE que passou a ter duas noites: o episódio que já existia vira a Noite 1.
  const twoNights = shows.filter((x) => x.kind !== 'WEEKLY' && x.nights > 1);
  if (twoNights.length) {
    await prisma.episode.updateMany({
      where: {
        seasonId,
        night: null,
        showId: { in: twoNights.map((x) => x.id) },
      },
      data: { night: 1 },
    });
    existing.forEach((e) => {
      if (e.night == null && twoNights.some((x) => x.id === e.showId))
        e.night = 1;
    });
  }

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
      } else if (show.ppvMonth === month) {
        // PLE/especial: um episódio por noite (Noite 1 / Noite 2), em qualquer semana
        // já cadastrada (não duplica ao definir a semana depois).
        const nights = show.nights ?? 1;
        const present = existing
          .filter((e) => e.showId === show.id && e.month === month)
          .map((e) => e.night);
        for (const night of missingNights(nights, present)) {
          data.push({
            showId: show.id,
            seasonId,
            month,
            week: show.ppvWeek ?? null,
            night: nights > 1 ? night : null,
            title: nights > 1 ? `${show.name} - Noite ${night}` : show.name,
          });
        }
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
      season: { select: { number: true, startDate: true } },
      segments: {
        orderBy: { position: 'asc' },
        include: {
          matchType: true,
          title: true,
          cardDivision: true,
          tournamentMatch: { include: { tournament: true } },
          participants: { include: { wrestler: true } },
        },
      },
    },
  });
  if (!episode) throw new HttpError(404, 'Registro não encontrado');
  res.json(
    await resolveImages({
      ...episode,
      date: episodeDate(episode, episode.season),
    }),
  );
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

// Monta o card de uma vez. Body: { replace?: boolean, segments: [...] }
// A ordem do array é a ordem do card; no máximo um segmento com isMainEvent.
exports.buildCard = asyncHandler(async (req, res) => {
  const u = req.universe.id;
  const episode = await prisma.episode.findFirst({
    where: { id: req.params.id, show: { universeId: u } },
  });
  if (!episode) throw new HttpError(404, 'Registro não encontrado');

  const { segments, replace } = req.body;
  for (const seg of segments) {
    const problem = resultProblem(seg);
    if (problem) throw new HttpError(400, problem);
  }
  await assertIds(
    'cardDivision',
    segments.map((s) => s.cardDivisionId),
    u,
  );
  await assertIds(
    'matchType',
    segments.map((s) => s.matchTypeId),
    u,
  );
  await assertIds(
    'title',
    segments.map((s) => s.titleId),
    u,
  );
  await assertIds(
    'wrestler',
    segments.flatMap((s) => (s.participants || []).map((p) => p.wrestlerId)),
    u,
  );

  const rows = await card.createCard(episode.id, segments, {
    replace,
    toData: segmentToData,
    include: {
      matchType: true,
      title: true,
      participants: { include: { wrestler: true } },
    },
  });
  res.status(201).json(await resolveImages(rows));
});
