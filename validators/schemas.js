const Joi = require('joi');

const id = Joi.string().uuid();
const optId = id.allow(null);
const text = (max = 255) => Joi.string().trim().max(max);
const optText = (max = 255) => text(max).allow('', null);
const url = Joi.string().uri().max(2048).allow('', null);
const date = Joi.date().iso().allow(null);

const GENDER = ['M', 'W'];
const CONTRACT = [
  'FULL_TIME',
  'PART_TIME',
  'LEGEND',
  'FREE_AGENT',
  'MANAGER',
  'GM',
  'CELEBRITY',
  'VARIANT',
];

// Update = mesmos campos, todos opcionais, pelo menos um presente.
const forUpdate = (schema) =>
  schema
    .fork(Object.keys(schema.describe().keys), (s) => s.optional())
    .min(1)
    .messages({ 'object.min': 'Informe ao menos um campo para atualizar' });

const define = (keys) => {
  const create = Joi.object(keys);
  return { create, update: forUpdate(create) };
};

const lookup = define({
  name: text(100).required(),
  description: optText(500),
  isActive: Joi.boolean(),
});

const schemas = {
  auth: {
    register: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).max(100).required(),
      name: optText(100),
      useTemplate: Joi.boolean().default(true),
    }),
    login: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    }),
    forgotPassword: Joi.object({
      email: Joi.string().email().required(),
    }),
    refresh: Joi.object({
      refreshToken: Joi.string().min(20).max(200).required(),
    }),
    resetPassword: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).max(100).required(),
    }),
  },

  universe: {
    ...define({
      name: text(100).required(),
      description: optText(500),
    }),
    create: Joi.object({
      name: text(100).required(),
      description: optText(500),
      useTemplate: Joi.boolean().default(true),
    }),
    reset: Joi.object({ confirm: Joi.boolean().valid(true).required() }),
  },

  alignment: lookup,
  division: lookup,
  weightClass: lookup,

  brand: define({
    name: text(100).required(),
    gm: optText(100),
    color: optText(30),
    description: optText(500),
    imageUrl: url,
    isActive: Joi.boolean(),
    confirm: Joi.boolean(), // confirma efeitos destrutivos (desativar apaga episódios)
  }),

  wrestler: define({
    name: text(100).required(),
    gender: Joi.string()
      .valid(...GENDER)
      .required(),
    contractType: Joi.string()
      .valid(...CONTRACT)
      .default('FULL_TIME'),
    hasContract: Joi.boolean(),
    isInjured: Joi.boolean(),
    isActive: Joi.boolean(),
    inTagDivision: Joi.boolean(),
    editStatus: Joi.string().valid('COMPLETE', 'NEEDED'),
    imageUrl: url,
    notes: optText(2000),
    alignmentId: optId,
    divisionId: optId,
    weightClassId: optId,
    overall: Joi.number().integer().min(0).max(100).allow(null),
    finisher: optText(100),
    signature: optText(100),
    hometown: optText(100),
    isCustomCharacter: Joi.boolean(),
    brandIds: Joi.array().items(id).unique(),
  }),

  team: define({
    name: text(100).required(),
    kind: Joi.string().valid('TAG_TEAM', 'FACTION'),
    factionId: optId,
    imageUrl: url,
    memberIds: Joi.array().items(id).unique(),
  }),

  title: define({
    name: text(100).required(),
    brandId: optId,
    gender: Joi.string()
      .valid(...GENDER)
      .allow(null),
    isTag: Joi.boolean(),
    isActive: Joi.boolean(),
    imageUrl: url,
  }),

  titleReign: define({
    titleId: id.required(),
    startDate: Joi.date().iso().required(),
    endDate: date,
    wonAtSegmentId: optId,
    holders: Joi.array()
      .items(
        Joi.object({ wrestlerId: id, teamId: id }).or('wrestlerId', 'teamId'),
      )
      .min(1),
  }),

  titleBaseline: define({
    titleId: id.required(),
    wrestlerId: optId,
    teamId: optId,
    reigns: Joi.number().integer().min(0).max(1000).required(),
    days: Joi.number().integer().min(0).max(1000000).required(),
    note: optText(500),
  }),

  season: define({
    number: Joi.number().integer().min(1).required(),
    name: optText(100),
    startDate: date,
    startMonth: Joi.number().integer().min(1).max(12).allow(null),
  }),

  show: define({
    name: text(100).required(),
    kind: Joi.string().valid('WEEKLY', 'PLE', 'SPECIAL').required(),
    brandId: optId,
    weekday: Joi.number().integer().min(0).max(6).allow(null),
    ppvMonth: Joi.number().integer().min(1).max(12).allow(null),
    ppvWeek: Joi.number().integer().min(1).max(4).allow(null),
    nights: Joi.number().integer().min(1).max(2),
    imageUrl: url,
    isActive: Joi.boolean(),
    confirm: Joi.boolean(),
  }),

  cardDivision: define({
    name: text(100).required(),
    gender: Joi.string().valid('M', 'W').allow(null), // null = inter-gênero
    brandIds: Joi.array().items(id).unique(),
    titleId: optId,
    order: Joi.number().integer().min(0).max(1000),
    isActive: Joi.boolean(),
  }),

  episode: define({
    showId: id.required(),
    seasonId: id.required(),
    title: optText(150),
    month: Joi.number().integer().min(1).max(12).required(),
    week: Joi.number().integer().min(1).max(4).allow(null),
    night: Joi.number().integer().min(1).max(2).allow(null),
    airDate: date,
    status: Joi.string().valid('UNPLANNED', 'PLANNED', 'DONE'),
    imageUrl: url,
    notes: optText(2000),
  }),

  generateEpisodes: Joi.object({
    seasonId: id.required(),
    showIds: Joi.array().items(id).min(1),
    months: Joi.array().items(Joi.number().integer().min(1).max(12)).min(1),
    weeks: Joi.number().integer().min(1).max(4).default(4),
  }),

  matchType: define({ name: text(100).required() }),

  segment: define({
    episodeId: id.required(),
    position: Joi.number().integer().min(1),
    type: Joi.string().valid('MATCH', 'PROMO', 'OTHER').required(),
    matchTypeId: optId,
    titleId: optId,
    titleChanged: Joi.boolean(),
    isMainEvent: Joi.boolean(),
    finishType: Joi.string()
      .valid('PINFALL', 'SUBMISSION', 'COUNTOUT', 'DQ', 'OTHER')
      .allow(null),
    isDone: Joi.boolean(),
    isDraw: Joi.boolean(),
    notes: optText(2000),
    stakes: Joi.string().valid('NONE', 'RANKING', 'CONTENDER'),
    cardDivisionId: optId,
    tournamentMatchId: optId, // luta de torneio que este segmento decide
    startsRivalry: Joi.boolean(), // a luta começa uma rivalidade (criada automaticamente)
    endsRivalry: Joi.boolean(), // a luta encerra a rivalidade `rivalryId` ao ser finalizada
    rivalryId: optId,
    participants: Joi.array().items(
      Joi.object({
        wrestlerId: id.required(),
        side: Joi.number().integer().min(1).default(1),
        isWinner: Joi.boolean().default(false),
      }),
    ),
  }),

  reorderSegments: Joi.object({
    order: Joi.array().items(id).min(1).unique().required(),
  }),

  tournament: define({
    seasonId: optId,
    name: text(100).required(),
    format: Joi.string().valid('SINGLE_ELIMINATION', 'ROUND_ROBIN'),
    size: Joi.number().integer().min(2).max(64).required(),
    firstRoundMatches: Joi.number().integer().min(1).max(32).allow(null),
    firstRoundPerMatch: Joi.number().integer().min(2).max(8).allow(null),
    isTag: Joi.boolean(),
    status: Joi.string().valid('PLANNED', 'ONGOING', 'FINISHED'),
    startDate: date,
    endDate: date,
    imageUrl: url,
    notes: optText(2000),
  }),

  tournamentEntrant: define({
    tournamentId: id.required(),
    seed: Joi.number().integer().min(1).allow(null),
    startRound: Joi.number().integer().min(1).max(6),
    wrestlerId: id,
    teamId: id,
  }),

  tournamentMatch: define({
    tournamentId: id.required(),
    round: Joi.number().integer().min(1).required(),
    slot: Joi.number().integer().min(1).required(),
    groupName: optText(50),
    entrantAId: optId,
    entrantBId: optId,
    extraEntrantIds: Joi.array().items(id).unique().max(8),
    matchTypeId: optId,
    winnerId: optId,
    segmentId: optId,
  }),

  rivalry: define({
    name: text(100).required(),
    description: optText(1000),
    isActive: Joi.boolean(),
    startDate: date,
    endDate: date,
    // envolvidos por lado: lutadores e/ou duplas/facções (como unidade)
    sideAWrestlerIds: Joi.array().items(id).unique(),
    sideATeamIds: Joi.array().items(id).unique(),
    sideBWrestlerIds: Joi.array().items(id).unique(),
    sideBTeamIds: Joi.array().items(id).unique(),
    winnerSide: Joi.number().integer().min(1).max(2).allow(null),
  }),
};

// Torneio individual exige wrestlerId XOR teamId
schemas.tournamentEntrant.create = schemas.tournamentEntrant.create.xor(
  'wrestlerId',
  'teamId',
);

// Histórico: de um lutador OU de uma equipe (não os dois)
schemas.titleBaseline.create = schemas.titleBaseline.create.xor(
  'wrestlerId',
  'teamId',
);

// Agenda luta(s) de torneio num episódio
schemas.scheduleMatch = Joi.object({
  episodeId: id.required(),
  matchTypeId: optId,
});
schemas.scheduleRound = Joi.object({
  round: Joi.number().integer().min(1).required(),
  episodeId: id.required(),
});

// Lista ordenada de uma divisão: cada item é um lutador OU uma dupla
// Troca/correção do campeão de uma divisão (título vinculado).
// mode 'change' = nova troca de título (fecha o reinado e abre outro);
// mode 'fix' = corrige quem é o campeão atual, sem criar reinado novo.
schemas.divisionChampion = Joi.object({
  mode: Joi.string().valid('change', 'fix').default('fix'),
  holders: Joi.array()
    .items(
      Joi.object({ wrestlerId: id, teamId: id }).xor('wrestlerId', 'teamId'),
    )
    .max(4)
    .required(),
});

schemas.divisionEntries = Joi.object({
  entries: Joi.array()
    .items(
      Joi.object({ wrestlerId: id, teamId: id }).xor('wrestlerId', 'teamId'),
    )
    .max(300)
    .required(),
});

// Monta o card inteiro de um episódio: os segmentos entram na ordem do array
// (a posição é a do array; episodeId vem da URL).
schemas.buildCard = Joi.object({
  replace: Joi.boolean().default(false),
  segments: Joi.array()
    .items(
      schemas.segment.create.fork(['episodeId', 'position'], (s) =>
        s.optional().strip(),
      ),
    )
    .min(1)
    .required(),
});

// ───────────── IA: sugestão de segmentos ─────────────
const aiOptions = {
  count: Joi.number().integer().min(1).max(10).default(5),
  includeMainEvent: Joi.boolean().default(true),
  guidance: optText(500),
};
schemas.suggestSegments = Joi.object(aiOptions);
const yearMonth = Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/);
schemas.suggestRange = Joi.object({
  from: yearMonth.required(), // 'AAAA-MM'
  to: yearMonth.required(),
  showIds: Joi.array().items(id).min(1),
  skipPlanned: Joi.boolean().default(true),
  ...aiOptions,
});
// Grava vários cards de uma vez (cada item = corpo de POST /episodes/:id/segments)
schemas.bulkCards = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        episodeId: id.required(),
        replace: Joi.boolean().default(false),
        segments: schemas.buildCard.extract('segments'),
      }),
    )
    .min(1)
    .max(100)
    .required(),
});

module.exports = schemas;
