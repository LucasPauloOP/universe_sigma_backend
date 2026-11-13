const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const DAY = 24 * 60 * 60 * 1000;

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
    if (!anyWinner) draws++;
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
      episode: { airDate: { not: null } },
    },
    include: { episode: { select: { airDate: true } } },
  });

  const now = Date.now();
  res.json({
    title,
    reigns: reigns.map((r) => {
      const end = r.endDate ? r.endDate.getTime() : now;
      return {
        ...r,
        days: Math.max(0, Math.floor((end - r.startDate.getTime()) / DAY)),
        defenses: defenses.filter((d) => {
          const t = d.episode.airDate.getTime();
          return t >= r.startDate.getTime() && t <= end;
        }).length,
      };
    }),
  });
});
