// Planejamento de um PERÍODO com IA (ex.: julho a novembro).
//
// Roda como job em memória: um pedido cria o job e devolve o id; o front consulta o
// progresso. Os episódios são processados em ordem cronológica, UMA chamada de IA por
// episódio, e cada um recebe o resumo do que já foi planejado antes (confrontos e aparições),
// para dar variedade. Resultados das lutas são desconhecidos, então rankings/rivalidades
// ficam no estado atual do banco; nada é gravado aqui.
const { randomUUID } = require('crypto');
const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const { episodeInclude, dateOf } = require('./universeClock');
const { SEASON_MONTHS } = require('./seasonCalendar');
const { gameWeek } = require('./timeline');
const ai = require('./aiSegments');

const MAX_EPISODES = 60;
const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const minInterval = () => Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 4500);

// Posição no calendário do jogo: mês da temporada (maio = 0 ... abril = 11) x 4 semanas.
// Episódio sem semana (PLE sem semana definida) conta como semana 4, como na linha do tempo.
const slot = ({ month, week }) =>
  SEASON_MONTHS.indexOf(month) * 4 + (gameWeek(week) - 1);

function purge() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.updatedAt > JOB_TTL_MS)
      jobs.delete(id);
  }
}

/**
 * Episódios do período, em ordem cronológica. O período segue o calendário do jogo:
 * temporada + mês/semana de início e de fim (inclusive). from/to: { month, week }.
 */
async function pickEpisodes(
  universeId,
  { seasonId, from, to, showIds, skipPlanned = true },
) {
  const start = slot(from);
  const end = slot(to);
  if (end < start) {
    throw new HttpError(400, 'O fim do período é anterior ao início');
  }
  const all = await prisma.episode.findMany({
    where: {
      seasonId,
      show: {
        universeId,
        isActive: true,
        ...(showIds ? { id: { in: showIds } } : {}),
      },
      status: skipPlanned ? 'UNPLANNED' : { not: 'DONE' },
    },
    include: { ...episodeInclude, show: true },
  });
  const picked = all
    .filter((e) => slot(e) >= start && slot(e) <= end)
    .map((e) => ({ e, date: dateOf(e) }))
    .sort(
      (a, b) => a.date - b.date || a.e.show.name.localeCompare(b.e.show.name),
    );
  if (!picked.length) {
    throw new HttpError(
      404,
      'Nenhum episódio a planejar no período (gere os episódios primeiro ou desmarque "pular já planejados")',
    );
  }
  if (picked.length > MAX_EPISODES) {
    throw new HttpError(
      400,
      `O período tem ${picked.length} episódios; o máximo por vez é ${MAX_EPISODES}. Reduza o período ou os shows`,
    );
  }
  return picked;
}

// Estado acumulado do período, devolvido ao prompt dos episódios seguintes.
const newPlanned = () => ({
  history: [],
  usage: new Map(),
  endedRivalries: new Set(),
});

function accumulate(planned, ctx, result, label) {
  const bySeg = result.segments.map((s) => {
    const sides = [...new Set(s.participants.map((p) => p.side))].sort();
    return sides
      .map((side) =>
        s.participants
          .filter((p) => p.side === side)
          .map((p) => ctx.nameOf.get(p.wrestlerId) ?? '?')
          .join(' + '),
      )
      .join(' x ');
  });
  planned.history.push(...bySeg.map((t) => `${label}: ${t}`));
  for (const s of result.segments) {
    for (const p of s.participants) {
      planned.usage.set(
        p.wrestlerId,
        (planned.usage.get(p.wrestlerId) ?? 0) + 1,
      );
    }
    if (s.endsRivalry && s.rivalryId) planned.endedRivalries.add(s.rivalryId);
  }
}

/** Dados da prévia: nomes legíveis (o front não precisa buscar nada). */
function toView(ctx, result, episode, date) {
  return {
    episodeId: episode.id,
    label: ai.episodeLabel(episode),
    showName: episode.show?.name ?? null,
    date: date.toISOString(),
    segments: result.segments.map((s) => ({
      ...s,
      participants: s.participants.map((p) => ({
        ...p,
        wrestlerName: ctx.nameOf.get(p.wrestlerId) ?? '?',
      })),
    })),
    warnings: result.warnings,
  };
}

async function run(job, picked, opts, deps) {
  try {
    const universe = await ai.loadUniverse(job.universeId);
    const planned = newPlanned();
    let first = true;
    for (const { e, date } of picked) {
      if (job.cancelled) {
        job.status = 'cancelled';
        break;
      }
      if (!first)
        await (deps.sleepImpl ?? sleep)(deps.intervalMs ?? minInterval());
      first = false;
      job.current = ai.episodeLabel(e);
      try {
        const result = await ai.suggestForEpisode(
          universe,
          e,
          opts,
          planned,
          deps,
        );
        accumulate(planned, result.ctx, result, ai.episodeLabel(e));
        job.episodes.push(toView(result.ctx, result, e, date));
      } catch (err) {
        job.episodes.push({
          episodeId: e.id,
          label: ai.episodeLabel(e),
          showName: e.show?.name ?? null,
          date: date.toISOString(),
          segments: [],
          warnings: [],
          error: err.message,
        });
        // limite da cota: não adianta insistir nos próximos
        if (err.statusCode === 429 || err.statusCode === 503) {
          job.error = err.message;
          job.status = 'error';
          break;
        }
      }
      job.done += 1;
      job.updatedAt = Date.now();
    }
    if (job.status === 'running') job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
  } finally {
    job.current = null;
    job.updatedAt = Date.now();
  }
}

/** Cria o job do período e começa a processar em segundo plano. */
async function startRange(universeId, userId, opts, deps = {}) {
  purge();
  for (const j of jobs.values()) {
    if (j.universeId === universeId && j.status === 'running') {
      throw new HttpError(
        409,
        'Já existe um planejamento em andamento neste universe',
      );
    }
  }
  const picked = await pickEpisodes(universeId, opts);
  const job = {
    id: randomUUID(),
    universeId,
    userId,
    status: 'running',
    total: picked.length,
    done: 0,
    current: null,
    episodes: [],
    error: null,
    cancelled: false,
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  const promise = run(job, picked, opts, deps);
  return { job, promise };
}

const publicJob = (j) => ({
  id: j.id,
  status: j.status,
  total: j.total,
  done: j.done,
  current: j.current,
  error: j.error,
  episodes: j.episodes,
});

function getJob(universeId, id) {
  const job = jobs.get(id);
  if (!job || job.universeId !== universeId) {
    throw new HttpError(
      404,
      'Planejamento não encontrado (pode ter expirado); gere de novo',
    );
  }
  return publicJob(job);
}

function cancelJob(universeId, id) {
  const job = jobs.get(id);
  if (!job || job.universeId !== universeId) {
    throw new HttpError(404, 'Planejamento não encontrado');
  }
  job.cancelled = true;
  return publicJob(job);
}

module.exports = {
  startRange,
  getJob,
  cancelJob,
  pickEpisodes,
  newPlanned,
  accumulate,
  toView,
  MAX_EPISODES,
  _jobs: jobs,
};
