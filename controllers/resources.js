const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const { makeCrud } = require('../utils/crud');
const card = require('../services/cardService');
const divisions = require('../services/divisionService');
const reigns = require('../services/reignService');
const { resultProblem } = require('../services/segmentResult');
const tournamentLink = require('../services/tournamentLink');
const { episodeDate } = require('../services/timeline');
const { showImpactFor } = require('./activationController');

// create => { create: [...] } | update => substitui a lista inteira
const setMany = (mode, items) =>
  mode === 'create' ? { create: items } : { deleteMany: {}, create: items };

// Valida participantes e monta a escrita aninhada de um segmento.
// eslint-disable-next-line no-unused-vars
const segmentToData = ({ participants, tournamentMatchId, ...rest }, mode) => {
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

  brand: simple('brand', {
    filters: ['isActive'],
    toData: ({ confirm, ...rest }) => rest, // eslint-disable-line no-unused-vars
    // Desativar a brand desativa seus shows e apaga os episódios deles.
    beforeWrite: async (data, { req, mode, current }) => {
      if (mode !== 'update' || data.isActive !== false || !current.isActive)
        return;
      const shows = await prisma.show.findMany({
        where: { brandId: current.id, isActive: true },
        select: { id: true },
      });
      const impact = await showImpactFor(shows.map((x) => x.id));
      if ((shows.length || impact.episodes) && !req.body.confirm) {
        throw new HttpError(
          409,
          'Desativar a brand desativa os shows dela e apaga os episódios. Confirme para continuar.',
          { code: 'CONFIRMATION_REQUIRED', shows: shows.length, ...impact },
        );
      }
    },
    persist: {
      update: (id, data, current, include) =>
        prisma.$transaction(async (tx) => {
          if (data.isActive === false && current.isActive) {
            await tx.episode.deleteMany({ where: { show: { brandId: id } } });
            await tx.show.updateMany({
              where: { brandId: id },
              data: { isActive: false },
            });
          }
          const updated = await tx.brand.update({
            where: { id },
            data,
            include,
          });
          // Divisões da brand ficam ativas se ALGUMA das suas brands estiver ativa
          // (uma divisão compartilhada continua valendo enquanto outra brand a usa).
          if (
            data.isActive !== undefined &&
            data.isActive !== current.isActive
          ) {
            const divs = await tx.cardDivision.findMany({
              where: { brands: { some: { brandId: id } } },
              include: {
                brands: { include: { brand: { select: { isActive: true } } } },
              },
            });
            for (const d of divs) {
              const active = d.brands.some((b) => b.brand.isActive);
              if (active !== d.isActive) {
                await tx.cardDivision.update({
                  where: { id: d.id },
                  data: { isActive: active },
                });
              }
            }
          }
          return updated;
        }),
    },
  }),

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
    // Novo reinado em aberto fecha o anterior do mesmo título (guardando quem era o campeão).
    beforeWrite: async (data, { req, mode }) => {
      if (mode !== 'create' || data.endDate) return;
      const prev = await prisma.titleReign.findFirst({
        where: { titleId: data.titleId, endDate: null },
        include: { holders: true },
      });
      req.previousHolders = prev?.holders ?? [];
      await prisma.titleReign.updateMany({
        where: { titleId: data.titleId, endDate: null },
        data: { endDate: data.startDate },
      });
    },
    // Troca de campeão mexe nas divisões do título: o novo campeão sai da fila e o
    // ex-campeão entra no meio dela.
    afterWrite: async (row, { req, mode }) => {
      if (mode !== 'create' || row.endDate) return;
      await divisions.applyTitleChangeToDivisions(
        req.universe.id,
        row.titleId,
        req.previousHolders ?? [],
        row.holders,
      );
    },
  }),

  titleBaseline: makeCrud({
    model: 'titleBaseline',
    include: { title: true, wrestler: true, team: true },
    orderBy: { reigns: 'desc' },
    filters: ['titleId'],
    refs: { titleId: 'title', wrestlerId: 'wrestler', teamId: 'team' },
  }),

  season: simple('season', { orderBy: { number: 'asc' } }),

  show: simple('show', {
    include: { brand: true },
    filters: ['brandId', 'kind', 'isActive'],
    refs: { brandId: 'brand' },
    toData: ({ confirm, ...rest }) => rest, // eslint-disable-line no-unused-vars
    // Desativar o show apaga todos os episódios dele (precisa de confirmação).
    beforeWrite: async (data, { req, mode, current }) => {
      if (mode !== 'update' || data.isActive !== false || !current.isActive)
        return;
      const impact = await showImpactFor([current.id]);
      if (impact.episodes && !req.body.confirm) {
        throw new HttpError(
          409,
          'Desativar o show apaga todos os episódios dele. Confirme para continuar.',
          { code: 'CONFIRMATION_REQUIRED', ...impact },
        );
      }
      // Reativar um show de brand desativada não faz sentido.
    },
    persist: {
      update: (id, data, current, include) =>
        prisma.$transaction(async (tx) => {
          if (data.isActive === false && current.isActive) {
            await tx.episode.deleteMany({ where: { showId: id } });
          }
          return tx.show.update({ where: { id }, data, include });
        }),
    },
  }),

  cardDivision: simple('cardDivision', {
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: {
      brands: { include: { brand: true } },
      title: true,
      entries: {
        orderBy: { position: 'asc' },
        include: { wrestler: true, team: true },
      },
    },
    filters: ['gender', 'titleId', 'isActive'],
    refs: { titleId: 'title' },
    nested: (b) => [{ model: 'brand', ids: b.brandIds || [] }],
    // brandIds: a divisão pode pertencer a mais de uma brand
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

  episode: makeCrud({
    model: 'episode',
    include: {
      show: true,
      season: { select: { number: true, startDate: true } },
      _count: { select: { segments: true } },
    },
    // `date`: a data do episódio (a preenchida ou a calculada pelo dia do show + semana)
    decorate: (e) => ({ ...e, date: episodeDate(e, e.season) }),
    orderBy: [{ month: 'asc' }, { week: 'asc' }],
    filters: ['showId', 'seasonId', 'month', 'week', 'status'],
    refs: { showId: 'show', seasonId: 'season' },
    beforeWrite: async (data, { mode }) => {
      if (mode !== 'create') return;
      const show = await prisma.show.findUnique({ where: { id: data.showId } });
      if (show && !show.isActive) {
        throw new HttpError(
          400,
          'Show desativado: ative-o antes de criar episódios',
        );
      }
    },
  }),

  segment: makeCrud({
    model: 'segment',
    include: {
      matchType: true,
      title: true,
      cardDivision: true,
      tournamentMatch: { include: { tournament: true } },
      participants: { include: { wrestler: true } },
    },
    orderBy: { position: 'asc' },
    filters: ['episodeId', 'type', 'titleId', 'isDone'],
    refs: {
      episodeId: 'episode',
      matchTypeId: 'matchType',
      titleId: 'title',
      cardDivisionId: 'cardDivision',
    },
    beforeWrite: async (data, { req, current }) => {
      // Luta de torneio escolhida: precisa ser do universe e não estar ligada a outro segmento.
      if (req.body.tournamentMatchId) {
        const m = await prisma.tournamentMatch.findFirst({
          where: {
            id: req.body.tournamentMatchId,
            tournament: { universeId: req.universe.id },
          },
        });
        if (!m) throw new HttpError(400, 'Luta de torneio inválida');
        if (m.segmentId && m.segmentId !== current?.id) {
          throw new HttpError(409, 'Esta luta do torneio já está num episódio');
        }
      }
      // Realizada = com resultado (vencedor/lado vencedor + como terminou, ou empate).
      const problem = resultProblem({
        type: data.type ?? current?.type,
        isDone: data.isDone ?? current?.isDone ?? false,
        isDraw: data.isDraw ?? current?.isDraw ?? false,
        finishType:
          data.finishType !== undefined ? data.finishType : current?.finishType,
        participants: req.body.participants ?? current?.participants ?? [],
      });
      if (problem) throw new HttpError(400, problem);
      const stakes = data.stakes ?? current?.stakes ?? 'NONE';
      const division = data.cardDivisionId ?? current?.cardDivisionId;
      if (stakes !== 'NONE' && !division) {
        throw new HttpError(400, 'Escolha a divisão afetada por esta luta');
      }
      // mudou o que está em jogo / a divisão: o resultado pode valer de novo
      if (
        current &&
        ((data.stakes !== undefined && data.stakes !== current.stakes) ||
          (data.cardDivisionId !== undefined &&
            data.cardDivisionId !== current.cardDivisionId))
      ) {
        data.rankingApplied = false;
      }
    },
    // Luta realizada: aplica o ranking (subida/desafiante) e a troca de campeão (cria o
    // reinado e ajusta a fila). Cada uma acontece uma vez por luta.
    afterWrite: async (row, { req }) => {
      // Vínculo com a chave do torneio (null = desvincula; ausente = não mexe)
      const tm = req.body.tournamentMatchId;
      if (tm !== undefined) {
        await prisma.tournamentMatch.updateMany({
          where: { segmentId: row.id },
          data: { segmentId: null },
        });
        if (tm) {
          await prisma.tournamentMatch.update({
            where: { id: tm },
            data: { segmentId: row.id },
          });
        }
      }
      // Resultado do segmento decide a vaga e avança a chave
      await tournamentLink.applySegmentResult(row);
      await divisions.applySegmentStakes(row);
      await reigns.applyTitleChangeFromSegment(row, req.universe.id);
    },
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
  include: {
    entrantA: true,
    entrantB: true,
    winner: true,
    segment: true,
    matchType: true,
    extras: { orderBy: { position: 'asc' }, include: { entrant: true } },
  },
  orderBy: [{ round: 'asc' }, { slot: 'asc' }],
  filters: ['tournamentId', 'round'],
  refs: {
    tournamentId: 'tournament',
    segmentId: 'segment',
    matchTypeId: 'matchType',
  },
  // extraEntrantIds: 3º, 4º... competidores (triple threat, fatal 4-way...)
  toData: ({ extraEntrantIds, ...rest }, mode) => {
    if (extraEntrantIds) {
      rest.extras = setMany(
        mode,
        extraEntrantIds.map((entrantId, i) => ({ entrantId, position: i + 1 })),
      );
    }
    return rest;
  },
  beforeWrite: async (data, { req, current }) => {
    const tournamentId = data.tournamentId || current.tournamentId;
    const extras =
      req.body.extraEntrantIds ??
      (current?.extras ?? []).map((x) => x.entrantId);
    const a =
      data.entrantAId !== undefined ? data.entrantAId : current?.entrantAId;
    const b =
      data.entrantBId !== undefined ? data.entrantBId : current?.entrantBId;
    const winner =
      data.winnerId !== undefined ? data.winnerId : current?.winnerId;
    const all = [a, b, ...extras].filter(Boolean);
    if (new Set(all).size !== all.length) {
      throw new HttpError(
        400,
        'Um participante não pode aparecer duas vezes na luta',
      );
    }
    const ids = [...new Set([...all, winner].filter(Boolean))];
    if (ids.length) {
      const n = await prisma.tournamentEntrant.count({
        where: { id: { in: ids }, tournamentId },
      });
      if (n !== ids.length) {
        throw new HttpError(400, 'Participante não pertence a este torneio');
      }
    }
    if (winner && !all.includes(winner)) {
      throw new HttpError(
        400,
        'O vencedor deve ser um dos competidores da luta',
      );
    }
  },
  // Vencedor definido avança a chave; entrantes novos atualizam a luta já agendada.
  afterWrite: async (row) => {
    await tournamentLink.advanceWinner(row);
    await tournamentLink.syncSegmentParticipants(row.id);
  },
});

module.exports = resources;
module.exports.segmentToData = segmentToData;
