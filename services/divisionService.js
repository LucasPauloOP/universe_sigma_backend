const { randomUUID } = require('crypto');
const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const {
  applyStakes,
  applyTitleChange,
  entryKey,
  wKey,
  tKey,
} = require('./divisionRanking');
const { buildDefaultDivisions } = require('./defaultDivisions');

const entryInclude = {
  wrestler: true,
  team: { include: { members: { select: { wrestlerId: true } } } },
};

// Troca a lista inteira da divisão (a posição é o índice + 1).
// items: [{ wrestlerId } | { teamId }]
async function replaceEntries(divisionId, items, client = prisma) {
  const run = async (tx) => {
    await tx.cardDivisionEntry.deleteMany({ where: { divisionId } });
    if (items.length) {
      await tx.cardDivisionEntry.createMany({
        data: items.map((it, i) => ({
          divisionId,
          position: i + 1,
          wrestlerId: it.wrestlerId ?? null,
          teamId: it.teamId ?? null,
        })),
      });
    }
  };
  return client.$transaction ? client.$transaction(run) : run(client);
}

const keyToItem = (key) =>
  key.startsWith('w:')
    ? { wrestlerId: key.slice(2) }
    : { teamId: key.slice(2) };

/**
 * Chamado depois de salvar um segmento. Se a luta foi realizada, tem algo em jogo
 * (subida de divisão / desafiante), uma divisão e um vencedor, mexe no ranking
 * UMA vez (rankingApplied evita reaplicar ao editar a luta de novo).
 */
async function applySegmentStakes(segment) {
  if (
    !segment.isDone ||
    segment.rankingApplied ||
    !segment.cardDivisionId ||
    !segment.stakes ||
    segment.stakes === 'NONE'
  ) {
    return;
  }
  const entries = await prisma.cardDivisionEntry.findMany({
    where: { divisionId: segment.cardDivisionId },
    orderBy: { position: 'asc' },
    include: entryInclude,
  });
  const list = entries.map(entryKey);
  const result = applyStakes({
    stakes: segment.stakes,
    list,
    entries,
    participants: segment.participants ?? [],
  });
  if (result.changed) {
    await replaceEntries(segment.cardDivisionId, result.list.map(keyToItem));
  }
  await prisma.segment.update({
    where: { id: segment.id },
    data: { rankingApplied: true },
  });
}

/**
 * Troca de campeão de um título: em toda divisão que disputa esse título, os novos
 * campeões saem da fila e os ex-campeões entram no meio dela.
 * holders: [{ wrestlerId, teamId }]
 */
async function applyTitleChangeToDivisions(
  universeId,
  titleId,
  previous,
  current,
) {
  const divisions = await prisma.cardDivision.findMany({
    where: { universeId, titleId, isActive: true },
    select: { id: true },
  });
  if (!divisions.length) return;

  const title = await prisma.title.findUnique({ where: { id: titleId } });
  const wrestlerIds = (hs) => hs.map((h) => h.wrestlerId).filter(Boolean);

  // Ex-campeões de um título de duplas (lutadores soltos): usa a dupla cadastrada, se houver.
  const outgoing = [];
  for (const h of previous.filter((x) => x.teamId))
    outgoing.push(tKey(h.teamId));
  const prevW = wrestlerIds(previous);
  if (prevW.length) {
    let team = null;
    if (title?.isTag && prevW.length >= 2) {
      const teams = await prisma.team.findMany({
        where: { universeId },
        include: { members: { select: { wrestlerId: true } } },
      });
      team = teams.find((t) => {
        const ids = new Set(t.members.map((m) => m.wrestlerId));
        return prevW.length === ids.size && prevW.every((id) => ids.has(id));
      });
    }
    if (team) outgoing.push(tKey(team.id));
    else prevW.forEach((id) => outgoing.push(wKey(id)));
  }

  const newW = new Set(wrestlerIds(current));
  const newT = new Set(current.map((h) => h.teamId).filter(Boolean));

  for (const { id } of divisions) {
    const entries = await prisma.cardDivisionEntry.findMany({
      where: { divisionId: id },
      orderBy: { position: 'asc' },
      include: entryInclude,
    });
    const list = entries.map(entryKey);
    const incoming = entries
      .filter((e) => {
        if (e.teamId) {
          if (newT.has(e.teamId)) return true;
          const members = (e.team?.members ?? []).map((m) => m.wrestlerId);
          return (
            newW.size > 0 &&
            members.length > 0 &&
            (members.every((m) => newW.has(m)) ||
              [...newW].every((w) => members.includes(w)))
          );
        }
        return newW.has(e.wrestlerId);
      })
      .map(entryKey);
    const next = applyTitleChange({ list, incoming, outgoing });
    if (next.length !== list.length || next.some((k, i) => k !== list[i])) {
      await replaceEntries(id, next.map(keyToItem));
    }
  }
}

// Cria as divisões padrão que ainda não existem (ver defaultDivisions.js). Idempotente:
// pode ser chamada de novo sem duplicar. Devolve quantas criou.
async function seedDefaultDivisions(universeId, client = prisma) {
  const [shows, titles, existing] = await Promise.all([
    client.show.findMany({
      where: { universeId, brandId: { not: null } },
      select: { brandId: true },
    }),
    client.title.findMany({ where: { universeId } }),
    client.cardDivision.findMany({
      where: { universeId },
      include: { brands: { select: { brandId: true } } },
    }),
  ]);
  const brandIds = [...new Set(shows.map((s) => s.brandId))];
  const brands = brandIds.length
    ? await client.brand.findMany({
        where: { id: { in: brandIds } },
        orderBy: { name: 'asc' },
      })
    : [];
  const rows = buildDefaultDivisions({
    brands,
    titleIdByName: Object.fromEntries(titles.map((t) => [t.name, t.id])),
    existing: existing.map((d) => ({
      name: d.name,
      brandIds: d.brands.map((b) => b.brandId),
    })),
  });
  // Em lote (createMany): o seed roda numa transação com tempo limite.
  const withIds = rows.map((r) => ({ ...r, id: randomUUID() }));
  if (withIds.length) {
    await client.cardDivision.createMany({
      data: withIds.map((r) => ({
        id: r.id,
        universeId,
        name: r.name,
        gender: r.gender,
        titleId: r.titleId,
        order: r.order,
        isActive: r.isActive,
      })),
    });
    await client.cardDivisionBrand.createMany({
      data: withIds.flatMap((r) =>
        r.brandIds.map((brandId) => ({ divisionId: r.id, brandId })),
      ),
    });
  }
  return rows.length;
}

// Quadro: divisões (com brands, título, campeão atual e ranking), opcionalmente de uma brand.
async function board(universeId, brandId) {
  const divisions = await prisma.cardDivision.findMany({
    where: {
      universeId,
      ...(brandId ? { brands: { some: { brandId } } } : {}),
    },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: {
      brands: { include: { brand: true } },
      title: true,
      entries: { orderBy: { position: 'asc' }, include: entryInclude },
    },
  });
  const titleIds = [
    ...new Set(divisions.map((d) => d.titleId).filter(Boolean)),
  ];
  const reigns = titleIds.length
    ? await prisma.titleReign.findMany({
        where: { titleId: { in: titleIds }, endDate: null },
        include: { holders: { include: { wrestler: true, team: true } } },
      })
    : [];
  const champs = new Map(reigns.map((r) => [r.titleId, r]));
  return divisions.map((d) => {
    const reign = d.titleId ? champs.get(d.titleId) : null;
    const champions = (reign?.holders ?? []).map((h) => ({
      wrestlerId: h.wrestlerId,
      teamId: h.teamId,
      name: h.wrestler?.name ?? h.team?.name ?? '?',
      imageUrl: h.wrestler?.imageUrl ?? h.team?.imageUrl ?? null,
    }));
    return { ...d, champions, championSince: reign?.startDate ?? null };
  });
}

function assertBody(items) {
  const seen = new Set();
  for (const it of items) {
    const key = it.wrestlerId ? `w:${it.wrestlerId}` : `t:${it.teamId}`;
    if (seen.has(key))
      throw new HttpError(400, 'Participante repetido na divisão');
    seen.add(key);
  }
}

const holderKey = (h) => (h.wrestlerId ? wKey(h.wrestlerId) : tKey(h.teamId));

/**
 * Define o campeão do título de uma divisão.
 *  - 'fix': corrige o campeão atual (troca os holders do reinado aberto; sem reinado novo).
 *  - 'change': troca de título de verdade (fecha o reinado e abre outro na data atual do universe).
 * holders vazio = título vago. Atualiza as filas das divisões que disputam o título.
 */
async function setChampion(universeId, division, { mode, holders }) {
  const title = await prisma.title.findUnique({
    where: { id: division.titleId },
  });
  const wrestlers = holders.filter((h) => h.wrestlerId);
  const teams = holders.filter((h) => h.teamId);
  if (title.isTag) {
    const ok =
      (teams.length === 1 && !wrestlers.length) ||
      (!teams.length && wrestlers.length === 2);
    if (holders.length && !ok)
      throw new HttpError(
        422,
        'Título de duplas: escolha 1 dupla ou 2 lutadores',
      );
  } else if (holders.length && !(wrestlers.length === 1 && !teams.length)) {
    throw new HttpError(422, 'Título individual: escolha 1 lutador');
  }

  const { universeNow } = require('./universeClock');
  const now = (await universeNow(universeId)) ?? new Date();
  const prev = await prisma.titleReign.findFirst({
    where: { titleId: title.id, endDate: null },
    include: { holders: true },
  });
  const prevHolders = (prev?.holders ?? []).map((h) => ({
    wrestlerId: h.wrestlerId,
    teamId: h.teamId,
  }));
  const same =
    prevHolders.length === holders.length &&
    prevHolders.every((p) =>
      holders.some((h) => holderKey(h) === holderKey(p)),
    );
  if (same) return { changed: false };

  const data = holders.map((h) => ({
    wrestlerId: h.wrestlerId ?? null,
    teamId: h.teamId ?? null,
  }));
  await prisma.$transaction(async (tx) => {
    if (mode === 'fix' && prev) {
      await tx.reignHolder.deleteMany({ where: { reignId: prev.id } });
      if (data.length)
        await tx.reignHolder.createMany({
          data: data.map((d) => ({ ...d, reignId: prev.id })),
        });
      return;
    }
    if (prev) {
      const end = now < prev.startDate ? prev.startDate : now;
      await tx.titleReign.update({
        where: { id: prev.id },
        data: { endDate: end },
      });
    }
    if (data.length) {
      await tx.titleReign.create({
        data: { titleId: title.id, startDate: now, holders: { create: data } },
      });
    }
  });

  await applyTitleChangeToDivisions(
    universeId,
    title.id,
    mode === 'change' ? prevHolders : [],
    data,
  );
  return { changed: true };
}

module.exports = {
  setChampion,
  replaceEntries,
  applySegmentStakes,
  applyTitleChangeToDivisions,
  seedDefaultDivisions,
  board,
  assertBody,
};
