// Rivalidades automáticas a partir das lutas:
//  - uma luta pode COMEÇAR uma rivalidade (criada com os lados da luta);
//  - se a luta montada reconhece uma rivalidade ativa, ela pode ENCERRÁ-LA: ao finalizar a luta
//    com resultado, o lado vencedor vira o ganhador (empate encerra sem vencedor);
//  - o envolvido é um lutador OU uma dupla/facção (como unidade), sempre de um lado (side).
// O estado é recalculado a cada gravação da luta (idempotente): desmarcar ou desfazer o
// resultado reabre a rivalidade; apagar a luta que a começou apaga a rivalidade se ficou órfã.
const prisma = require('../config/database');
const { winnerHolders } = require('./reignService');
const { episodeInclude, dateOf } = require('./universeClock');

const memberInclude = {
  wrestler: true,
  team: { include: { members: { select: { wrestlerId: true } } } },
};

/** O envolvido está na luta? Lutador: está escalado. Dupla: todos os integrantes. Facção: um basta. */
function unitMatches(member, ids) {
  if (member.wrestlerId) return ids.has(member.wrestlerId);
  const members = (member.team?.members ?? []).map((m) => m.wrestlerId);
  if (!members.length) return false;
  return member.team?.kind === 'FACTION'
    ? members.some((id) => ids.has(id))
    : members.every((id) => ids.has(id));
}

/**
 * Rivalidades ativas "reconhecidas" pela luta: há envolvidos de pelo menos dois lados da
 * rivalidade escalados (rivalidades antigas, de um lado só, pedem ao menos dois envolvidos).
 */
function recognize(rivalries, wrestlerIds) {
  const ids = new Set(wrestlerIds);
  return rivalries.filter((r) => {
    if (!r.isActive) return false;
    const matched = r.members.filter((m) => unitMatches(m, ids));
    if (matched.length < 2) return false;
    const allSides = new Set(r.members.map((m) => m.side));
    const matchedSides = new Set(matched.map((m) => m.side));
    return allSides.size === 1 || matchedSides.size >= 2;
  });
}

/**
 * Lados da luta como envolvidos da rivalidade. Se o lado inteiro é uma dupla/facção
 * cadastrada (todos os integrantes, 2 ou mais), vira UM envolvido (o time); o resto entra
 * como lutadores. `teams`: [{ id, name, members: [{ wrestlerId }] }].
 */
function buildSides(participants, teams, nameOf) {
  const bySide = new Map();
  for (const p of participants) {
    if (!bySide.has(p.side)) bySide.set(p.side, []);
    bySide.get(p.side).push(p.wrestlerId);
  }
  const candidates = teams
    .map((t) => ({ ...t, ids: t.members.map((m) => m.wrestlerId) }))
    .filter((t) => t.ids.length >= 2)
    .sort((a, b) => b.ids.length - a.ids.length);
  const sides = [];
  for (const side of [...bySide.keys()].sort((a, b) => a - b)) {
    let rest = new Set(bySide.get(side));
    const units = [];
    for (const t of candidates) {
      if (t.ids.every((id) => rest.has(id))) {
        units.push({ teamId: t.id, name: t.name });
        t.ids.forEach((id) => rest.delete(id));
      }
    }
    for (const id of rest) units.push({ wrestlerId: id, name: nameOf(id) });
    sides.push({ side: sides.length + 1, units });
  }
  return sides;
}

const sidesName = (sides) =>
  sides.map((s) => s.units.map((u) => u.name).join(' & ')).join(' vs ');

/** Lado da rivalidade que venceu a luta (null = sem vencedor claro, ex.: empate). */
function winnerSideOf(members, participants) {
  const winners = new Set(winnerHolders(participants));
  if (!winners.size) return null;
  const won = new Set(
    members.filter((m) => unitMatches(m, winners)).map((m) => m.side),
  );
  return won.size === 1 ? [...won][0] : null;
}

const reopen = (db, rivalryId) =>
  db.rivalry.updateMany({
    where: { id: rivalryId },
    data: { isActive: true, endDate: null, winnerSide: null },
  });

async function deleteIfOrphan(db, rivalryId, exceptSegmentId) {
  const left = await db.segment.count({
    where: {
      rivalryId,
      ...(exceptSegmentId ? { id: { not: exceptSegmentId } } : {}),
    },
  });
  if (!left) await db.rivalry.deleteMany({ where: { id: rivalryId } });
}

async function createFromSegment(seg, universeId) {
  const teams = await prisma.team.findMany({
    where: { universeId },
    include: { members: { select: { wrestlerId: true } } },
  });
  const names = new Map(
    seg.participants.map((p) => [p.wrestlerId, p.wrestler?.name ?? '?']),
  );
  const sides = buildSides(
    seg.participants,
    teams,
    (id) => names.get(id) ?? '?',
  );
  return { sides, name: sidesName(sides) };
}

const memberRows = (sides) =>
  sides.flatMap((s) =>
    s.units.map((u) => ({
      side: s.side,
      wrestlerId: u.wrestlerId ?? null,
      teamId: u.teamId ?? null,
    })),
  );

/**
 * Recalcula a rivalidade ligada à luta depois de gravá-la. `current` = estado anterior da
 * luta (undefined na criação). Devolve os campos que mudaram na luta (para a resposta).
 */
async function applySegmentRivalry(segmentId, universeId, current) {
  const load = () =>
    prisma.segment.findUnique({
      where: { id: segmentId },
      include: {
        participants: { include: { wrestler: true } },
        episode: { include: episodeInclude },
      },
    });
  let seg = await load();
  if (!seg) return null;

  // 1) o que esta luta tinha encerrado volta a valer só se o resultado continuar valendo (passo 3)
  if (current?.rivalryApplied && current.rivalryId) {
    await reopen(prisma, current.rivalryId);
    await prisma.segment.update({
      where: { id: segmentId },
      data: { rivalryApplied: false },
    });
    seg = { ...seg, rivalryApplied: false };
  }

  // 2) começar: cria a rivalidade (ou atualiza os lados enquanto só esta luta a usa)
  if (seg.startsRivalry) {
    const { sides, name } = await createFromSegment(seg, universeId);
    if (!seg.rivalryId) {
      const rivalry = await prisma.rivalry.create({
        data: {
          universeId,
          name,
          startDate: dateOf(seg.episode),
          members: { create: memberRows(sides) },
        },
      });
      await prisma.segment.update({
        where: { id: segmentId },
        data: { rivalryId: rivalry.id },
      });
      seg = { ...seg, rivalryId: rivalry.id };
    } else {
      const used = await prisma.segment.count({
        where: { rivalryId: seg.rivalryId },
      });
      if (used === 1) {
        await prisma.$transaction([
          prisma.rivalryMember.deleteMany({
            where: { rivalryId: seg.rivalryId },
          }),
          prisma.rivalryMember.createMany({
            data: memberRows(sides).map((m) => ({
              ...m,
              rivalryId: seg.rivalryId,
            })),
          }),
        ]);
      }
    }
  }

  // deixou de começar a rivalidade: se ninguém mais a usa, ela some
  if (
    current?.startsRivalry &&
    current.rivalryId &&
    seg.rivalryId !== current.rivalryId
  ) {
    await deleteIfOrphan(prisma, current.rivalryId, null);
  }

  // 3) encerrar: luta realizada com resultado fecha a rivalidade e define o ganhador
  if (seg.endsRivalry && seg.rivalryId && seg.isDone) {
    const rivalry = await prisma.rivalry.findUnique({
      where: { id: seg.rivalryId },
      include: { members: { include: memberInclude } },
    });
    if (rivalry) {
      await prisma.rivalry.update({
        where: { id: rivalry.id },
        data: {
          isActive: false,
          endDate: dateOf(seg.episode),
          winnerSide: seg.isDraw
            ? null
            : winnerSideOf(rivalry.members, seg.participants),
        },
      });
      await prisma.segment.update({
        where: { id: segmentId },
        data: { rivalryApplied: true },
      });
    }
  }

  return prisma.segment.findUnique({
    where: { id: segmentId },
    select: {
      rivalryId: true,
      rivalryApplied: true,
      rivalry: {
        select: { id: true, name: true, isActive: true, winnerSide: true },
      },
    },
  });
}

/** Apagar a luta: reabre o que ela encerrou e remove a rivalidade que só ela sustentava. */
async function onSegmentRemoved(db, current) {
  if (!current.rivalryId) return;
  if (current.rivalryApplied) await reopen(db, current.rivalryId);
  if (current.startsRivalry) {
    // a luta ainda existe aqui (é apagada em seguida): conta as outras
    await deleteIfOrphan(db, current.rivalryId, current.id);
  }
}

/** Rivalidades ativas reconhecidas por uma lista de lutadores (GET /rivalries/match). */
async function matchRivalries(universeId, wrestlerIds) {
  const rivalries = await prisma.rivalry.findMany({
    where: { universeId, isActive: true },
    include: {
      members: { include: memberInclude },
      segments: {
        select: { id: true, startsRivalry: true, endsRivalry: true },
      },
    },
    orderBy: { name: 'asc' },
  });
  return recognize(rivalries, wrestlerIds);
}

module.exports = {
  unitMatches,
  recognize,
  buildSides,
  sidesName,
  winnerSideOf,
  applySegmentRivalry,
  onSegmentRemoved,
  matchRivalries,
  memberInclude,
};
