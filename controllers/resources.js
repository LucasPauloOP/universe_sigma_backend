const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const { makeCrud } = require('../utils/crud');
const card = require('../services/cardService');

// create => { create: [...] } | update => substitui a lista inteira
const setMany = (mode, items) =>
  mode === 'create' ? { create: items } : { deleteMany: {}, create: items };

// Valida participantes e monta a escrita aninhada de um segmento.
const segmentToData = ({ participants, ...rest }, mode) => {
  if (participants) {
    const seen = new Set();
    for (const p of participants) {
      if (seen.has(p.wrestlerId)) {
        throw new HttpError(400, 'Lutador repetido no mesmo segmento');
      }
      seen.add(p.wrestlerId);
    }
    rest.participants = setMany(mode, participants);
  }
  return rest;
};

const simple = (model, extra = {}) =>
  makeCrud({ model, hasUniverseId: true, orderBy: { name: 'asc' }, ...extra });

const resources = {
  alignment: simple('alignment'),
  division: simple('division'),
  weightClass: simple('weightClass'),
  matchType: simple('matchType'),

  brand: simple('brand'),

  wrestler: simple('wrestler', {
    include: {
      brands: { include: { brand: true } },
      alignment: true,
      division: true,
      weightClass: true,
    },
    filters: [
      'gender',
      'isActive',
      'isInjured',
      'contractType',
      'inTagDivision',
      'editStatus',
      'alignmentId',
      'divisionId',
      'weightClassId',
    ],
    refs: {
      alignmentId: 'alignment',
      divisionId: 'division',
      weightClassId: 'weightClass',
    },
    nested: (b) => [{ model: 'brand', ids: b.brandIds || [] }],
    toData: ({ brandIds, ...rest }, mode) => {
      if (brandIds) {
        rest.brands = setMany(
          mode,
          brandIds.map((brandId) => ({ brandId })),
        );
      }
      return rest;
    },
  }),

  team: simple('team', {
    include: { members: { include: { wrestler: true } } },
    filters: ['kind'],
    nested: (b) => [{ model: 'wrestler', ids: b.memberIds || [] }],
    toData: ({ memberIds, ...rest }, mode) => {
      if (memberIds) {
        rest.members = setMany(
          mode,
          memberIds.map((wrestlerId) => ({ wrestlerId })),
        );
      }
      return rest;
    },
  }),

  title: simple('title', {
    include: { brand: true },
    filters: ['brandId', 'gender', 'isTag', 'isActive'],
    refs: { brandId: 'brand' },
  }),

  titleReign: makeCrud({
    model: 'titleReign',
    include: {
      title: true,
      holders: { include: { wrestler: true, team: true } },
    },
    orderBy: { startDate: 'desc' },
    filters: ['titleId'],
    refs: { titleId: 'title', wonAtSegmentId: 'segment' },
    nested: (b) => [
      { model: 'wrestler', ids: (b.holders || []).map((h) => h.wrestlerId) },
      { model: 'team', ids: (b.holders || []).map((h) => h.teamId) },
    ],
    toData: ({ holders, ...rest }, mode) => {
      if (holders) rest.holders = setMany(mode, holders);
      return rest;
    },
    // Novo reinado em aberto fecha o anterior do mesmo título.
    beforeWrite: async (data, { mode }) => {
      if (mode !== 'create' || data.endDate) return;
      await prisma.titleReign.updateMany({
        where: { titleId: data.titleId, endDate: null },
        data: { endDate: data.startDate },
      });
    },
  }),

  season: simple('season', { orderBy: { number: 'asc' } }),

  show: simple('show', {
    include: { brand: true },
    filters: ['brandId', 'kind'],
    refs: { brandId: 'brand' },
  }),

  episode: makeCrud({
    model: 'episode',
    include: { show: true },
    orderBy: [{ month: 'asc' }, { week: 'asc' }],
    filters: ['showId', 'seasonId', 'month', 'week', 'status'],
    refs: { showId: 'show', seasonId: 'season' },
  }),

  segment: makeCrud({
    model: 'segment',
    include: {
      matchType: true,
      title: true,
      participants: { include: { wrestler: true } },
    },
    orderBy: { position: 'asc' },
    filters: ['episodeId', 'type', 'titleId', 'isDone'],
    refs: { episodeId: 'episode', matchTypeId: 'matchType', titleId: 'title' },
    nested: (b) => [
      {
        model: 'wrestler',
        ids: (b.participants || []).map((p) => p.wrestlerId),
      },
    ],
    toData: segmentToData,
    // Ordem livre e main event único: ver services/cardService.js
    persist: {
      create: (data, include) => card.createSegment(data, include),
      update: (id, data, current, include) =>
        card.updateSegment(id, data, current, include),
      remove: (current) => card.removeSegment(current),
    },
  }),

  tournament: simple('tournament', {
    include: { _count: { select: { entrants: true, matches: true } } },
    orderBy: { startDate: 'desc' },
    filters: ['seasonId', 'status', 'format'],
    refs: { seasonId: 'season' },
  }),

  tournamentEntrant: makeCrud({
    model: 'tournamentEntrant',
    include: { wrestler: true, team: true },
    orderBy: { seed: 'asc' },
    filters: ['tournamentId'],
    refs: {
      tournamentId: 'tournament',
      wrestlerId: 'wrestler',
      teamId: 'team',
    },
  }),

  rivalry: simple('rivalry', {
    include: { members: { include: { wrestler: true } } },
    orderBy: { name: 'asc' },
    filters: ['isActive'],
    nested: (b) => [{ model: 'wrestler', ids: b.wrestlerIds || [] }],
    toData: ({ wrestlerIds, ...rest }, mode) => {
      if (wrestlerIds) {
        rest.members = setMany(
          mode,
          wrestlerIds.map((wrestlerId) => ({ wrestlerId })),
        );
      }
      return rest;
    },
  }),
};

// Lutas do torneio: valida vínculos e avança o vencedor na chave.
resources.tournamentMatch = makeCrud({
  model: 'tournamentMatch',
  include: { entrantA: true, entrantB: true, winner: true, segment: true },
  orderBy: [{ round: 'asc' }, { slot: 'asc' }],
  filters: ['tournamentId', 'round'],
  refs: { tournamentId: 'tournament', segmentId: 'segment' },
  beforeWrite: async (data, { current }) => {
    const tournamentId = data.tournamentId || current.tournamentId;
    const ids = [data.entrantAId, data.entrantBId, data.winnerId].filter(
      Boolean,
    );
    if (ids.length) {
      const n = await prisma.tournamentEntrant.count({
        where: { id: { in: [...new Set(ids)] }, tournamentId },
      });
      if (n !== new Set(ids).size) {
        throw new HttpError(400, 'Participante não pertence a este torneio');
      }
    }
    const a = data.entrantAId ?? current?.entrantAId;
    const b = data.entrantBId ?? current?.entrantBId;
    if (data.winnerId && data.winnerId !== a && data.winnerId !== b) {
      throw new HttpError(400, 'O vencedor deve ser um dos lados da luta');
    }
  },
  afterWrite: async (row) => {
    if (!row.winnerId) return;
    const t = await prisma.tournament.findUnique({
      where: { id: row.tournamentId },
    });
    if (t.format !== 'SINGLE_ELIMINATION') return;
    const next = await prisma.tournamentMatch.findUnique({
      where: {
        tournamentId_round_slot: {
          tournamentId: row.tournamentId,
          round: row.round + 1,
          slot: Math.ceil(row.slot / 2),
        },
      },
    });
    if (!next) return;
    await prisma.tournamentMatch.update({
      where: { id: next.id },
      data:
        row.slot % 2 === 1
          ? { entrantAId: row.winnerId }
          : { entrantBId: row.winnerId },
    });
  },
});

module.exports = resources;
module.exports.segmentToData = segmentToData;
