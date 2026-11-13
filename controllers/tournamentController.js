const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { resolveImages } = require('../services/storage');
const {
  singleEliminationRows,
  roundRobinRows,
  seedFirstRound,
} = require('../services/bracket');

const findTournament = async (req) => {
  const t = await prisma.tournament.findFirst({
    where: { id: req.params.id, universeId: req.universe.id },
  });
  if (!t) throw new HttpError(404, 'Registro não encontrado');
  return t;
};

// Chave completa: rodadas -> lutas, já com participantes e luta vinculada.
exports.bracket = asyncHandler(async (req, res) => {
  const tournament = await findTournament(req);
  const [entrants, matches] = await Promise.all([
    prisma.tournamentEntrant.findMany({
      where: { tournamentId: tournament.id },
      include: { wrestler: true, team: true },
      orderBy: { seed: 'asc' },
    }),
    prisma.tournamentMatch.findMany({
      where: { tournamentId: tournament.id },
      include: {
        entrantA: { include: { wrestler: true, team: true } },
        entrantB: { include: { wrestler: true, team: true } },
        winner: { include: { wrestler: true, team: true } },
        segment: { include: { episode: { include: { show: true } } } },
      },
      orderBy: [{ round: 'asc' }, { slot: 'asc' }],
    }),
  ]);
  res.json(await resolveImages({ tournament, entrants, matches }));
});

// (Re)gera as lutas vazias da chave a partir do tamanho/formato e dos
// participantes cadastrados. Apaga a chave anterior.
exports.generateBracket = asyncHandler(async (req, res) => {
  const t = await findTournament(req);
  const entrants = await prisma.tournamentEntrant.findMany({
    where: { tournamentId: t.id },
    orderBy: [{ seed: 'asc' }, { id: 'asc' }],
  });
  if (entrants.length > t.size) {
    throw new HttpError(400, 'Há mais participantes do que vagas no torneio');
  }
  const ids = entrants.map((e) => e.id);

  const rows =
    t.format === 'ROUND_ROBIN'
      ? roundRobinRows(t.id, ids)
      : seedFirstRound(singleEliminationRows(t.id, t.size), ids);

  await prisma.$transaction([
    prisma.tournamentMatch.deleteMany({ where: { tournamentId: t.id } }),
    prisma.tournamentMatch.createMany({ data: rows }),
  ]);
  res.status(201).json({ created: rows.length });
});
