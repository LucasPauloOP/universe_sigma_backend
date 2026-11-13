// Torneio dentro do episódio: cada luta da chave pode ser agendada num episódio
// (ex.: King of the Ring — quartas e semis no RAW, final no PLE). A luta do torneio
// aponta para o segmento do card (TournamentMatch.segmentId) e o resultado desse
// segmento decide a vaga e avança a chave.
const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const { assertIds } = require('../utils/crud');
const card = require('./cardService');

const entrantInclude = {
  wrestler: true,
  team: { include: { members: { select: { wrestlerId: true } } } },
};

const matchInclude = {
  tournament: true,
  matchType: true,
  entrantA: { include: entrantInclude },
  entrantB: { include: entrantInclude },
  extras: {
    orderBy: { position: 'asc' },
    include: { entrant: { include: entrantInclude } },
  },
};

// Lutadores de um inscrito: ele mesmo, ou os integrantes da dupla.
const wrestlersOf = (entrant) => {
  if (!entrant) return [];
  if (entrant.wrestlerId) return [entrant.wrestlerId];
  return (entrant.team?.members ?? []).map((m) => m.wrestlerId);
};

// Todos os competidores da luta: A, B e os adicionais (triple threat, fatal 4-way...).
const competitors = (match) =>
  [
    match.entrantA,
    match.entrantB,
    ...(match.extras ?? []).map((x) => x.entrant),
  ].filter(Boolean);

// Participantes do segmento: lado 1 = A, lado 2 = B, lado 3 em diante = os adicionais.
// Cada competidor é um lado (em luta de duplas, os integrantes ficam juntos).
function participantsFor(match) {
  const sides = [
    match.entrantA,
    match.entrantB,
    ...(match.extras ?? []).map((x) => x.entrant),
  ];
  const used = new Set();
  const out = [];
  sides.forEach((entrant, i) => {
    for (const wrestlerId of wrestlersOf(entrant)) {
      if (used.has(wrestlerId)) continue;
      used.add(wrestlerId);
      out.push({ wrestlerId, side: i + 1, isWinner: false });
    }
  });
  return out;
}

// "Final", "Semifinal", "Quartas de final", "Rodada 1"... (eliminatória) ou o grupo.
function roundTitle(tournament, match) {
  if (tournament.format === 'ROUND_ROBIN') {
    return match.groupName ?? 'Fase de grupos';
  }
  const total = Math.round(Math.log2(tournament.size));
  const left = total - match.round;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinal';
  if (left === 2) return 'Quartas de final';
  return `Rodada ${match.round}`;
}

const findMatch = async (universeId, id) => {
  const match = await prisma.tournamentMatch.findFirst({
    where: { id, tournament: { universeId } },
    include: matchInclude,
  });
  if (!match) throw new HttpError(404, 'Registro não encontrado');
  return match;
};

// Reescreve os participantes do segmento ligado (se a luta ainda não foi realizada).
async function syncSegmentParticipants(matchId) {
  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    include: matchInclude,
  });
  if (!match?.segmentId) return;
  const segment = await prisma.segment.findUnique({
    where: { id: match.segmentId },
  });
  if (!segment || segment.isDone) return;
  await prisma.$transaction([
    // o tipo de luta/estipulação da chave vale também no card
    ...(match.matchTypeId
      ? [
          prisma.segment.update({
            where: { id: segment.id },
            data: { matchTypeId: match.matchTypeId },
          }),
        ]
      : []),
    prisma.segmentParticipant.deleteMany({
      where: { segmentId: segment.id },
    }),
    prisma.segmentParticipant.createMany({
      data: participantsFor(match).map((p) => ({
        ...p,
        segmentId: segment.id,
      })),
    }),
  ]);
}

// O vencedor da luta ocupa a vaga da rodada seguinte (eliminatória simples).
async function advanceWinner(match) {
  if (!match.winnerId) return;
  const tournament = await prisma.tournament.findUnique({
    where: { id: match.tournamentId },
  });
  if (tournament.format !== 'SINGLE_ELIMINATION') return;
  const next = await prisma.tournamentMatch.findUnique({
    where: {
      tournamentId_round_slot: {
        tournamentId: match.tournamentId,
        round: match.round + 1,
        slot: Math.ceil(match.slot / 2),
      },
    },
  });
  if (!next) return;
  await prisma.tournamentMatch.update({
    where: { id: next.id },
    data:
      match.slot % 2 === 1
        ? { entrantAId: match.winnerId }
        : { entrantBId: match.winnerId },
  });
  // se a próxima luta já está agendada, os participantes dela passam a ser os novos
  await syncSegmentParticipants(next.id);
}

// Qual inscrito venceu: o único que tem lutador entre os vencedores do segmento.
function winnerEntrantId(match, participants) {
  const winners = new Set(
    participants.filter((p) => p.isWinner).map((p) => p.wrestlerId),
  );
  if (!winners.size) return null;
  const winning = competitors(match).filter((e) =>
    wrestlersOf(e).some((w) => winners.has(w)),
  );
  return winning.length === 1 ? winning[0].id : null;
}

/**
 * Segmento salvo: se ele decide uma luta de torneio e foi realizado com vencedor,
 * a vaga é decidida e a chave avança.
 */
async function applySegmentResult(segment) {
  if (!segment.isDone || segment.isDraw) return;
  const match = await prisma.tournamentMatch.findFirst({
    where: { segmentId: segment.id },
    include: matchInclude,
  });
  if (!match) return;
  const entrantId = winnerEntrantId(match, segment.participants ?? []);
  if (!entrantId || entrantId === match.winnerId) return;
  const updated = await prisma.tournamentMatch.update({
    where: { id: match.id },
    data: { winnerId: entrantId },
  });
  await advanceWinner(updated);
}

// Tipo de luta quando ninguém escolheu: pelo número de competidores (Triple Threat,
// Fatal 4-Way, Battle Royal), Tag Team se algum lado é dupla, senão Singles.
function suggestedTypeName(match) {
  const n = competitors(match).length;
  if (n === 3) return 'Triple Threat';
  if (n === 4) return 'Fatal 4-Way';
  if (n > 4) return 'Battle Royal';
  return competitors(match).some((e) => wrestlersOf(e).length > 1)
    ? 'Tag Team'
    : 'Singles';
}

async function suggestedMatchType(universeId, match) {
  const type = await prisma.matchType.findFirst({
    where: { universeId, name: suggestedTypeName(match) },
  });
  return type?.id ?? null;
}

// Agenda a luta num episódio: cria o segmento com os participantes e liga à chave.
async function schedule(universeId, matchId, { episodeId, matchTypeId }) {
  const match = await findMatch(universeId, matchId);
  if (match.segmentId) {
    throw new HttpError(409, 'Esta luta já está agendada num episódio');
  }
  await assertIds('episode', [episodeId], universeId);
  if (matchTypeId) await assertIds('matchType', [matchTypeId], universeId);

  const segment = await card.createSegment(
    {
      episodeId,
      type: 'MATCH',
      // tipo escolhido agora > tipo da própria luta do torneio > sugestão pelo nº de competidores
      matchTypeId:
        matchTypeId ??
        match.matchTypeId ??
        (await suggestedMatchType(universeId, match)),
      notes: `${match.tournament.name} — ${roundTitle(match.tournament, match)}`,
      participants: { create: participantsFor(match) },
    },
    {},
  );
  await prisma.tournamentMatch.update({
    where: { id: match.id },
    data: { segmentId: segment.id, ...(matchTypeId ? { matchTypeId } : {}) },
  });
  return segment;
}

// Agenda todas as lutas ainda soltas de uma rodada no mesmo episódio.
async function scheduleRound(universeId, tournamentId, { round, episodeId }) {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, universeId },
  });
  if (!tournament) throw new HttpError(404, 'Registro não encontrado');
  const matches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, round },
    orderBy: { slot: 'asc' },
  });
  if (!matches.length) throw new HttpError(404, 'Rodada não encontrada');
  let scheduled = 0;
  for (const m of matches) {
    if (m.segmentId) continue;
    await schedule(universeId, m.id, { episodeId });
    scheduled++;
  }
  return { scheduled, skipped: matches.length - scheduled };
}

// Liga a luta da chave a um segmento que já existe (ou troca o vínculo).
async function link(universeId, matchId, segmentId) {
  const match = await findMatch(universeId, matchId);
  await assertIds('segment', [segmentId], universeId);
  const taken = await prisma.tournamentMatch.findFirst({
    where: { segmentId, id: { not: match.id } },
  });
  if (taken) {
    throw new HttpError(409, 'Este segmento já decide outra luta de torneio');
  }
  await prisma.tournamentMatch.update({
    where: { id: match.id },
    data: { segmentId },
  });
}

async function unlink(universeId, matchId) {
  const match = await findMatch(universeId, matchId);
  await prisma.tournamentMatch.update({
    where: { id: match.id },
    data: { segmentId: null },
  });
}

// Lutas de torneio ainda sem episódio (para escolher no cadastro da luta).
async function openMatches(universeId) {
  return prisma.tournamentMatch.findMany({
    where: {
      segmentId: null,
      winnerId: null,
      tournament: { universeId, status: { not: 'FINISHED' } },
    },
    include: matchInclude,
    orderBy: [{ tournamentId: 'asc' }, { round: 'asc' }, { slot: 'asc' }],
  });
}

module.exports = {
  wrestlersOf,
  participantsFor,
  roundTitle,
  competitors,
  suggestedTypeName,
  winnerEntrantId,
  syncSegmentParticipants,
  advanceWinner,
  applySegmentResult,
  schedule,
  scheduleRound,
  link,
  unlink,
  openMatches,
};
