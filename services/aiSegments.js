// Sugestão de segmentos com IA (Google Gemini, free tier).
//
// A IA recebe um resumo do universe (elenco, rankings das divisões, campeões, rivalidades,
// lutas recentes) com REFERÊNCIAS CURTAS (W1, D2...) em vez de uuids, e devolve os segmentos
// do episódio. `normalize` traduz as referências de volta, descarta o que for inventado e
// aplica as mesmas regras do card (um main event, rivalidade só em luta, sem lutador repetido).
// Nada é gravado aqui: o resultado é uma prévia para o usuário revisar.
const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const schemas = require('../validators/schemas');
const { episodeInclude, dateOf } = require('./universeClock');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Modelos aposentam e mudam por conta. GEMINI_MODEL aceita uma lista separada por vírgula:
// se um modelo não existir (404), estiver sobrecarregado (429/5xx) ou demorar demais, tenta o
// próximo. Os "flash-lite" respondem em segundos; os Flash "pensantes" (gemini-flash-latest)
// chegam a passar de 1 minuto com saída estruturada, então ficam fora do padrão.
const DEFAULT_MODELS =
  'gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-flash-lite-latest';
const TIMEOUT_MS = () => Number(process.env.GEMINI_TIMEOUT_MS ?? 30000);
const RETRY_WAITS = [3000, 10000];
const ELIGIBLE_CONTRACTS = ['FULL_TIME', 'PART_TIME', 'LEGEND'];
const RANK_DEPTH = 8;
const RECENT_FIGHTS = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────── Contexto do universe ─────────────

const refs = (prefix) => {
  let n = 0;
  const toId = new Map();
  const toRef = new Map();
  return {
    add(id) {
      if (toRef.has(id)) return toRef.get(id);
      const ref = `${prefix}${++n}`;
      toRef.set(id, ref);
      toId.set(ref, id);
      return ref;
    },
    ref: (id) => toRef.get(id),
    id: (ref) => toId.get(ref),
  };
};

/**
 * Carrega tudo o que a IA precisa saber do universe (uma vez por pedido/período).
 * Os filtros por brand são feitos depois, por episódio (`forEpisode`).
 */
async function loadUniverse(universeId) {
  const [
    wrestlers,
    teams,
    divisions,
    titles,
    matchTypes,
    rivalries,
    recentSegments,
  ] = await Promise.all([
    prisma.wrestler.findMany({
      where: {
        universeId,
        isActive: true,
        isInjured: false,
        contractType: { in: ELIGIBLE_CONTRACTS },
      },
      include: { brands: { select: { brandId: true } }, alignment: true },
      orderBy: { name: 'asc' },
    }),
    prisma.team.findMany({
      where: { universeId },
      include: { members: { select: { wrestlerId: true } } },
    }),
    prisma.cardDivision.findMany({
      where: { universeId, isActive: true },
      include: {
        brands: { select: { brandId: true } },
        entries: {
          orderBy: { position: 'asc' },
          take: RANK_DEPTH,
          include: {
            wrestler: { select: { id: true, name: true } },
            team: {
              select: {
                name: true,
                members: { select: { wrestlerId: true } },
              },
            },
          },
        },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    }),
    prisma.title.findMany({
      where: { universeId, isActive: true },
      include: {
        reigns: {
          where: { endDate: null },
          include: { holders: { include: { wrestler: true, team: true } } },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.matchType.findMany({
      where: { universeId },
      orderBy: { name: 'asc' },
    }),
    prisma.rivalry.findMany({
      where: { universeId },
      include: {
        members: { include: { wrestler: true, team: true } },
        _count: { select: { segments: true } },
      },
      orderBy: { startDate: 'desc' },
    }),
    prisma.segment.findMany({
      where: {
        type: 'MATCH',
        isDone: true,
        episode: { show: { universeId } },
      },
      include: {
        participants: {
          select: { wrestlerId: true, side: true, isWinner: true },
        },
        episode: { include: episodeInclude },
      },
      take: 300,
      orderBy: [
        { episode: { season: { number: 'desc' } } },
        { episode: { month: 'desc' } },
        { episode: { week: 'desc' } },
      ],
    }),
  ]);
  recentSegments.sort((a, b) => dateOf(b.episode) - dateOf(a.episode));
  return {
    wrestlers,
    teams,
    divisions,
    titles,
    matchTypes,
    rivalries,
    recent: recentSegments.slice(0, RECENT_FIGHTS),
  };
}

const inBrand = (brandId, links) =>
  !brandId || !links.length || links.some((l) => l.brandId === brandId);

/**
 * Contexto de UM episódio: aplica o filtro da brand do show, atribui as referências curtas e
 * guarda o que `normalize` precisa (mapas ref→id, rivalidades ativas...).
 */
function forEpisode(universe, episode, scheduled = new Set()) {
  const brandId = episode.show?.brandId ?? null;
  const W = refs('W');
  const D = refs('D');
  const T = refs('T');
  const M = refs('M');
  const R = refs('R');

  const wrestlers = universe.wrestlers.filter(
    (w) =>
      !scheduled.has(w.id) &&
      (!brandId || w.brands.some((b) => b.brandId === brandId)),
  );
  wrestlers.forEach((w) => W.add(w.id));
  const eligible = new Set(wrestlers.map((w) => w.id));
  const nameOf = new Map(universe.wrestlers.map((w) => [w.id, w.name]));
  const wRef = (id) => (eligible.has(id) ? W.ref(id) : null);

  const teams = universe.teams
    .map((t) => ({
      ...t,
      ids: t.members.map((m) => m.wrestlerId).filter((id) => eligible.has(id)),
    }))
    .filter((t) => t.ids.length >= 2 && t.ids.length === t.members.length);

  const titles = universe.titles.filter((t) =>
    inBrand(brandId, t.brandId ? [{ brandId: t.brandId }] : []),
  );
  titles.forEach((t) => T.add(t.id));
  const divisions = universe.divisions.filter((d) =>
    inBrand(brandId, d.brands),
  );
  divisions.forEach((d) => D.add(d.id));
  universe.matchTypes.forEach((m) => M.add(m.id));

  const holderLabel = (h) =>
    h.wrestlerId
      ? `${wRef(h.wrestlerId) ?? '(indisponível)'} ${h.wrestler?.name ?? ''}`.trim()
      : `${h.team?.name ?? 'dupla'} (dupla)`;
  const entryLabel = (e) =>
    e.wrestlerId
      ? `${wRef(e.wrestlerId) ?? 'X'} ${e.wrestler?.name ?? ''}`.trim()
      : `${e.team?.name ?? 'dupla'} [${(e.team?.members ?? [])
          .map((m) => wRef(m.wrestlerId))
          .filter(Boolean)
          .join('+')}]`;

  const rivalries = universe.rivalries.filter((r) => r.isActive);
  rivalries.forEach((r) => R.add(r.id));
  const ended = universe.rivalries.filter((r) => !r.isActive).slice(0, 8);

  const sideLabel = (r, side) =>
    r.members
      .filter((m) => m.side === side)
      .map((m) =>
        m.wrestlerId ? (wRef(m.wrestlerId) ?? m.wrestler?.name) : m.team?.name,
      )
      .join(' + ');
  const rivalryLine = (r, ref) => {
    const sides = [...new Set(r.members.map((m) => m.side))].sort();
    return `${ref ? `${ref} | ` : ''}${sides.map((s) => sideLabel(r, s)).join(' x ')} | ${r._count.segments} lutas`;
  };

  const lines = {
    wrestlers: wrestlers.map((w) => {
      const team = teams.filter((t) => t.ids.includes(w.id)).map((t) => t.name);
      return [
        W.ref(w.id),
        w.name,
        w.gender,
        w.alignment?.name ?? '-',
        w.overall ?? '-',
        team.join('/') || '-',
      ].join(' | ');
    }),
    teams: teams.map(
      (t) =>
        `${t.name} (${t.kind === 'FACTION' ? 'facção' : 'dupla'}): ${t.ids.map((id) => W.ref(id)).join(' + ')}`,
    ),
    titles: titles.map(
      (t) =>
        `${T.ref(t.id)} | ${t.name}${t.isTag ? ' (duplas)' : ''}${t.gender ? ` (${t.gender})` : ''} | campeão: ${
          t.reigns[0]?.holders.map(holderLabel).join(' + ') || 'vago'
        }`,
    ),
    divisions: divisions.map((d) => {
      const title = titles.find((t) => t.id === d.titleId);
      const queue = d.entries
        .map((e, i) => `${i + 1}.${entryLabel(e)}`)
        .join(', ');
      return `${D.ref(d.id)} | ${d.name}${d.gender ? ` (${d.gender})` : ''}${
        title ? ` | título ${T.ref(title.id)}` : ''
      } | fila de desafiantes: ${queue || 'vazia'}`;
    }),
    matchTypes: universe.matchTypes.map((m) => `${M.ref(m.id)} | ${m.name}`),
    rivalries: rivalries.map((r) => rivalryLine(r, R.ref(r.id))),
    ended: ended.map(
      (r) =>
        `${rivalryLine(r)} | vencedor: ${r.winnerSide ? `lado ${r.winnerSide} (${sideLabel(r, r.winnerSide)})` : 'sem vencedor'}`,
    ),
    recent: universe.recent.map((s) => {
      const sides = [...new Set(s.participants.map((p) => p.side))].sort();
      return sides
        .map((side) =>
          s.participants
            .filter((p) => p.side === side)
            .map((p) => nameOf.get(p.wrestlerId) ?? '?')
            .join(' + '),
        )
        .join(' x ');
    }),
  };

  return {
    episode,
    brandId,
    lines,
    W,
    D,
    T,
    M,
    R,
    eligible,
    titleIds: new Set(titles.map((t) => t.id)),
    divisionIds: new Set(divisions.map((d) => d.id)),
    rivalryIds: new Set(rivalries.map((r) => r.id)),
    nameOf,
  };
}

// ───────────── Prompt ─────────────

const SYSTEM = `Você é o booker de uma empresa de wrestling e monta os cards dos episódios.
Responda SOMENTE com JSON no formato pedido. Use exclusivamente as referências (W1, D1, T1, M1, R1...) fornecidas; nunca invente referências nem nomes.`;

const list = (items, empty = '(nenhum)') =>
  items.length ? items.map((l) => `- ${l}`).join('\n') : empty;

function episodeLabel(ep) {
  return `${ep.show?.name ?? 'Show'} — ${ep.title ?? `mês ${ep.month}${ep.week ? `, semana ${ep.week}` : ''}`}`;
}

function buildPrompt(ctx, opts = {}, planned = null) {
  const { count = 5, includeMainEvent = true, guidance } = opts;
  const { lines, episode } = ctx;
  const ple = episode.show?.kind && episode.show.kind !== 'WEEKLY';
  const history = planned?.history?.length
    ? `\nJÁ PLANEJADO NESTE PERÍODO (não repita confrontos; varie quem aparece):\n${list(planned.history.slice(-40))}`
    : '';
  const usage = planned?.usage?.size
    ? `\nAparições já planejadas no período (use mais quem aparece pouco): ${[
        ...planned.usage,
      ]
        .map(([id, n]) => `${ctx.nameOf.get(id)}=${n}`)
        .join(', ')}`
    : '';

  return `Monte o card de: ${episodeLabel(episode)} (${ple ? 'evento especial/PLE: card mais forte' : 'show semanal'}).
Gere exatamente ${count} segmentos, em ordem de exibição${
    includeMainEvent
      ? ', o último deve ser o main event (isMainEvent=true, apenas UM)'
      : ' (sem main event: isMainEvent=false em todos)'
  }.

REGRAS
- Lutas (type=MATCH) usam "sides": cada lado é uma lista de lutadores (W*). Dupla/facção = vários lutadores no mesmo lado. Mínimo 2 lados.
- Promos/outros (type=PROMO|OTHER) só têm lutadores em um lado e não têm título, divisão, stakes nem rivalidade.
- Cada lutador aparece no máximo UMA vez no episódio.
- Divisões: o 1º da fila de desafiantes é o próximo desafiante ao título da divisão. Luta de título: preencha "title" (T*) e "division"; um dos lados tem o campeão e o outro o desafiante (o 1º da fila, ou alguém entre os primeiros).
- stakes: "CONTENDER" = a luta define o próximo desafiante da divisão (o vencedor vai para o topo da fila); "RANKING" = vale subida na fila; "NONE" = nada em jogo. Stakes diferente de NONE exige "division" e lutadores dessa fila.
- Rivalidades ATIVAS devem ser alimentadas: coloque os envolvidos em lados opostos. Só marque "endsRivalry"=true (com "rivalry"=R*) numa luta final de uma rivalidade que já tem 3 ou mais lutas; caso contrário deixe false. Marque "startsRivalry"=true apenas para um confronto novo e marcante entre lados opostos que ainda não é rivalidade. Nunca os dois juntos.
- Respeite rankings: prefira desafiantes bem colocados; não escale campeões em lutas sem relevância. Use lutadores com overall alto nas lutas principais.
- "notes": uma frase curta (pt-BR) com a motivação do segmento.${guidance ? `\n- Orientação do usuário: ${guidance}` : ''}

ELENCO DISPONÍVEL (ref | nome | gênero | alinhamento | overall | equipes)
${list(lines.wrestlers)}

DUPLAS E FACÇÕES
${list(lines.teams)}

TÍTULOS
${list(lines.titles)}

DIVISÕES (rankings)
${list(lines.divisions)}

TIPOS DE LUTA (use "matchType")
${list(lines.matchTypes)}

RIVALIDADES ATIVAS (ref | lados | lutas)
${list(lines.rivalries)}

RIVALIDADES ENCERRADAS RECENTEMENTE (evite repeti-las agora)
${list(lines.ended)}

ÚLTIMAS LUTAS REALIZADAS (evite repetir)
${list(lines.recent)}${history}${usage}`;
}

// ───────────── Gemini ─────────────

const str = (extra = {}) => ({ type: 'STRING', ...extra });
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    segments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: str({ enum: ['MATCH', 'PROMO', 'OTHER'] }),
          matchType: str({ nullable: true }),
          title: str({ nullable: true }),
          division: str({ nullable: true }),
          stakes: str({ enum: ['NONE', 'RANKING', 'CONTENDER'] }),
          isMainEvent: { type: 'BOOLEAN' },
          startsRivalry: { type: 'BOOLEAN' },
          endsRivalry: { type: 'BOOLEAN' },
          rivalry: str({ nullable: true }),
          notes: str({ nullable: true }),
          sides: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                wrestlers: { type: 'ARRAY', items: str() },
              },
              required: ['wrestlers'],
            },
          },
        },
        required: ['type', 'stakes', 'isMainEvent', 'sides'],
      },
    },
  },
  required: ['segments'],
};

/**
 * Chama o Gemini e devolve o JSON já interpretado. `deps` existe para os testes
 * (`fetchImpl`, `sleepImpl`) — em produção usa o fetch nativo.
 */
async function callGemini(prompt, deps = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new HttpError(
      503,
      'IA não configurada: defina GEMINI_API_KEY no servidor',
    );
  }
  const doFetch = deps.fetchImpl ?? fetch;
  const wait = deps.sleepImpl ?? sleep;
  const models = (process.env.GEMINI_MODEL || DEFAULT_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const gone = new Set(); // modelos que não existem para esta conta (404)
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.9,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const reasonOf = async (res) => {
    try {
      return String((await res.json())?.error?.message ?? '').slice(0, 200);
    } catch {
      return '';
    }
  };

  let last = null; // último problema "passageiro" (sobrecarga, tempo, resposta ruim)
  for (let round = 0; ; round++) {
    for (const model of models) {
      if (gone.has(model)) continue;
      let res;
      try {
        res = await doFetch(`${GEMINI_URL}/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS()),
        });
      } catch {
        last = { status: 504, model };
        continue; // tempo esgotado/rede: tenta o próximo modelo
      }
      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        try {
          return JSON.parse(text);
        } catch {
          last = { status: 502, model };
          continue;
        }
      }
      if (res.status === 404) {
        gone.add(model);
        last = { status: 404, model, reason: await reasonOf(res) };
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        last = { status: res.status, model };
        continue;
      }
      // 400/401/403: problema da chave ou do pedido; outro modelo não resolve
      const reason = await reasonOf(res);
      const hint = [401, 403].includes(res.status)
        ? ' Confira a GEMINI_API_KEY no servidor: ela precisa ser igual à chave criada no Google AI Studio, inteira e sem aspas.'
        : '';
      throw new HttpError(
        502,
        `A IA recusou o pedido (HTTP ${res.status})${reason ? `: ${reason}` : ''}.${hint}`,
      );
    }

    if (gone.size === models.length) {
      throw new HttpError(
        502,
        `Nenhum dos modelos configurados está disponível (${models.join(', ')}): ajuste GEMINI_MODEL.${last?.reason ? ` ${last.reason}` : ''}`,
      );
    }
    if (round >= RETRY_WAITS.length) break;
    await wait(RETRY_WAITS[round]);
  }

  if (last?.status === 429 || last?.status === 503) {
    throw new HttpError(
      429,
      'A IA gratuita está sobrecarregada ou no limite. Aguarde um pouco e tente de novo (ou reduza o período)',
    );
  }
  if (last?.status === 504) {
    throw new HttpError(
      502,
      'A IA demorou demais para responder. Tente de novo em instantes',
    );
  }
  throw new HttpError(
    502,
    'A IA devolveu uma resposta inválida. Tente de novo',
  );
}

// ───────────── Normalização ─────────────

/**
 * Traduz a resposta da IA para segmentos no formato de POST /episodes/:id/segments e aplica
 * as regras do card. Devolve { segments, warnings } — nada inválido passa.
 */
function normalize(raw, ctx, opts = {}) {
  const {
    count = 10,
    includeMainEvent = true,
    endedRivalries = new Set(),
  } = opts;
  const warnings = [];
  const used = new Set();
  const out = [];
  const items = Array.isArray(raw?.segments) ? raw.segments : [];

  items.forEach((item, i) => {
    const tag = `Segmento ${i + 1}`;
    const type = ['MATCH', 'PROMO', 'OTHER'].includes(item?.type)
      ? item.type
      : null;
    if (!type) return warnings.push(`${tag}: tipo inválido, descartado`);

    const participants = [];
    const dropped = [];
    (item.sides ?? []).forEach((side, si) => {
      for (const ref of side?.wrestlers ?? []) {
        const id = ctx.W.id(ref);
        if (!id || !ctx.eligible.has(id)) dropped.push(ref);
        else if (!participants.some((p) => p.wrestlerId === id)) {
          participants.push({ wrestlerId: id, side: si + 1, isWinner: false });
        }
      }
    });
    if (dropped.length) {
      warnings.push(
        `${tag}: lutadores desconhecidos ignorados (${dropped.join(', ')})`,
      );
    }
    // renumera os lados (podem ter ficado buracos se um lado esvaziou)
    const sideOrder = [...new Set(participants.map((p) => p.side))].sort(
      (a, b) => a - b,
    );
    participants.forEach((p) => (p.side = sideOrder.indexOf(p.side) + 1));

    if (type === 'MATCH' && sideOrder.length < 2) {
      return warnings.push(`${tag}: luta sem dois lados válidos, descartada`);
    }
    if (!participants.length && type === 'MATCH') return;
    if (participants.some((p) => used.has(p.wrestlerId))) {
      return warnings.push(`${tag}: lutador repetido no episódio, descartado`);
    }

    const seg = {
      type,
      titleChanged: false,
      isMainEvent: item.isMainEvent === true,
      isDone: false,
      stakes: 'NONE',
      notes: item.notes ? String(item.notes).slice(0, 2000) : null,
      participants,
    };

    if (type === 'MATCH') {
      const matchTypeId = ctx.M.id(item.matchType);
      if (matchTypeId) seg.matchTypeId = matchTypeId;
      const titleId = ctx.T.id(item.title);
      if (titleId && ctx.titleIds.has(titleId)) seg.titleId = titleId;
      const divisionId = ctx.D.id(item.division);
      if (divisionId && ctx.divisionIds.has(divisionId)) {
        seg.cardDivisionId = divisionId;
        if (['RANKING', 'CONTENDER'].includes(item.stakes))
          seg.stakes = item.stakes;
      }

      let starts = item.startsRivalry === true;
      let ends = item.endsRivalry === true;
      if (starts && ends) {
        ends = false;
        warnings.push(
          `${tag}: não pode começar e encerrar rivalidade; mantido só "começa"`,
        );
      }
      if (ends) {
        const rivalryId = ctx.R.id(item.rivalry);
        if (
          !rivalryId ||
          !ctx.rivalryIds.has(rivalryId) ||
          endedRivalries.has(rivalryId)
        ) {
          ends = false;
          warnings.push(`${tag}: rivalidade a encerrar inválida, ignorada`);
        } else seg.rivalryId = rivalryId;
      }
      seg.startsRivalry = starts;
      seg.endsRivalry = ends;
    } else {
      Object.assign(seg, {
        startsRivalry: false,
        endsRivalry: false,
        isMainEvent: false,
      });
    }

    // confere com o schema oficial do card (mesmo que o POST /episodes/:id/segments)
    const { error, value } = schemas.buildCard.validate(
      { segments: [seg] },
      { stripUnknown: true },
    );
    if (error) {
      return warnings.push(`${tag}: ${error.details[0].message}, descartado`);
    }
    participants.forEach((p) => used.add(p.wrestlerId));
    out.push(value.segments[0]);
  });

  const segments = out.slice(0, count);
  if (out.length > count)
    warnings.push(
      `A IA gerou ${out.length} segmentos; mantidos os ${count} primeiros`,
    );

  // um só main event: o primeiro marcado; se pediu main event e não veio, a última luta
  let main = segments.findIndex((s) => s.isMainEvent);
  if (!includeMainEvent) main = -1;
  else if (main === -1) {
    main = segments.map((s) => s.type).lastIndexOf('MATCH');
  }
  segments.forEach((s, i) => (s.isMainEvent = i === main));

  return { segments, warnings };
}

// ───────────── Sugestão de um episódio ─────────────

/**
 * Sugere o card de um episódio. `planned` = estado acumulado do período (ver aiPlanner),
 * opcional. Devolve { episodeId, label, segments, warnings } com os segmentos já prontos para
 * o POST do card e, em `view`, dados extras para a prévia (nomes dos lutadores etc.).
 */
async function suggestForEpisode(
  universe,
  episode,
  opts = {},
  planned = null,
  deps = {},
) {
  const scheduled = new Set(
    (
      await prisma.segmentParticipant.findMany({
        where: { segment: { episodeId: episode.id } },
        select: { wrestlerId: true },
      })
    ).map((p) => p.wrestlerId),
  );
  const ctx = forEpisode(universe, episode, scheduled);
  if (ctx.eligible.size < 2) {
    throw new HttpError(
      400,
      'Elenco insuficiente para este episódio (verifique lutadores ativos e da brand do show)',
    );
  }
  const raw = await callGemini(buildPrompt(ctx, opts, planned), deps);
  const result = normalize(raw, ctx, {
    ...opts,
    endedRivalries: planned?.endedRivalries,
  });
  return { ...result, ctx };
}

module.exports = {
  loadUniverse,
  forEpisode,
  buildPrompt,
  callGemini,
  normalize,
  suggestForEpisode,
  episodeLabel,
  RESPONSE_SCHEMA,
};
