const HttpError = require('../utils/httpError');

const isPowerOfTwo = (n) => n >= 2 && (n & (n - 1)) === 0;

// Chave de eliminatória simples: size/2 lutas na rodada 1, depois metade...
function singleEliminationRows(tournamentId, size) {
  if (!isPowerOfTwo(size)) {
    throw new HttpError(
      400,
      'Eliminatória exige tamanho potência de 2 (2, 4, 8, 16...)',
    );
  }
  const rows = [];
  for (let round = 1, slots = size / 2; slots >= 1; round++, slots /= 2) {
    for (let slot = 1; slot <= slots; slot++) {
      rows.push({ tournamentId, round, slot });
    }
  }
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

// Ocupa a rodada 1 com os participantes na ordem do seed.
function seedFirstRound(rows, entrantIds) {
  const first = rows
    .filter((r) => r.round === 1)
    .sort((a, b) => a.slot - b.slot);
  first.forEach((m, i) => {
    m.entrantAId = entrantIds[i * 2] ?? null;
    m.entrantBId = entrantIds[i * 2 + 1] ?? null;
  });
  return rows;
}

module.exports = {
  singleEliminationRows,
  roundRobinRows,
  seedFirstRound,
  isPowerOfTwo,
};
