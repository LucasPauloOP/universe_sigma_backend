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

  season: define({
    number: Joi.number().integer().min(1).required(),
    name: optText(100),
    startDate: date,
  }),

  show: define({
    name: text(100).required(),
    kind: Joi.string().valid('WEEKLY', 'PLE', 'SPECIAL').required(),
    brandId: optId,
    weekday: Joi.number().integer().min(0).max(6).allow(null),
    ppvMonth: Joi.number().integer().min(1).max(12).allow(null),
    imageUrl: url,
  }),

  episode: define({
    showId: id.required(),
    seasonId: id.required(),
    title: optText(150),
    month: Joi.number().integer().min(1).max(12).required(),
    week: Joi.number().integer().min(1).max(5).allow(null),
    airDate: date,
    status: Joi.string().valid('PLANNED', 'DONE'),
    imageUrl: url,
    notes: optText(2000),
  }),

  generateEpisodes: Joi.object({
    seasonId: id.required(),
    showIds: Joi.array().items(id).min(1),
    months: Joi.array().items(Joi.number().integer().min(1).max(12)).min(1),
    weeks: Joi.number().integer().min(1).max(5).default(4),
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
    notes: optText(2000),
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
    winnerId: optId,
    segmentId: optId,
  }),

  rivalry: define({
    name: text(100).required(),
    description: optText(1000),
    isActive: Joi.boolean(),
    startDate: date,
    endDate: date,
    wrestlerIds: Joi.array().items(id).unique(),
  }),
};

// Torneio individual exige wrestlerId XOR teamId
schemas.tournamentEntrant.create = schemas.tournamentEntrant.create.xor(
  'wrestlerId',
  'teamId',
);

module.exports = schemas;
