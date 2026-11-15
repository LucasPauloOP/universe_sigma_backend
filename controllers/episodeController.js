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
const rivalries = require('../services/rivalryService');
const ai = require('../services/aiSegments');
const planner = require('../services/aiPlanner');

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

// Regras de rivalidade de um segmento do card (as mesmas da gravação individual): só lutas;
// começar e encerrar não juntos; encerrar exige a rivalidade; começar exige dois lados.
function rivalryProblem(seg) {
  if (seg.type !== 'MATCH') {
    Object.assign(seg, {
      startsRivalry: false,
      endsRivalry: false,
      rivalryId: null,
    });
    return null;
  }
  if (seg.startsRivalry && seg.endsRivalry) {
    return 'Uma luta não pode começar e encerrar uma rivalidade ao mesmo tempo';
  }
  if (seg.endsRivalry) {
    return seg.rivalryId ? null : 'Escolha a rivalidade a encerrar';
  }
  if (seg.startsRivalry) {
    delete seg.rivalryId;
    const sides = new Set((seg.participants ?? []).map((p) => p.side));
    return sides.size < 2
      ? 'Para começar uma rivalidade a luta precisa de lutadores em pelo menos dois lados'
      : null;
  }
  seg.rivalryId = null;
  return null;
}

// Monta (e grava) o card de um episódio. Compartilhado por buildCard e pela gravação em lote.
async function saveCard(universeId, episodeId, { segments, replace }) {
  const u = universeId;
  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, show: { universeId: u } },
  });
  if (!episode) throw new HttpError(404, 'Registro não encontrado');

  for (const seg of segments) {
    const problem = resultProblem(seg) || rivalryProblem(seg);
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
    'rivalry',
    segments.map((s) => s.rivalryId),
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
  // Rivalidades das lutas (cria/encerra), como na gravação individual.
  for (const row of rows) {
    if (row.startsRivalry || row.endsRivalry) {
      await rivalries.applySegmentRivalry(row.id, u, undefined);
    }
  }
  return rows;
}

// Monta o card de uma vez. Body: { replace?: boolean, segments: [...] }
// A ordem do array é a ordem do card; no máximo um segmento com isMainEvent.
exports.buildCard = asyncHandler(async (req, res) => {
  const rows = await saveCard(req.universe.id, req.params.id, req.body);
  res.status(201).json(await resolveImages(rows));
});

// Grava vários cards (planejamento de um período), em ordem cronológica. Cada episódio é
// independente: falha num não impede os outros. Body: { items: [{ episodeId, replace, segments }] }
exports.bulkCards = asyncHandler(async (req, res) => {
  const u = req.universe.id;
  const eps = await prisma.episode.findMany({
    where: {
      id: { in: req.body.items.map((i) => i.episodeId) },
      show: { universeId: u },
    },
    include: {
      show: true,
      season: { select: { number: true, startDate: true } },
    },
  });
  const date = new Map(
    eps.map((e) => [e.id, episodeDate(e, e.season).getTime()]),
  );
  const items = [...req.body.items].sort(
    (a, b) => (date.get(a.episodeId) ?? 0) - (date.get(b.episodeId) ?? 0),
  );
  const results = [];
  for (const item of items) {
    try {
      const rows = await saveCard(u, item.episodeId, item);
      results.push({ episodeId: item.episodeId, ok: true, count: rows.length });
    } catch (err) {
      results.push({
        episodeId: item.episodeId,
        ok: false,
        error: err.message,
      });
    }
  }
  res.json({ results });
});

// Sugere (sem gravar) o card de UM episódio com IA.
exports.suggest = asyncHandler(async (req, res) => {
  const u = req.universe.id;
  const episode = await prisma.episode.findFirst({
    where: { id: req.params.id, show: { universeId: u } },
    include: {
      show: true,
      season: { select: { number: true, startDate: true } },
    },
  });
  if (!episode) throw new HttpError(404, 'Registro não encontrado');
  const universe = await ai.loadUniverse(u);
  const result = await ai.suggestForEpisode(universe, episode, req.body);
  res.json(
    planner.toView(
      result.ctx,
      result,
      episode,
      episodeDate(episode, episode.season),
    ),
  );
});

// Planejamento de um período com IA: cria o job (202) e o front consulta o progresso.
exports.suggestRange = asyncHandler(async (req, res) => {
  const { job } = await planner.startRange(
    req.universe.id,
    req.userId,
    req.body,
  );
  res.status(202).json({ jobId: job.id, total: job.total });
});

exports.rangeStatus = asyncHandler(async (req, res) => {
  res.json(planner.getJob(req.universe.id, req.params.jobId));
});

exports.rangeCancel = asyncHandler(async (req, res) => {
  res.json(planner.cancelJob(req.universe.id, req.params.jobId));
});
