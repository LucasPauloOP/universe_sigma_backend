# Contratos da API

> Gerado por `npm run contracts` (scripts/gen-contracts.js). Não edite à mão.

## Convenções

- **base**: /api
- **auth**: Authorization: Bearer <token>. token = JWT de acesso (padrão 7d). refreshToken opaco (90d) via POST /api/auth/refresh.
- **list**: GET de coleção -> {data:[], total, limit, offset}. ?limit (padrão 100, máx. 500) e ?offset. Filtros: apenas os listados em `filters` de cada recurso (true/false e dígitos são convertidos).
- **errors**: {success:false, message, details?:string[]}. 422 validação (Joi), 401 auth, 404, 409 unicidade, 400 referência inválida.
- **write**: POST 201 devolve o objeto. PUT e PATCH são equivalentes (todos os campos opcionais, ao menos um). DELETE 204 sem corpo. Campos desconhecidos são descartados.
- **images**: `imageUrl` chega como URL assinada (expira em 1h). Para gravar, envie a chave `storage:<universeId>/<uuid>.<ext>` do upload; uma URL assinada do próprio bucket também é aceita e convertida.
- **dates**: ISO 8601. Calendário do jogo: meses maio->abril, 4 semanas por mês.

## Enums

- `ContractType`: FULL_TIME, PART_TIME, LEGEND, FREE_AGENT, MANAGER, GM, CELEBRITY, VARIANT
- `EditStatus`: COMPLETE, NEEDED
- `EpisodeStatus`: UNPLANNED, PLANNED, DONE
- `FinishType`: PINFALL, SUBMISSION, COUNTOUT, DQ, OTHER
- `Gender`: M, W
- `SegmentStakes`: NONE, RANKING, CONTENDER
- `SegmentType`: MATCH, PROMO, OTHER
- `ShowKind`: WEEKLY, PLE, SPECIAL
- `TeamKind`: TAG_TEAM, FACTION
- `TournamentFormat`: SINGLE_ELIMINATION, ROUND_ROBIN
- `TournamentStatus`: PLANNED, ONGOING, FINISHED

## Recursos (CRUD)

### alignments

- Rota: `/api/universes/:universeId/alignments` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Alignment`

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 500 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 500 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 |  |  |

### brands

- Rota: `/api/universes/:universeId/brands` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Brand`
- Filtros: `isActive`

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `color` | string, max 30 |  | sim |
| `confirm` | boolean |  |  |
| `description` | string, max 500 |  | sim |
| `gm` | string, max 100 |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `color` | string, max 30 |  | sim |
| `confirm` | boolean |  |  |
| `description` | string, max 500 |  | sim |
| `gm` | string, max 100 |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 |  |  |

### card-divisions

- Rota: `/api/universes/:universeId/card-divisions` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `CardDivision` + `brands`, `title`, `entries`
- Filtros: `gender`, `titleId`, `isActive`
- Referências validadas: `titleId`→title

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `brandIds` | array, de string |  |  |
| `gender` | string, enum(M|W) |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 | sim |  |
| `order` | integer, min 0, max 1000 |  |  |
| `titleId` | string, uuid |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `brandIds` | array, de string |  |  |
| `gender` | string, enum(M|W) |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 |  |  |
| `order` | integer, min 0, max 1000 |  |  |
| `titleId` | string, uuid |  | sim |

### divisions

- Rota: `/api/universes/:universeId/divisions` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Division`

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 500 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 500 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 |  |  |

### episodes

- Rota: `/api/universes/:universeId/episodes` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Episode` + `show`, `season`, `_count`
- Filtros: `showId`, `seasonId`, `month`, `week`, `status`
- Referências validadas: `showId`→show, `seasonId`→season

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `airDate` | date, iso |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `month` | integer, min 1, max 12 | sim |  |
| `night` | integer, min 1, max 2 |  | sim |
| `notes` | string, max 2000 |  | sim |
| `seasonId` | string, uuid | sim |  |
| `showId` | string, uuid | sim |  |
| `status` | string, enum(UNPLANNED|PLANNED|DONE) |  |  |
| `title` | string, max 150 |  | sim |
| `week` | integer, min 1, max 4 |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `airDate` | date, iso |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `month` | integer, min 1, max 12 |  |  |
| `night` | integer, min 1, max 2 |  | sim |
| `notes` | string, max 2000 |  | sim |
| `seasonId` | string, uuid |  |  |
| `showId` | string, uuid |  |  |
| `status` | string, enum(UNPLANNED|PLANNED|DONE) |  |  |
| `title` | string, max 150 |  | sim |
| `week` | integer, min 1, max 4 |  | sim |

### match-types

- Rota: `/api/universes/:universeId/match-types` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `MatchType`

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `name` | string, max 100 | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `name` | string, max 100 |  |  |

### rivalries

- Rota: `/api/universes/:universeId/rivalries` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Rivalry` + `members`
- Filtros: `isActive`

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 1000 |  | sim |
| `endDate` | date, iso |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 | sim |  |
| `startDate` | date, iso |  | sim |
| `wrestlerIds` | array, de string |  |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 1000 |  | sim |
| `endDate` | date, iso |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 |  |  |
| `startDate` | date, iso |  | sim |
| `wrestlerIds` | array, de string |  |  |

### seasons

- Rota: `/api/universes/:universeId/seasons` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Season`

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `name` | string, max 100 |  | sim |
| `number` | integer, min 1 | sim |  |
| `startDate` | date, iso |  | sim |
| `startMonth` | integer, min 1, max 12 |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `name` | string, max 100 |  | sim |
| `number` | integer, min 1 |  |  |
| `startDate` | date, iso |  | sim |
| `startMonth` | integer, min 1, max 12 |  | sim |

### segments

- Rota: `/api/universes/:universeId/segments` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Segment` + `matchType`, `title`, `cardDivision`, `tournamentMatch`, `participants`
- Filtros: `episodeId`, `type`, `titleId`, `isDone`
- Referências validadas: `episodeId`→episode, `matchTypeId`→matchType, `titleId`→title, `cardDivisionId`→cardDivision

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `cardDivisionId` | string, uuid |  | sim |
| `episodeId` | string, uuid | sim |  |
| `finishType` | string, enum(PINFALL|SUBMISSION|COUNTOUT|DQ|OTHER) |  | sim |
| `isDone` | boolean |  |  |
| `isDraw` | boolean |  |  |
| `isMainEvent` | boolean |  |  |
| `matchTypeId` | string, uuid |  | sim |
| `notes` | string, max 2000 |  | sim |
| `participants` | array, de object |  |  |
| `position` | integer, min 1 |  |  |
| `stakes` | string, enum(NONE|RANKING|CONTENDER) |  |  |
| `titleChanged` | boolean |  |  |
| `titleId` | string, uuid |  | sim |
| `tournamentMatchId` | string, uuid |  | sim |
| `type` | string, enum(MATCH|PROMO|OTHER) | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `cardDivisionId` | string, uuid |  | sim |
| `episodeId` | string, uuid |  |  |
| `finishType` | string, enum(PINFALL|SUBMISSION|COUNTOUT|DQ|OTHER) |  | sim |
| `isDone` | boolean |  |  |
| `isDraw` | boolean |  |  |
| `isMainEvent` | boolean |  |  |
| `matchTypeId` | string, uuid |  | sim |
| `notes` | string, max 2000 |  | sim |
| `participants` | array, de object |  |  |
| `position` | integer, min 1 |  |  |
| `stakes` | string, enum(NONE|RANKING|CONTENDER) |  |  |
| `titleChanged` | boolean |  |  |
| `titleId` | string, uuid |  | sim |
| `tournamentMatchId` | string, uuid |  | sim |
| `type` | string, enum(MATCH|PROMO|OTHER) |  |  |

### shows

- Rota: `/api/universes/:universeId/shows` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Show` + `brand`
- Filtros: `brandId`, `kind`, `isActive`
- Referências validadas: `brandId`→brand

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `brandId` | string, uuid |  | sim |
| `confirm` | boolean |  |  |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isActive` | boolean |  |  |
| `kind` | string, enum(WEEKLY|PLE|SPECIAL) | sim |  |
| `name` | string, max 100 | sim |  |
| `nights` | integer, min 1, max 2 |  |  |
| `ppvMonth` | integer, min 1, max 12 |  | sim |
| `ppvWeek` | integer, min 1, max 4 |  | sim |
| `weekday` | integer, min 0, max 6 |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `brandId` | string, uuid |  | sim |
| `confirm` | boolean |  |  |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isActive` | boolean |  |  |
| `kind` | string, enum(WEEKLY|PLE|SPECIAL) |  |  |
| `name` | string, max 100 |  |  |
| `nights` | integer, min 1, max 2 |  |  |
| `ppvMonth` | integer, min 1, max 12 |  | sim |
| `ppvWeek` | integer, min 1, max 4 |  | sim |
| `weekday` | integer, min 0, max 6 |  | sim |

### teams

- Rota: `/api/universes/:universeId/teams` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Team` + `members`, `faction`, `subTeams`
- Filtros: `kind`, `factionId`
- Referências validadas: `factionId`→team

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `factionId` | string, uuid |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `kind` | string, enum(TAG_TEAM|FACTION) |  |  |
| `memberIds` | array, de string |  |  |
| `name` | string, max 100 | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `factionId` | string, uuid |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `kind` | string, enum(TAG_TEAM|FACTION) |  |  |
| `memberIds` | array, de string |  |  |
| `name` | string, max 100 |  |  |

### title-baselines

- Rota: `/api/universes/:universeId/title-baselines` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `TitleBaseline` + `title`, `wrestler`, `team`
- Filtros: `titleId`
- Referências validadas: `titleId`→title, `wrestlerId`→wrestler, `teamId`→team

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `days` | integer, min 0, max 1000000 | sim |  |
| `note` | string, max 500 |  | sim |
| `reigns` | integer, min 0, max 1000 | sim |  |
| `teamId` | string, uuid |  | sim |
| `titleId` | string, uuid | sim |  |
| `wrestlerId` | string, uuid |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `days` | integer, min 0, max 1000000 |  |  |
| `note` | string, max 500 |  | sim |
| `reigns` | integer, min 0, max 1000 |  |  |
| `teamId` | string, uuid |  | sim |
| `titleId` | string, uuid |  |  |
| `wrestlerId` | string, uuid |  | sim |

### title-reigns

- Rota: `/api/universes/:universeId/title-reigns` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `TitleReign` + `title`, `holders`
- Filtros: `titleId`
- Referências validadas: `titleId`→title, `wonAtSegmentId`→segment

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `endDate` | date, iso |  | sim |
| `holders` | array, min 1, de object |  |  |
| `startDate` | date, iso | sim |  |
| `titleId` | string, uuid | sim |  |
| `wonAtSegmentId` | string, uuid |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `endDate` | date, iso |  | sim |
| `holders` | array, min 1, de object |  |  |
| `startDate` | date, iso |  |  |
| `titleId` | string, uuid |  |  |
| `wonAtSegmentId` | string, uuid |  | sim |

### titles

- Rota: `/api/universes/:universeId/titles` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Title` + `brand`
- Filtros: `brandId`, `gender`, `isTag`, `isActive`
- Referências validadas: `brandId`→brand

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `brandId` | string, uuid |  | sim |
| `gender` | string, enum(M|W) |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isActive` | boolean |  |  |
| `isTag` | boolean |  |  |
| `name` | string, max 100 | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `brandId` | string, uuid |  | sim |
| `gender` | string, enum(M|W) |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isActive` | boolean |  |  |
| `isTag` | boolean |  |  |
| `name` | string, max 100 |  |  |

### tournament-entrants

- Rota: `/api/universes/:universeId/tournament-entrants` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `TournamentEntrant` + `wrestler`, `team`
- Filtros: `tournamentId`
- Referências validadas: `tournamentId`→tournament, `wrestlerId`→wrestler, `teamId`→team

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `seed` | integer, min 1 |  | sim |
| `startRound` | integer, min 1, max 6 |  |  |
| `teamId` | string, uuid |  |  |
| `tournamentId` | string, uuid | sim |  |
| `wrestlerId` | string, uuid |  |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `seed` | integer, min 1 |  | sim |
| `startRound` | integer, min 1, max 6 |  |  |
| `teamId` | string, uuid |  |  |
| `tournamentId` | string, uuid |  |  |
| `wrestlerId` | string, uuid |  |  |

### tournament-matches

- Rota: `/api/universes/:universeId/tournament-matches` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `TournamentMatch` + `entrantA`, `entrantB`, `winner`, `segment`, `matchType`, `extras`
- Filtros: `tournamentId`, `round`
- Referências validadas: `tournamentId`→tournament, `segmentId`→segment, `matchTypeId`→matchType

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `entrantAId` | string, uuid |  | sim |
| `entrantBId` | string, uuid |  | sim |
| `extraEntrantIds` | array, max 8, de string |  |  |
| `groupName` | string, max 50 |  | sim |
| `matchTypeId` | string, uuid |  | sim |
| `round` | integer, min 1 | sim |  |
| `segmentId` | string, uuid |  | sim |
| `slot` | integer, min 1 | sim |  |
| `tournamentId` | string, uuid | sim |  |
| `winnerId` | string, uuid |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `entrantAId` | string, uuid |  | sim |
| `entrantBId` | string, uuid |  | sim |
| `extraEntrantIds` | array, max 8, de string |  |  |
| `groupName` | string, max 50 |  | sim |
| `matchTypeId` | string, uuid |  | sim |
| `round` | integer, min 1 |  |  |
| `segmentId` | string, uuid |  | sim |
| `slot` | integer, min 1 |  |  |
| `tournamentId` | string, uuid |  |  |
| `winnerId` | string, uuid |  | sim |

### tournaments

- Rota: `/api/universes/:universeId/tournaments` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Tournament` + `_count`
- Filtros: `seasonId`, `status`, `format`
- Referências validadas: `seasonId`→season

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `endDate` | date, iso |  | sim |
| `firstRoundMatches` | integer, min 1, max 32 |  | sim |
| `firstRoundPerMatch` | integer, min 2, max 8 |  | sim |
| `format` | string, enum(SINGLE_ELIMINATION|ROUND_ROBIN) |  |  |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isTag` | boolean |  |  |
| `name` | string, max 100 | sim |  |
| `notes` | string, max 2000 |  | sim |
| `seasonId` | string, uuid |  | sim |
| `size` | integer, min 2, max 64 | sim |  |
| `startDate` | date, iso |  | sim |
| `status` | string, enum(PLANNED|ONGOING|FINISHED) |  |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `endDate` | date, iso |  | sim |
| `firstRoundMatches` | integer, min 1, max 32 |  | sim |
| `firstRoundPerMatch` | integer, min 2, max 8 |  | sim |
| `format` | string, enum(SINGLE_ELIMINATION|ROUND_ROBIN) |  |  |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `isTag` | boolean |  |  |
| `name` | string, max 100 |  |  |
| `notes` | string, max 2000 |  | sim |
| `seasonId` | string, uuid |  | sim |
| `size` | integer, min 2, max 64 |  |  |
| `startDate` | date, iso |  | sim |
| `status` | string, enum(PLANNED|ONGOING|FINISHED) |  |  |

### weight-classes

- Rota: `/api/universes/:universeId/weight-classes` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `WeightClass`

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 500 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 | sim |  |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `description` | string, max 500 |  | sim |
| `isActive` | boolean |  |  |
| `name` | string, max 100 |  |  |

### wrestlers

- Rota: `/api/universes/:universeId/wrestlers` (GET lista, POST, GET/PUT/PATCH/DELETE `/:id`)
- Modelo de resposta: `Wrestler` + `brands`, `alignment`, `division`, `weightClass`
- Filtros: `gender`, `isActive`, `isInjured`, `contractType`, `inTagDivision`, `editStatus`, `alignmentId`, `divisionId`, `weightClassId`
- Referências validadas: `alignmentId`→alignment, `divisionId`→division, `weightClassId`→weightClass

**Criar (POST)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `alignmentId` | string, uuid |  | sim |
| `brandIds` | array, de string |  |  |
| `contractType` | string, enum(FULL_TIME|PART_TIME|LEGEND|FREE_AGENT|MANAGER|GM|CELEBRITY|VARIANT), padrão "FULL_TIME" |  |  |
| `divisionId` | string, uuid |  | sim |
| `editStatus` | string, enum(COMPLETE|NEEDED) |  |  |
| `finisher` | string, max 100 |  | sim |
| `gender` | string, enum(M|W) | sim |  |
| `hasContract` | boolean |  |  |
| `hometown` | string, max 100 |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `inTagDivision` | boolean |  |  |
| `isActive` | boolean |  |  |
| `isCustomCharacter` | boolean |  |  |
| `isInjured` | boolean |  |  |
| `name` | string, max 100 | sim |  |
| `notes` | string, max 2000 |  | sim |
| `overall` | integer, min 0, max 100 |  | sim |
| `signature` | string, max 100 |  | sim |
| `weightClassId` | string, uuid |  | sim |

**Atualizar (PUT/PATCH)**

| Campo | Tipo | Obrigatório | Aceita null |
|---|---|---|---|
| `alignmentId` | string, uuid |  | sim |
| `brandIds` | array, de string |  |  |
| `contractType` | string, enum(FULL_TIME|PART_TIME|LEGEND|FREE_AGENT|MANAGER|GM|CELEBRITY|VARIANT), padrão "FULL_TIME" |  |  |
| `divisionId` | string, uuid |  | sim |
| `editStatus` | string, enum(COMPLETE|NEEDED) |  |  |
| `finisher` | string, max 100 |  | sim |
| `gender` | string, enum(M|W) |  |  |
| `hasContract` | boolean |  |  |
| `hometown` | string, max 100 |  | sim |
| `imageUrl` | string, uri, max 2048 |  | sim |
| `inTagDivision` | boolean |  |  |
| `isActive` | boolean |  |  |
| `isCustomCharacter` | boolean |  |  |
| `isInjured` | boolean |  |  |
| `name` | string, max 100 |  |  |
| `notes` | string, max 2000 |  | sim |
| `overall` | integer, min 0, max 100 |  | sim |
| `signature` | string, max 100 |  | sim |
| `weightClassId` | string, uuid |  | sim |

## Endpoints especiais e auth

| Método | Rota | Auth | Corpo | Notas |
|---|---|---|---|---|
| POST | `/api/auth/forgot-password` | não | `auth.forgotPassword` | 200 {exists:true} ou 404. (Fluxo temporário, sem e-mail.) |
| POST | `/api/auth/login` | não | `auth.login` | 200 {token, refreshToken, user}. 401 credenciais inválidas. |
| POST | `/api/auth/logout` | não | `auth.refresh` | Revoga o refresh token. 204. |
| GET | `/api/auth/me` | sim |  | 200 {id,email,name,createdAt}. 401 se o token for inválido. |
| POST | `/api/auth/refresh` | não | `auth.refresh` | Troca o refresh token (rotativo). 200 {token, refreshToken, user}. 401 inválido/expirado/reusado (reuso revoga todos). |
| POST | `/api/auth/register` | não | `auth.register` | Corpo: auth.register. 201 {token, refreshToken, user, universe}. 409 e-mail duplicado. |
| POST | `/api/auth/reset-password` | não | `auth.resetPassword` | 200 {ok:true}. Revoga os refresh tokens do usuário. |
| GET | `/api/universes/:universeId/brands/:id/impact` | sim |  | O que será afetado ao desativar (episódios). |
| PUT | `/api/universes/:universeId/card-divisions/:id/champion` | sim | `divisionChampion` |  |
| PUT | `/api/universes/:universeId/card-divisions/:id/entries` | sim | `divisionEntries` |  |
| GET | `/api/universes/:universeId/card-divisions/board` | sim |  | Filtro opcional ?brandId=. Divisões com fila e campeão. |
| POST | `/api/universes/:universeId/card-divisions/defaults` | sim |  | 201 {created}. |
| GET | `/api/universes/:universeId/episodes/:id/card` | sim |  | 200 episódio com `segments` ordenados (participants, matchType, title...). |
| PUT | `/api/universes/:universeId/episodes/:id/segments/order` | sim | `reorderSegments` | 200 {order:[ids]}. |
| POST | `/api/universes/:universeId/episodes/:id/segments` | sim | `buildCard` | Monta o card na ordem do array. `replace:true` apaga o atual. 201 lista de segmentos. |
| POST | `/api/universes/:universeId/episodes/generate` | sim | `generateEpisodes` | 201 {created:N}. Não duplica episódios existentes. |
| POST | `/api/universes/:universeId/import/universe-sheet` | sim | multipart/form-data (campo "file") | multipart `file` (.xlsx até 10 MB) + `options` JSON. Sem ?apply=true só pré-visualiza. |
| POST | `/api/universes/:universeId/reset` | sim | `universe.reset` | Corpo {confirm:true}. Apaga tudo e restaura o padrão. 200 {message}. |
| GET | `/api/universes/:universeId/shows/:id/impact` | sim |  | O que será afetado ao desativar (episódios). |
| GET | `/api/universes/:universeId/stats/titles` | sim |  | 200 estatísticas de todos os títulos (baselines + reinados). |
| POST | `/api/universes/:universeId/title-baselines/defaults` | sim |  | Importa o histórico padrão de títulos. |
| GET | `/api/universes/:universeId/titles/:id/history` | sim |  | 200 {title, reigns[]} com days/defenses. |
| POST | `/api/universes/:universeId/tournament-matches/:id/schedule` | sim | `scheduleMatch` |  |
| POST | `/api/universes/:universeId/tournament-matches/:id/unlink` | sim |  |  |
| GET | `/api/universes/:universeId/tournaments/:id/bracket` | sim |  | 200 {tournament, entrants, matches}. Cada match traz entrantA/B, extras, winner, matchType, segment. |
| POST | `/api/universes/:universeId/tournaments/:id/generate-bracket` | sim |  | Apaga e recria as lutas. Usa tournament.firstRoundMatches/firstRoundPerMatch e entrant.startRound. 201 {created:N}. |
| POST | `/api/universes/:universeId/tournaments/:id/schedule-round` | sim | `scheduleRound` | 200 {scheduled:N}. |
| GET | `/api/universes/:universeId/tournaments/open-matches` | sim |  | Lutas de torneio ainda não agendadas. |
| POST | `/api/universes/:universeId/uploads` | sim | multipart/form-data (campo "file") | multipart `file` (jpeg/png/webp/gif, até 5 MB). 201 {key, imageUrl:"storage:...", url}. Salve `imageUrl`; `url` é só prévia (expira em 1h). |
| GET | `/api/universes/:universeId/wrestlers/:id/record` | sim |  | 200 {wrestlerId, matches, wins, losses, draws, titleReigns}. |
| DELETE | `/api/universes/:universeId` | sim |  |  |
| GET | `/api/universes/:universeId` | sim |  |  |
| PATCH | `/api/universes/:universeId` | sim | `universe.update` |  |
| PUT | `/api/universes/:universeId` | sim | `universe.update` |  |
| GET | `/api/universes` | sim |  | 200 array (sem paginação). |
| POST | `/api/universes` | sim | `universe.create` |  |

## Modelos (Prisma)

### Alignment

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `description` | String |  |
| `isActive` | Boolean | sim |
| `universe` | Universe (relação) | sim |
| `wrestlers` | Wrestler[] (relação) | sim |

### Brand

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `gm` | String |  |
| `color` | String |  |
| `description` | String |  |
| `imageUrl` | String |  |
| `isActive` | Boolean | sim |
| `universe` | Universe (relação) | sim |
| `wrestlers` | WrestlerBrand[] (relação) | sim |
| `titles` | Title[] (relação) | sim |
| `shows` | Show[] (relação) | sim |
| `divisionLinks` | CardDivisionBrand[] (relação) | sim |

### CardDivision

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `titleId` | String |  |
| `name` | String | sim |
| `gender` | Gender |  |
| `order` | Int | sim |
| `isActive` | Boolean | sim |
| `universe` | Universe (relação) | sim |
| `title` | Title (relação) |  |
| `brands` | CardDivisionBrand[] (relação) | sim |
| `entries` | CardDivisionEntry[] (relação) | sim |
| `segments` | Segment[] (relação) | sim |

### CardDivisionBrand

| Campo | Tipo | Obrigatório |
|---|---|---|
| `divisionId` | String | sim |
| `brandId` | String | sim |
| `division` | CardDivision (relação) | sim |
| `brand` | Brand (relação) | sim |

### CardDivisionEntry

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `divisionId` | String | sim |
| `position` | Int | sim |
| `wrestlerId` | String |  |
| `teamId` | String |  |
| `division` | CardDivision (relação) | sim |
| `wrestler` | Wrestler (relação) |  |
| `team` | Team (relação) |  |

### Division

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `description` | String |  |
| `isActive` | Boolean | sim |
| `universe` | Universe (relação) | sim |
| `wrestlers` | Wrestler[] (relação) | sim |

### Episode

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `showId` | String | sim |
| `seasonId` | String | sim |
| `title` | String |  |
| `month` | Int | sim |
| `week` | Int |  |
| `night` | Int |  |
| `airDate` | DateTime |  |
| `status` | EpisodeStatus | sim |
| `imageUrl` | String |  |
| `notes` | String |  |
| `show` | Show (relação) | sim |
| `season` | Season (relação) | sim |
| `segments` | Segment[] (relação) | sim |

### MatchType

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `universe` | Universe (relação) | sim |
| `segments` | Segment[] (relação) | sim |
| `tournamentMatches` | TournamentMatch[] (relação) | sim |

### RefreshToken

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `userId` | String | sim |
| `tokenHash` | String | sim |
| `expiresAt` | DateTime | sim |
| `revokedAt` | DateTime |  |
| `replacedById` | String |  |
| `userAgent` | String |  |
| `createdAt` | DateTime | sim |
| `user` | User (relação) | sim |

### ReignHolder

| Campo | Tipo | Obrigatório |
|---|---|---|
| `reignId` | String | sim |
| `wrestlerId` | String |  |
| `teamId` | String |  |
| `id` | String | sim |
| `reign` | TitleReign (relação) | sim |
| `wrestler` | Wrestler (relação) |  |
| `team` | Team (relação) |  |

### Rivalry

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `description` | String |  |
| `isActive` | Boolean | sim |
| `startDate` | DateTime |  |
| `endDate` | DateTime |  |
| `universe` | Universe (relação) | sim |
| `members` | RivalryMember[] (relação) | sim |

### RivalryMember

| Campo | Tipo | Obrigatório |
|---|---|---|
| `rivalryId` | String | sim |
| `wrestlerId` | String | sim |
| `rivalry` | Rivalry (relação) | sim |
| `wrestler` | Wrestler (relação) | sim |

### Season

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `number` | Int | sim |
| `name` | String |  |
| `startDate` | DateTime |  |
| `startMonth` | Int |  |
| `universe` | Universe (relação) | sim |
| `episodes` | Episode[] (relação) | sim |
| `tournaments` | Tournament[] (relação) | sim |

### Segment

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `episodeId` | String | sim |
| `position` | Int | sim |
| `type` | SegmentType | sim |
| `matchTypeId` | String |  |
| `titleId` | String |  |
| `titleChanged` | Boolean | sim |
| `isMainEvent` | Boolean | sim |
| `finishType` | FinishType |  |
| `isDone` | Boolean | sim |
| `isDraw` | Boolean | sim |
| `notes` | String |  |
| `cardDivisionId` | String |  |
| `stakes` | SegmentStakes | sim |
| `rankingApplied` | Boolean | sim |
| `episode` | Episode (relação) | sim |
| `matchType` | MatchType (relação) |  |
| `title` | Title (relação) |  |
| `cardDivision` | CardDivision (relação) |  |
| `participants` | SegmentParticipant[] (relação) | sim |
| `tournamentMatch` | TournamentMatch (relação) |  |

### SegmentParticipant

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `segmentId` | String | sim |
| `wrestlerId` | String | sim |
| `side` | Int | sim |
| `isWinner` | Boolean | sim |
| `segment` | Segment (relação) | sim |
| `wrestler` | Wrestler (relação) | sim |

### Show

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `brandId` | String |  |
| `name` | String | sim |
| `kind` | ShowKind | sim |
| `weekday` | Int |  |
| `ppvMonth` | Int |  |
| `ppvWeek` | Int |  |
| `nights` | Int | sim |
| `imageUrl` | String |  |
| `isActive` | Boolean | sim |
| `universe` | Universe (relação) | sim |
| `brand` | Brand (relação) |  |
| `episodes` | Episode[] (relação) | sim |

### Team

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `kind` | TeamKind | sim |
| `imageUrl` | String |  |
| `factionId` | String |  |
| `universe` | Universe (relação) | sim |
| `faction` | Team (relação) |  |
| `subTeams` | Team[] (relação) | sim |
| `members` | TeamMember[] (relação) | sim |
| `entries` | TournamentEntrant[] (relação) | sim |
| `reigns` | ReignHolder[] (relação) | sim |
| `baselines` | TitleBaseline[] (relação) | sim |
| `divisionEntries` | CardDivisionEntry[] (relação) | sim |

### TeamMember

| Campo | Tipo | Obrigatório |
|---|---|---|
| `teamId` | String | sim |
| `wrestlerId` | String | sim |
| `team` | Team (relação) | sim |
| `wrestler` | Wrestler (relação) | sim |

### Title

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `brandId` | String |  |
| `name` | String | sim |
| `gender` | Gender |  |
| `isTag` | Boolean | sim |
| `isActive` | Boolean | sim |
| `imageUrl` | String |  |
| `universe` | Universe (relação) | sim |
| `brand` | Brand (relação) |  |
| `reigns` | TitleReign[] (relação) | sim |
| `baselines` | TitleBaseline[] (relação) | sim |
| `segments` | Segment[] (relação) | sim |
| `cardDivisions` | CardDivision[] (relação) | sim |

### TitleBaseline

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `titleId` | String | sim |
| `wrestlerId` | String |  |
| `teamId` | String |  |
| `reigns` | Int | sim |
| `days` | Int | sim |
| `note` | String |  |
| `title` | Title (relação) | sim |
| `wrestler` | Wrestler (relação) |  |
| `team` | Team (relação) |  |

### TitleReign

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `titleId` | String | sim |
| `startDate` | DateTime | sim |
| `endDate` | DateTime |  |
| `wonAtSegmentId` | String |  |
| `title` | Title (relação) | sim |
| `holders` | ReignHolder[] (relação) | sim |

### Tournament

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `seasonId` | String |  |
| `name` | String | sim |
| `format` | TournamentFormat | sim |
| `size` | Int | sim |
| `firstRoundMatches` | Int |  |
| `firstRoundPerMatch` | Int |  |
| `isTag` | Boolean | sim |
| `status` | TournamentStatus | sim |
| `startDate` | DateTime |  |
| `endDate` | DateTime |  |
| `imageUrl` | String |  |
| `notes` | String |  |
| `universe` | Universe (relação) | sim |
| `season` | Season (relação) |  |
| `entrants` | TournamentEntrant[] (relação) | sim |
| `matches` | TournamentMatch[] (relação) | sim |

### TournamentEntrant

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `tournamentId` | String | sim |
| `seed` | Int |  |
| `startRound` | Int | sim |
| `wrestlerId` | String |  |
| `teamId` | String |  |
| `tournament` | Tournament (relação) | sim |
| `wrestler` | Wrestler (relação) |  |
| `team` | Team (relação) |  |
| `asA` | TournamentMatch[] (relação) | sim |
| `asB` | TournamentMatch[] (relação) | sim |
| `wins` | TournamentMatch[] (relação) | sim |
| `extraIn` | TournamentMatchEntrant[] (relação) | sim |

### TournamentMatch

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `tournamentId` | String | sim |
| `round` | Int | sim |
| `slot` | Int | sim |
| `groupName` | String |  |
| `entrantAId` | String |  |
| `entrantBId` | String |  |
| `winnerId` | String |  |
| `segmentId` | String |  |
| `matchTypeId` | String |  |
| `tournament` | Tournament (relação) | sim |
| `entrantA` | TournamentEntrant (relação) |  |
| `entrantB` | TournamentEntrant (relação) |  |
| `winner` | TournamentEntrant (relação) |  |
| `segment` | Segment (relação) |  |
| `matchType` | MatchType (relação) |  |
| `extras` | TournamentMatchEntrant[] (relação) | sim |

### TournamentMatchEntrant

| Campo | Tipo | Obrigatório |
|---|---|---|
| `matchId` | String | sim |
| `entrantId` | String | sim |
| `position` | Int | sim |
| `match` | TournamentMatch (relação) | sim |
| `entrant` | TournamentEntrant (relação) | sim |

### Universe

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `userId` | String | sim |
| `name` | String | sim |
| `description` | String |  |
| `createdAt` | DateTime | sim |
| `user` | User (relação) | sim |
| `brands` | Brand[] (relação) | sim |
| `wrestlers` | Wrestler[] (relação) | sim |
| `teams` | Team[] (relação) | sim |
| `titles` | Title[] (relação) | sim |
| `shows` | Show[] (relação) | sim |
| `seasons` | Season[] (relação) | sim |
| `matchTypes` | MatchType[] (relação) | sim |
| `tournaments` | Tournament[] (relação) | sim |
| `alignments` | Alignment[] (relação) | sim |
| `divisions` | Division[] (relação) | sim |
| `weightClasses` | WeightClass[] (relação) | sim |
| `rivalries` | Rivalry[] (relação) | sim |
| `cardDivisions` | CardDivision[] (relação) | sim |

### User

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `email` | String | sim |
| `passwordHash` | String | sim |
| `name` | String |  |
| `createdAt` | DateTime | sim |
| `universes` | Universe[] (relação) | sim |
| `refreshTokens` | RefreshToken[] (relação) | sim |

### WeightClass

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `description` | String |  |
| `isActive` | Boolean | sim |
| `universe` | Universe (relação) | sim |
| `wrestlers` | Wrestler[] (relação) | sim |

### Wrestler

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | String | sim |
| `universeId` | String | sim |
| `name` | String | sim |
| `gender` | Gender | sim |
| `contractType` | ContractType | sim |
| `alignmentId` | String |  |
| `divisionId` | String |  |
| `weightClassId` | String |  |
| `overall` | Int |  |
| `finisher` | String |  |
| `signature` | String |  |
| `hometown` | String |  |
| `isCustomCharacter` | Boolean | sim |
| `hasContract` | Boolean | sim |
| `isInjured` | Boolean | sim |
| `isActive` | Boolean | sim |
| `inTagDivision` | Boolean | sim |
| `editStatus` | EditStatus | sim |
| `imageUrl` | String |  |
| `notes` | String |  |
| `createdAt` | DateTime | sim |
| `universe` | Universe (relação) | sim |
| `brands` | WrestlerBrand[] (relação) | sim |
| `teams` | TeamMember[] (relação) | sim |
| `participants` | SegmentParticipant[] (relação) | sim |
| `reigns` | ReignHolder[] (relação) | sim |
| `baselines` | TitleBaseline[] (relação) | sim |
| `entries` | TournamentEntrant[] (relação) | sim |
| `rivalries` | RivalryMember[] (relação) | sim |
| `divisionEntries` | CardDivisionEntry[] (relação) | sim |
| `alignment` | Alignment (relação) |  |
| `division` | Division (relação) |  |
| `weightClass` | WeightClass (relação) |  |

### WrestlerBrand

| Campo | Tipo | Obrigatório |
|---|---|---|
| `wrestlerId` | String | sim |
| `brandId` | String | sim |
| `wrestler` | Wrestler (relação) | sim |
| `brand` | Brand (relação) | sim |

