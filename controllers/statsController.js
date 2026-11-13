const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { resolveImages } = require('../services/storage');
const { buildTitleStats } = require('../services/titleStats');
const { gameDaysBetween } = require('../services/timeline');
const {
  universeNow,
  episodeInclude,
  dateOf,
} = require('../services/universeClock');

// Vitórias/derrotas/empates calculados a partir das lutas já realizadas.
exports.wrestlerRecord = asyncHandler(async (req, res) => {
  const wrestler = await prisma.wrestler.findFirst({
    where: { id: req.params.id, universeId: req.universe.id },
  });
  if (!wrestler) throw new HttpError(404, 'Registro não encontrado');

  const rows = await prisma.segmentParticipant.findMany({
    where: {
      wrestlerId: wrestler.id,
      segment: { type: 'MATCH', isDone: true },
    },
    include: { segment: { include: { participants: true } } },
  });

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const r of rows) {
    const anyWinner = r.segment.participants.some((p) => p.isWinner);
    if (r.segment.isDraw || !anyWinner) draws++;
    else if (r.isWinner) wins++;
    else losses++;
  }
  const titleReigns = await prisma.reignHolder.count({
    where: { wrestlerId: wrestler.id },
  });
  res.json({
    wrestlerId: wrestler.id,
    matches: rows.length,
    wins,
    losses,
    draws,
    titleReigns,
  });
});

// Histórico do título: reinados, dias e defesas (lutas realizadas sem troca).
exports.titleHistory = asyncHandler(async (req, res) => {
  const title = await prisma.title.findFirst({
    where: { id: req.params.id, universeId: req.universe.id },
  });
  if (!title) throw new HttpError(404, 'Registro não encontrado');

  const reigns = await prisma.titleReign.findMany({
    where: { titleId: title.id },
    orderBy: { startDate: 'asc' },
    include: { holders: { include: { wrestler: true, team: true } } },
  });
  const defenses = await prisma.segment.findMany({
    where: {
      titleId: title.id,
      isDone: true,
      titleChanged: false,
    },
    include: { episode: { include: episodeInclude } },
  });

  // Reinado em aberto conta até "hoje" no universe (último episódio realizado).
  const now = (await universeNow(req.universe.id))?.getTime() ?? Date.now();
  res.json({
    title,
    reigns: reigns.map((r) => {
      const end = r.endDate ? r.endDate.getTime() : now;
      return {
        ...r,
        days: gameDaysBetween(r.startDate, new Date(end)),
        defenses: defenses.filter((d) => {
          const t = dateOf(d.episode).getTime();
          return t >= r.startDate.getTime() && t <= end;
        }).length,
      };
    }),
  });
});

// Estatísticas de reinados de todos os títulos: histórico anterior (baseline) +
// reinados do universe. Reinados em aberto contam até a data do último episódio
// realizado (linha do tempo do universe), e não até o dia de hoje.
exports.titleStats = asyncHandler(async (req, res) => {
  const universeId = req.universe.id;
  const [titles, reigns, baselines, clock] = await Promise.all([
    prisma.title.findMany({ where: { universeId } }),
    prisma.titleReign.findMany({
      where: { title: { universeId } },
      include: { holders: { include: { wrestler: true, team: true } } },
    }),
    prisma.titleBaseline.findMany({
      where: { title: { universeId } },
      include: { wrestler: true, team: true },
    }),
    universeNow(universeId),
  ]);

  // Sem episódio realizado com data: usa o fim do reinado mais recente, ou hoje.
  const latestReignDate = reigns
    .map((r) => r.endDate ?? r.startDate)
    .sort((a, b) => b - a)[0];
  const asOf = clock ?? latestReignDate ?? new Date();

  const stats = buildTitleStats({ asOf, titles, reigns, baselines });
  res.json(await resolveImages(JSON.parse(JSON.stringify(stats))));
});
