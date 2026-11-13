const prisma = require('../config/database');
const { episodeDate } = require('./timeline');

const episodeInclude = {
  show: { select: { kind: true, weekday: true } },
  season: { select: { number: true, startDate: true } },
};

const dateOf = (ep) => episodeDate(ep, ep.season);

/** "Hoje" dentro do universe: a data (real ou por mês/semana) do último episódio realizado. */
async function universeNow(universeId) {
  const done = await prisma.episode.findMany({
    where: { show: { universeId }, status: 'DONE' },
    include: episodeInclude,
  });
  if (!done.length) return null;
  return new Date(Math.max(...done.map((e) => dateOf(e).getTime())));
}

module.exports = { universeNow, episodeInclude, dateOf };
