#!/usr/bin/env node
/**
 * Gera a tabela de contratos da API a partir do que já existe no código:
 *  - corpo das requisições: validators/schemas.js (Joi.describe)
 *  - modelos de resposta/enums: Prisma DMMF
 *  - filtros, referências, ordenação de cada recurso: controllers/resources.js (makeCrud.meta)
 *  - rotas: routes/**\/index.js (lidos como texto)
 *
 * Saída: docs/api-contracts.json (para o app) e docs/API-CONTRACTS.md (leitura humana).
 * Uso: npm run contracts            (grava os arquivos)
 *      node scripts/gen-contracts.js --check   (falha se estiverem desatualizados)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

// Evita exigir JWT_SECRET/DATABASE_URL só para ler as definições.
process.env.JWT_SECRET ||= 'contracts';

const schemas = require('../validators/schemas');
const resources = require('../controllers/resources');
const { Prisma } = require('@prisma/client');

// ---------------------------------------------------------------- Joi -> JSON
function describeJoi(desc) {
  if (!desc) return null;
  const out = { type: desc.type };
  const flags = desc.flags || {};
  if (flags.presence === 'required') out.required = true;
  if (flags.default !== undefined && typeof flags.default !== 'object') {
    out.default = flags.default;
  }
  if (flags.only && desc.allow) {
    out.enum = desc.allow.filter((v) => v !== null);
  } else if (desc.allow) {
    const extra = desc.allow.filter((v) => v !== null);
    if (extra.length) out.alsoAllows = extra;
  }
  if (desc.allow && desc.allow.includes(null)) out.nullable = true;
  for (const r of desc.rules || []) {
    if (['min', 'max', 'length'].includes(r.name)) {
      out[r.name] = r.args?.limit;
    } else if (r.name === 'integer') out.integer = true;
    else if (r.name === 'email') out.format = 'email';
    else if (r.name === 'uri') out.format = 'uri';
    else if (r.name === 'guid') out.format = 'uuid';
  }
  if (desc.type === 'date' && flags.format) out.format = flags.format;
  if (desc.type === 'array' && desc.items?.length) {
    out.items = describeJoi(desc.items[0]);
  }
  if (desc.type === 'object' && desc.keys) {
    out.fields = Object.fromEntries(
      Object.entries(desc.keys)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, describeJoi(v)]),
    );
  }
  if (desc.type === 'alternatives' && desc.matches) {
    out.oneOf = desc.matches.map((m) => describeJoi(m.schema));
  }
  // xor/or declarados no objeto (ex.: wrestlerId XOR teamId)
  if (desc.dependencies?.length) {
    out.dependencies = desc.dependencies.map((d) => ({
      rel: d.rel,
      peers: d.peers,
    }));
  }
  return out;
}

const describeSchema = (s) => (s ? describeJoi(s.describe()) : null);

// ------------------------------------------------------------- Prisma models
function prismaModels() {
  const { models, enums } = Prisma.dmmf.datamodel;
  const m = {};
  for (const model of [...models].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    m[model.name] = model.fields.map((f) => ({
      name: f.name,
      type: f.type,
      kind: f.kind, // scalar | enum | object
      list: f.isList,
      required: f.isRequired,
    }));
  }
  const e = {};
  for (const en of [...enums].sort((a, b) => a.name.localeCompare(b.name))) {
    e[en.name] = en.values.map((v) => v.name);
  }
  return { models: m, enums: e };
}

// -------------------------------------------------------------------- routes
const ROUTE_FILES = [
  {
    file: 'routes/auth/index.js',
    prefix: '/api/auth',
    auth: false,
    authOverride: { '/me': true },
  },
  {
    file: 'routes/universe/index.js',
    prefix: '/api/universes',
    auth: true,
    vars: { scoped: '/:universeId' },
  },
  ...[
    'roster',
    'titles',
    'shows',
    'tournaments',
    'media',
    'stats',
    'import',
  ].map((n) => ({
    file: `routes/${n}/index.js`,
    prefix: '/api/universes/:universeId',
    auth: true,
  })),
];

function parseRoutes() {
  const eps = [];
  const crud = [];
  for (const rf of ROUTE_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rf.file), 'utf8');
    // router.get('/x', validate(schemas.a.b), handler)  (também scoped.*)
    const re =
      /\b(router|scoped)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\3([\s\S]*?)\);/g;
    let m;
    while ((m = re.exec(src))) {
      const [, obj, method, , p, rest] = m;
      const base = obj === 'scoped' ? rf.prefix + rf.vars.scoped : rf.prefix;
      const full = (base + (p === '/' ? '' : p)).replace(/\/+$/, '') || '/';
      const body = /validate\(schemas\.([\w.]+)\)/.exec(rest)?.[1] ?? null;
      const upload = /\.single\b/.test(rest);
      eps.push({
        method: method.toUpperCase(),
        path: full,
        auth: rf.authOverride?.[p] ?? rf.auth,
        body: upload ? 'multipart/form-data (campo "file")' : body,
      });
    }
    const reCrud = /crudRoutes\(\s*router,\s*'([^']+)',\s*'([^']+)'\s*\)/g;
    while ((m = reCrud.exec(src))) {
      crud.push({ path: m[1], key: m[2], prefix: rf.prefix });
    }
  }
  return { eps, crud };
}

// Respostas das rotas que não são CRUD (não dá para deduzir do código).
const NOTES = {
  'POST /api/auth/register':
    'Corpo: auth.register. 201 {token, refreshToken, user, universe}. 409 e-mail duplicado.',
  'POST /api/auth/login':
    '200 {token, refreshToken, user}. 401 credenciais inválidas.',
  'POST /api/auth/refresh':
    'Troca o refresh token (rotativo). 200 {token, refreshToken, user}. 401 inválido/expirado/reusado (reuso revoga todos).',
  'POST /api/auth/logout': 'Revoga o refresh token. 204.',
  'POST /api/auth/forgot-password':
    '200 {exists:true} ou 404. (Fluxo temporário, sem e-mail.)',
  'POST /api/auth/reset-password':
    '200 {ok:true}. Revoga os refresh tokens do usuário.',
  'GET /api/auth/me':
    '200 {id,email,name,createdAt}. 401 se o token for inválido.',
  'GET /api/universes': '200 array (sem paginação).',
  'POST /api/universes/:universeId/reset':
    'Corpo {confirm:true}. Apaga tudo e restaura o padrão. 200 {message}.',
  'POST /api/universes/:universeId/episodes/generate':
    '201 {created:N}. Não duplica episódios existentes.',
  'GET /api/universes/:universeId/episodes/:id/card':
    '200 episódio com `segments` ordenados (participants, matchType, title...).',
  'POST /api/universes/:universeId/episodes/:id/segments':
    'Monta o card na ordem do array. `replace:true` apaga o atual. 201 lista de segmentos.',
  'PUT /api/universes/:universeId/episodes/:id/segments/order':
    '200 {order:[ids]}.',
  'GET /api/universes/:universeId/tournaments/:id/bracket':
    '200 {tournament, entrants, matches}. Cada match traz entrantA/B, extras, winner, matchType, segment.',
  'POST /api/universes/:universeId/tournaments/:id/generate-bracket':
    'Apaga e recria as lutas. Usa tournament.firstRoundMatches/firstRoundPerMatch e entrant.startRound. 201 {created:N}.',
  'POST /api/universes/:universeId/tournaments/:id/schedule-round':
    '200 {scheduled:N}.',
  'GET /api/universes/:universeId/tournaments/open-matches':
    'Lutas de torneio ainda não agendadas.',
  'GET /api/universes/:universeId/card-divisions/board':
    'Filtro opcional ?brandId=. Divisões com fila e campeão.',
  'POST /api/universes/:universeId/card-divisions/defaults': '201 {created}.',
  'GET /api/universes/:universeId/wrestlers/:id/record':
    '200 {wrestlerId, matches, wins, losses, draws, titleReigns}.',
  'GET /api/universes/:universeId/titles/:id/history':
    '200 {title, reigns[]} com days/defenses.',
  'GET /api/universes/:universeId/stats/titles':
    '200 estatísticas de todos os títulos (baselines + reinados).',
  'POST /api/universes/:universeId/uploads':
    'multipart `file` (jpeg/png/webp/gif, até 5 MB). 201 {key, imageUrl:"storage:...", url}. Salve `imageUrl`; `url` é só prévia (expira em 1h).',
  'POST /api/universes/:universeId/import/universe-sheet':
    'multipart `file` (.xlsx até 10 MB) + `options` JSON. Sem ?apply=true só pré-visualiza.',
  'GET /api/universes/:universeId/brands/:id/impact':
    'O que será afetado ao desativar (episódios).',
  'GET /api/universes/:universeId/shows/:id/impact':
    'O que será afetado ao desativar (episódios).',
  'POST /api/universes/:universeId/title-baselines/defaults':
    'Importa o histórico padrão de títulos.',
};

const CONVENTIONS = {
  base: '/api',
  auth: 'Authorization: Bearer <token>. token = JWT de acesso (padrão 7d). refreshToken opaco (90d) via POST /api/auth/refresh.',
  list: 'GET de coleção -> {data:[], total, limit, offset}. ?limit (padrão 100, máx. 500) e ?offset. Filtros: apenas os listados em `filters` de cada recurso (true/false e dígitos são convertidos).',
  errors:
    '{success:false, message, details?:string[]}. 422 validação (Joi), 401 auth, 404, 409 unicidade, 400 referência inválida.',
  write:
    'POST 201 devolve o objeto. PUT e PATCH são equivalentes (todos os campos opcionais, ao menos um). DELETE 204 sem corpo. Campos desconhecidos são descartados.',
  images:
    '`imageUrl` chega como URL assinada (expira em 1h). Para gravar, envie a chave `storage:<universeId>/<uuid>.<ext>` do upload; uma URL assinada do próprio bucket também é aceita e convertida.',
  dates: 'ISO 8601. Calendário do jogo: meses maio->abril, 4 semanas por mês.',
};

// --------------------------------------------------------------------- build
function build() {
  const { eps, crud } = parseRoutes();
  const { models, enums } = prismaModels();

  const resourceMap = {};
  for (const c of crud.sort((a, b) => a.path.localeCompare(b.path))) {
    const handlers = resources[c.key];
    const sch = schemas[c.key];
    const meta = handlers?.meta ?? {};
    const modelName = meta.model
      ? meta.model[0].toUpperCase() + meta.model.slice(1)
      : null;
    resourceMap[c.path.replace(/^\//, '')] = {
      path: `${c.prefix}${c.path}`,
      model: modelName,
      filters: meta.filters ?? [],
      refs: meta.refs ?? {},
      orderBy: meta.orderBy ?? null,
      includes: meta.include ?? [],
      create: describeSchema(sch?.create),
      update: describeSchema(sch?.update),
    };
  }

  const endpoints = eps
    .sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method))
    .map((e) => {
      const sch = e.body
        ? e.body.split('.').reduce((o, k) => o?.[k], schemas)
        : null;
      const key = `${e.method} ${e.path}`;
      return {
        method: e.method,
        path: e.path,
        auth: e.auth,
        body: e.body && !e.body.startsWith('multipart') ? e.body : undefined,
        multipart: e.body?.startsWith('multipart') ? e.body : undefined,
        bodySchema:
          sch && typeof sch.describe === 'function'
            ? describeSchema(sch)
            : undefined,
        notes: NOTES[key],
      };
    });

  return {
    conventions: CONVENTIONS,
    enums,
    models,
    resources: resourceMap,
    endpoints,
  };
}

// ------------------------------------------------------------------ markdown
const fmtField = (name, f) => {
  const bits = [f.type];
  if (f.format) bits.push(f.format);
  if (f.integer) bits[0] = 'integer';
  if (f.enum) bits.push(`enum(${f.enum.join('|')})`);
  if (f.min !== undefined) bits.push(`min ${f.min}`);
  if (f.max !== undefined) bits.push(`max ${f.max}`);
  if (f.items) bits.push(`de ${f.items.type}`);
  if (f.default !== undefined) bits.push(`padrão ${JSON.stringify(f.default)}`);
  return `| \`${name}\` | ${bits.join(', ')} | ${f.required ? 'sim' : ''} | ${f.nullable ? 'sim' : ''} |`;
};

function toMarkdown(c) {
  const L = [];
  L.push('# Contratos da API', '');
  L.push(
    '> Gerado por `npm run contracts` (scripts/gen-contracts.js). Não edite à mão.',
    '',
  );
  L.push('## Convenções', '');
  for (const [k, v] of Object.entries(c.conventions))
    L.push(`- **${k}**: ${v}`);
  L.push('', '## Enums', '');
  for (const [k, v] of Object.entries(c.enums))
    L.push(`- \`${k}\`: ${v.join(', ')}`);
  L.push('', '## Recursos (CRUD)', '');
  for (const [name, r] of Object.entries(c.resources)) {
    L.push(`### ${name}`, '');
    L.push(
      `- Rota: \`${r.path}\` (GET lista, POST, GET/PUT/PATCH/DELETE \`/:id\`)`,
    );
    L.push(
      `- Modelo de resposta: \`${r.model}\`${r.includes.length ? ` + ${r.includes.map((i) => `\`${i}\``).join(', ')}` : ''}`,
    );
    if (r.filters.length)
      L.push(`- Filtros: ${r.filters.map((f) => `\`${f}\``).join(', ')}`);
    const refs = Object.entries(r.refs);
    if (refs.length)
      L.push(
        `- Referências validadas: ${refs.map(([k, v]) => `\`${k}\`→${v}`).join(', ')}`,
      );
    for (const mode of ['create', 'update']) {
      const s = r[mode];
      if (!s?.fields) continue;
      L.push(
        '',
        `**${mode === 'create' ? 'Criar (POST)' : 'Atualizar (PUT/PATCH)'}**`,
        '',
      );
      L.push(
        '| Campo | Tipo | Obrigatório | Aceita null |',
        '|---|---|---|---|',
      );
      for (const [k, f] of Object.entries(s.fields)) L.push(fmtField(k, f));
      if (mode === 'create') continue;
      break; // update tem os mesmos campos, todos opcionais
    }
    L.push('');
  }
  L.push('## Endpoints especiais e auth', '');
  L.push('| Método | Rota | Auth | Corpo | Notas |', '|---|---|---|---|---|');
  for (const e of c.endpoints) {
    L.push(
      `| ${e.method} | \`${e.path}\` | ${e.auth ? 'sim' : 'não'} | ${e.body ? `\`${e.body}\`` : (e.multipart ?? '')} | ${e.notes ?? ''} |`,
    );
  }
  L.push('', '## Modelos (Prisma)', '');
  for (const [name, fields] of Object.entries(c.models)) {
    L.push(
      `### ${name}`,
      '',
      '| Campo | Tipo | Obrigatório |',
      '|---|---|---|',
    );
    for (const f of fields) {
      L.push(
        `| \`${f.name}\` | ${f.type}${f.list ? '[]' : ''}${f.kind === 'object' ? ' (relação)' : ''} | ${f.required ? 'sim' : ''} |`,
      );
    }
    L.push('');
  }
  return L.join('\n') + '\n';
}

const render = () => {
  const contracts = build();
  return {
    json: JSON.stringify(contracts, null, 2) + '\n',
    md: toMarkdown(contracts),
  };
};

module.exports = { build, render };

if (require.main === module) {
  const { json, md } = render();
  const files = {
    'api-contracts.json': json,
    'API-CONTRACTS.md': md,
  };
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([f, c]) => {
      const p = path.join(DOCS, f);
      return !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== c;
    });
    if (stale.length) {
      console.error(
        `Contratos desatualizados: ${stale.map(([f]) => f).join(', ')}. Rode: npm run contracts`,
      );
      process.exit(1);
    }
    console.log('Contratos em dia.');
  } else {
    fs.mkdirSync(DOCS, { recursive: true });
    for (const [f, c] of Object.entries(files))
      fs.writeFileSync(path.join(DOCS, f), c);
    console.log(`Gerado em docs/: ${Object.keys(files).join(', ')}`);
  }
}
