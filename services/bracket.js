const HttpError = require('../utils/httpError');

const isPowerOfTwo = (n) => n >= 2 && (n & (n - 1)) === 0;

// Quantas lutas tem a rodada 1. `size` é o nº de vagas: potência de 2 => lutas de
// 2 (size/2 lutas); senão, lutas de 3 a 8 competidores (ex.: size 6 = 2 triple
// threats; size 8 também pode ser 2 fatal 4-ways se houver 8 inscritos em 2 lutas).
function firstRoundSlots(size) {
  if (isPowerOfTwo(size)) return size / 2;
  for (let per = 3; per <= 8; per++) {
    if (size % per === 0 && (size / per === 1 || isPowerOfTwo(size / per))) {
      return size / per;
    }
  }
  throw new HttpError(
    400,
    'Tamanho inválido: use potência de 2 (2, 4, 8...) ou um múltiplo de lutas de 3+ (ex.: 6 = duas lutas triple threat + final)',
  );
}

const isPow2 = (n) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;

// Nº de lutas da rodada 1: o campo firstRoundMatches do torneio ou, se vazio,
// deduzido de `size` (potência de 2 => lutas de 2; senão lutas de 3 a 8).
function firstRoundMatchesOf(t) {
  if (t.firstRoundMatches) {
    if (!isPow2(t.firstRoundMatches)) {
      throw new HttpError(
        400,
        'Lutas da 1ª rodada deve ser potência de 2 (1, 2, 4, 8...)',
      );
    }
    return t.firstRoundMatches;
  }
  return firstRoundSlots(t.size);
}

const totalRounds = (t) => Math.round(Math.log2(firstRoundMatchesOf(t))) + 1;

const bitReverse = (n, bits) => {
  let r = 0;
  for (let i = 0; i < bits; i++) r |= ((n >> i) & 1) << (bits - 1 - i);
  return r;
};

// Chave de eliminatória simples. A árvore completa tem `matches` lutas na rodada 1,
// metade na 2... Quem entra numa rodada posterior (startRound > 1) ocupa um lado de
// luta dessa rodada e a luta que o alimentaria (com tudo que a alimentaria) sai da chave.
function singleEliminationRows(tournamentId, t, entrants = []) {
  const matches = firstRoundMatchesOf(t);
  const rounds = Math.round(Math.log2(matches)) + 1;
  const slotsIn = (r) => matches / 2 ** (r - 1);
  const gone = new Set(); // "rodada:slot" removidos
  const dropTree = (r, s) => {
    gone.add(`${r}:${s}`);
    if (r > 1) {
      dropTree(r - 1, 2 * s - 1);
      dropTree(r - 1, 2 * s);
    }
  };
  const sideOf = new Map(); // "rodada:slot:A|B" -> entrantId

  const early = entrants.filter((e) => (e.startRound ?? 1) > 1);
  for (const e of early) {
    if (e.startRound > rounds) {
      throw new HttpError(
        400,
        `Há inscrito começando na rodada ${e.startRound}, mas a chave só tem ${rounds} rodadas`,
      );
    }
  }
  // das rodadas finais para as iniciais, espalhando os lados (topo/base)
  for (let r = rounds; r >= 2; r--) {
    const list = early.filter((e) => e.startRound === r);
    if (!list.length) continue;
    const total = slotsIn(r) * 2;
    const bits = Math.round(Math.log2(total));
    const free = [];
    for (let i = 0; i < total; i++) {
      const idx = bitReverse(i, bits);
      const slot = (idx >> 1) + 1;
      const side = idx & 1 ? 'B' : 'A';
      if (!gone.has(`${r}:${slot}`) && !sideOf.has(`${r}:${slot}:${side}`)) {
        free.push({ slot, side });
      }
    }
    if (list.length > free.length) {
      throw new HttpError(400, `Inscritos demais começando na rodada ${r}`);
    }
    list.forEach((e, i) => {
      const { slot, side } = free[i];
      sideOf.set(`${r}:${slot}:${side}`, e.id);
      dropTree(r - 1, side === 'A' ? 2 * slot - 1 : 2 * slot);
    });
  }

  const rows = [];
  for (let r = 1; r <= rounds; r++) {
    for (let slot = 1; slot <= slotsIn(r); slot++) {
      if (gone.has(`${r}:${slot}`)) continue;
      rows.push({
        tournamentId,
        round: r,
        slot,
        entrantAId: sideOf.get(`${r}:${slot}:A`) ?? null,
        entrantBId: sideOf.get(`${r}:${slot}:B`) ?? null,
      });
    }
  }

  // rodada 1: quem começa nela, em blocos por luta (2 = singles, 3 = triple threat...)
  const first = rows.filter((x) => x.round === 1);
  const starters = entrants
    .filter((e) => (e.startRound ?? 1) === 1)
    .map((e) => e.id);
  if (starters.length && !first.length) {
    throw new HttpError(
      400,
      'Todas as lutas da 1ª rodada foram substituídas por inscritos que entram depois',
    );
  }
  const per = Math.max(
    t.firstRoundPerMatch ?? 2,
    first.length ? Math.ceil(starters.length / first.length) : 2,
  );
  if (per > 8) {
    throw new HttpError(400, 'Há mais participantes do que o torneio comporta');
  }
  first.forEach((m, i) => {
    const group = starters.slice(i * per, i * per + per);
    m.entrantAId = group[0] ?? null;
    m.entrantBId = group[1] ?? null;
    if (group.length > 2) m.extraEntrantIds = group.slice(2);
  });
  return rows;
}

// Todos contra todos entre os participantes.
function roundRobinRows(tournamentId, entrantIds) {
  const rows = [];
  let slot = 1;
  for (let i = 0; i < entrantIds.length; i++) {
    for (let j = i + 1; j < entrantIds.length; j++) {
      rows.push({
        tournamentId,
        round: 1,
        slot: slot++,
        entrantAId: entrantIds[i],
        entrantBId: entrantIds[j],
      });
    }
  }
  return rows;
}

module.exports = {
  singleEliminationRows,
  roundRobinRows,
  isPowerOfTwo,
  firstRoundSlots,
  firstRoundMatchesOf,
  totalRounds,
};
