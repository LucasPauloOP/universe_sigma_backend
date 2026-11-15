const prisma = require('../config/database');
const { applyTitleChangeToDivisions } = require('./divisionService');
const { episodeInclude, dateOf } = require('./universeClock');

/**
 * Quem ganhou a luta: os participantes do lado vencedor (um único lado precisa ter
 * vencedor marcado). Devolve [] se não der para saber.
 */
function winnerHolders(participants) {
  const sides = [
    ...new Set(participants.filter((p) => p.isWinner).map((p) => p.side)),
  ];
  if (sides.length !== 1) return [];
  const ids = participants
    .filter((p) => p.side === sides[0])
    .map((p) => p.wrestlerId);
  return [...new Set(ids)];
}

const sameSet = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x));

// Data do novo reinado: a do episódio (real ou calculada pelo mês/semana dele).
async function reignStartDate(segment) {
  const episode = await prisma.episode.findUnique({
    where: { id: segment.episodeId },
    include: episodeInclude,
  });
  return dateOf(episode);
}

/**
 * Luta realizada, valendo título e marcada com "houve troca de campeão": cria o reinado
 * do vencedor, fecha o anterior e ajusta a fila das divisões do título (o novo campeão
 * sai da fila; o ex-campeão entra no meio). Acontece UMA vez por luta
 * (o reinado guarda a luta em wonAtSegmentId).
 */
async function applyTitleChangeFromSegment(segment, universeId) {
  if (!segment.isDone || !segment.titleChanged || !segment.titleId) return null;
  const winners = winnerHolders(segment.participants ?? []);
  if (!winners.length) return null;

  const done = await prisma.titleReign.findFirst({
    where: { wonAtSegmentId: segment.id },
  });
  if (done) return null;

  const startDate = await reignStartDate(segment);
  const created = await prisma.$transaction(async (tx) => {
    const prev = await tx.titleReign.findFirst({
      where: { titleId: segment.titleId, endDate: null },
      include: { holders: true },
    });
    const prevIds = (prev?.holders ?? [])
      .map((h) => h.wrestlerId)
      .filter(Boolean);
    // quem ganhou já era o campeão: não houve troca de fato
    if (prev && sameSet(prevIds, winners)) return null;

    if (prev) {
      await tx.titleReign.update({
        where: { id: prev.id },
        data: { endDate: startDate },
      });
    }
    await tx.titleReign.create({
      data: {
        titleId: segment.titleId,
        startDate,
        wonAtSegmentId: segment.id,
        holders: { create: winners.map((wrestlerId) => ({ wrestlerId })) },
      },
    });
    return {
      previous: (prev?.holders ?? []).map((h) => ({
        wrestlerId: h.wrestlerId,
        teamId: h.teamId,
      })),
    };
  });
  if (!created) return null;

  await applyTitleChangeToDivisions(
    universeId,
    segment.titleId,
    created.previous,
    winners.map((wrestlerId) => ({ wrestlerId, teamId: null })),
  );
  return created;
}

module.exports = { winnerHolders, applyTitleChangeFromSegment };
