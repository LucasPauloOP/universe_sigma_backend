// Calendário do JOGO. No universe todo mês tem exatamente 4 semanas (28 dias) e cada
// semana vai de segunda a domingo; o calendário real não importa. Um episódio é
// posicionado por mês + semana + dia da semana do show:
//   RAW (segunda), NXT (terça), SmackDown (sexta), PLE (sábado; Noite 2 = domingo)...
// Assim a ordem de jogo e o calendário sempre batem (RAW → SmackDown → PLE de cada
// semana) e meses de 5 semanas "reais" não existem. Uma `airDate` preenchida à mão
// continua valendo no lugar da calculada.
//
// As datas calculadas são "datas de jogo" (dia 1 a 28 de cada mês): servem para ordenar
// e para contar dias. Os dias entre duas datas são contados em dias de jogo (28 por mês).
const BASE_YEAR = 2026; // temporada 1 = maio/2026 a abril/2027
const SATURDAY = 6;
const MONDAY = 1;
const GAME_MONTH_DAYS = 28;

const seasonYear = (season) =>
  season?.startDate
    ? new Date(season.startDate).getUTCFullYear()
    : BASE_YEAR + ((season?.number ?? 1) - 1);

// Dia da semana em que o show acontece: o cadastrado; sem ele, segunda (semanal) ou sábado (PLE).
const weekdayOf = (show) =>
  show?.weekday ?? (show?.kind === 'WEEKLY' ? MONDAY : SATURDAY);

// Posição na semana de jogo: segunda = 0 ... domingo = 6.
const dayOffset = (weekday) => (weekday + 6) % 7;

// Semana do jogo (1 a 4): vazio = 4, e nunca passa de 4.
const gameWeek = (week) => Math.min(Math.max(week ?? 4, 1), 4);

/**
 * Coluna (0 = segunda ... 6 = domingo) de um episódio dentro da semana.
 * PLE em duas noites: a Noite 2 vai um dia depois.
 */
function episodeDayOffset(ep) {
  const night = ep.night && ep.night > 1 ? ep.night - 1 : 0;
  return Math.min(dayOffset(weekdayOf(ep.show)) + night, 6);
}

/**
 * @param {object} ep      { airDate, month, week, night, show?: { kind, weekday } }
 * @param {object} season  { number, startDate }
 */
function episodeDate(ep, season) {
  if (ep.airDate) return new Date(ep.airDate);
  const year = seasonYear(season) + (ep.month >= 5 ? 0 : 1);
  const day = (gameWeek(ep.week) - 1) * 7 + 1 + episodeDayOffset(ep);
  return new Date(Date.UTC(year, ep.month - 1, day));
}

// Número do dia no calendário do jogo (mês de 28 dias; dia 29 a 31 contam como 28).
function gameDay(date) {
  const d = new Date(date);
  return (
    (d.getUTCFullYear() * 12 + d.getUTCMonth()) * GAME_MONTH_DAYS +
    Math.min(d.getUTCDate(), GAME_MONTH_DAYS) -
    1
  );
}

// Dias de jogo entre duas datas (nunca negativo).
const gameDaysBetween = (start, end) =>
  Math.max(0, gameDay(end) - gameDay(start));

module.exports = {
  episodeDate,
  episodeDayOffset,
  gameDay,
  gameDaysBetween,
  gameWeek,
  seasonYear,
  BASE_YEAR,
};
