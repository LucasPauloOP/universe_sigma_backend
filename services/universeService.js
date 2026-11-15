const { randomUUID } = require('crypto');
const prisma = require('../config/database');
const tpl = require('./defaultUniverse');
const { singleEliminationRows } = require('./bracket');
const roster = require('./defaultRoster.json');
const { seedDefaultDivisions } = require('./divisionService');
const {
  seedTitleHistory,
  titlesWithCurrentChampion,
} = require('./titleHistoryService');

const named = (universeId, names, extra = () => ({})) =>
  names.map((name, i) => ({
    id: randomUUID(),
    universeId,
    name,
    ...extra(name, i),
  }));

// Lutadores (com brands) e equipes/facções da planilha.
async function seedRoster(tx, universeId, brandId) {
  const wrestlers = roster.wrestlers.map((w) => ({
    id: randomUUID(),
    universeId,
    name: w.name,
    gender: w.gender,
    contractType: w.contractType,
    hasContract: w.hasContract,
    isInjured: w.isInjured,
    isActive: w.isActive,
    inTagDivision: w.inTagDivision,
    editStatus: w.editStatus,
    _brands: w.brands,
  }));
  await tx.wrestler.createMany({
    // eslint-disable-next-line no-unused-vars
    data: wrestlers.map(({ _brands, ...w }) => w),
  });
  await tx.wrestlerBrand.createMany({
    data: wrestlers.flatMap((w) =>
      w._brands.map((b) => ({ wrestlerId: w.id, brandId: brandId[b] })),
    ),
  });

  const byName = Object.fromEntries(wrestlers.map((w) => [w.name, w.id]));
  const teams = roster.teams.map((t) => ({ ...t, id: randomUUID() }));
  await tx.team.createMany({
    data: teams.map((t) => ({
      id: t.id,
      universeId,
      name: t.name,
      kind: t.kind,
    })),
  });
  await tx.teamMember.createMany({
    data: teams.flatMap((t) =>
      t.members
        .filter((m) => byName[m])
        .map((m) => ({ teamId: t.id, wrestlerId: byName[m] })),
    ),
  });
}

// Títulos e o reinado atual de cada um (campeões ausentes do roster são ignorados).
async function seedTitles(tx, universeId) {
  const wrestlers = await tx.wrestler.findMany({
    where: { universeId },
    select: { id: true, name: true },
  });
  const byName = Object.fromEntries(wrestlers.map((w) => [w.name, w.id]));
  const now = new Date();
  const fromHistory = titlesWithCurrentChampion();
  for (const [name, gender, isTag, champions] of tpl.TITLES) {
    // o campeão atual dos títulos da tabela de histórico vem de lá (titleHistoryService)
    const holders = fromHistory.has(name)
      ? []
      : champions.filter((c) => byName[c]);
    await tx.title.create({
      data: {
        universeId,
        name,
        gender,
        isTag,
        reigns: holders.length
          ? {
              create: {
                startDate: now,
                holders: {
                  create: holders.map((c) => ({ wrestlerId: byName[c] })),
                },
              },
            }
          : undefined,
      },
    });
  }
}

// Cria o conteúdo padrão (brands, títulos, shows, temporada 1 com os 12 meses
// de cards vazios e dois modelos de torneio). Roda dentro de uma transação.
async function seedUniverse(tx, universeId) {
  const brands = named(
    universeId,
    tpl.BRANDS.map((b) => b.name),
    (n) => {
      const b = tpl.BRANDS.find((x) => x.name === n);
      return { color: b.color, isActive: b.isActive !== false };
    },
  );
  const brandId = Object.fromEntries(brands.map((b) => [b.name, b.id]));

  const season = { id: randomUUID(), universeId, number: 1, name: 'Season 1' };

  const shows = [
    ...tpl.WEEKLY_SHOWS.map(([brand, name, weekday]) => ({
      id: randomUUID(),
      universeId,
      brandId: brandId[brand],
      name,
      kind: 'WEEKLY',
      weekday,
      // show de brand desativada nasce desativado (e sem episódios)
      isActive: brands.find((b) => b.name === brand)?.isActive !== false,
    })),
    ...tpl.PLES.map(([ppvMonth, name]) => ({
      id: randomUUID(),
      universeId,
      name,
      kind: 'PLE',
      ppvMonth,
    })),
    ...tpl.SPECIALS.map(([ppvMonth, name]) => ({
      id: randomUUID(),
      universeId,
      name,
      kind: 'SPECIAL',
      ppvMonth,
    })),
  ];

  const episodes = [];
  for (const show of shows.filter((x) => x.isActive !== false)) {
    if (show.kind === 'WEEKLY') {
      for (let month = 1; month <= 12; month++) {
        for (let week = 1; week <= 4; week++) {
          episodes.push({
            showId: show.id,
            seasonId: season.id,
            title: `${show.name} - Semana ${week}`,
            month,
            week,
          });
        }
      }
    } else {
      episodes.push({
        showId: show.id,
        seasonId: season.id,
        title: show.name,
        month: show.ppvMonth,
      });
    }
  }

  await tx.alignment.createMany({ data: named(universeId, tpl.ALIGNMENTS) });
  await tx.division.createMany({ data: named(universeId, tpl.DIVISIONS) });
  await tx.weightClass.createMany({
    data: named(universeId, tpl.WEIGHT_CLASSES),
  });
  await tx.matchType.createMany({ data: named(universeId, tpl.MATCH_TYPES) });
  await tx.brand.createMany({ data: brands });
  await seedRoster(tx, universeId, brandId);
  await seedTitles(tx, universeId);
  await tx.season.create({ data: season });
  await tx.show.createMany({ data: shows });
  await tx.episode.createMany({ data: episodes });
  // Precisam dos shows (brands com show) e dos títulos já criados:
  await seedDefaultDivisions(universeId, tx);
  // Histórico de reinados (tabela de estatísticas por título) + campeões atuais
  await seedTitleHistory(universeId, tx, { setCurrentChampions: true });

  for (const t of tpl.TEMPLATE_TOURNAMENTS) {
    const tournament = await tx.tournament.create({
      data: { universeId, seasonId: season.id, name: t.name, size: t.size },
    });
    await tx.tournamentMatch.createMany({
      data: singleEliminationRows(tournament.id, tournament),
    });
  }
}

// Apaga TUDO do universe (roster, cards, torneios...) e recria o padrão.
async function resetUniverse(universeId) {
  await prisma.$transaction(
    async (tx) => {
      const where = { universeId };
      await tx.tournament.deleteMany({ where });
      await tx.cardDivision.deleteMany({ where });
      await tx.rivalry.deleteMany({ where });
      await tx.team.deleteMany({ where });
      await tx.title.deleteMany({ where });
      await tx.show.deleteMany({ where }); // cascata: episódios e segmentos
      await tx.season.deleteMany({ where });
      await tx.wrestler.deleteMany({ where });
      await tx.brand.deleteMany({ where });
      await tx.matchType.deleteMany({ where });
      await tx.alignment.deleteMany({ where });
      await tx.division.deleteMany({ where });
      await tx.weightClass.deleteMany({ where });
      await seedUniverse(tx, universeId);
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

async function createUniverse(
  userId,
  { name, description, useTemplate = true },
) {
  return prisma.$transaction(
    async (tx) => {
      const universe = await tx.universe.create({
        data: { userId, name, description },
      });
      if (useTemplate) await seedUniverse(tx, universe.id);
      return universe;
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

module.exports = { seedUniverse, resetUniverse, createUniverse };
