// Regras do ranking de uma divisão (Main Card, Mid Card...). Funções puras sobre
// uma lista ordenada de chaves ("w:<id>" lutador / "t:<id>" dupla): índice 0 = 1ª posição.

const wKey = (id) => `w:${id}`;
const tKey = (id) => `t:${id}`;
const entryKey = (e) => (e.wrestlerId ? wKey(e.wrestlerId) : tKey(e.teamId));

// O vencedor vira o próximo desafiante (1ª posição). Se não estava na lista, entra.
function moveToTop(list, key) {
  return [key, ...list.filter((k) => k !== key)];
}

// Subida de divisão: quem vence um adversário MELHOR colocado sobe UMA colocação
// (troca de lugar com quem está logo acima). Vencer quem está abaixo não muda nada.
function climb(list, winnerKey, opponentKeys) {
  const wi = list.indexOf(winnerKey);
  if (wi <= 0) return list; // fora da lista ou já é o 1º
  const beatSomeoneAbove = opponentKeys.some((k) => {
    const oi = list.indexOf(k);
    return oi !== -1 && oi < wi;
  });
  if (!beatSomeoneAbove) return list;
  const next = [...list];
  [next[wi - 1], next[wi]] = [next[wi], next[wi - 1]];
  return next;
}

/**
 * Descobre, para uma luta, a que "entrada" da divisão cada lado corresponde.
 * - entrada de lutador: casa se o lutador está no lado;
 * - entrada de dupla/facção: casa se algum integrante está no lado.
 *
 * @param {Array} entries      [{ wrestlerId, teamId, team?: { members: [{ wrestlerId }] } }]
 * @param {Array} participants [{ wrestlerId, side, isWinner }]
 * @returns {{ winnerSide: number|null, sides: Map<number, string|null> }}
 */
function mapSides(entries, participants) {
  const bySide = new Map();
  for (const p of participants) {
    if (!bySide.has(p.side)) bySide.set(p.side, []);
    bySide.get(p.side).push(p);
  }
  const winnerSides = [
    ...new Set(participants.filter((p) => p.isWinner).map((p) => p.side)),
  ];
  const sides = new Map();
  for (const [side, ps] of bySide) {
    const ids = new Set(ps.map((p) => p.wrestlerId));
    const entry = entries.find(
      (e) =>
        (e.wrestlerId && ids.has(e.wrestlerId)) ||
        (e.teamId &&
          (e.team?.members ?? []).some((m) => ids.has(m.wrestlerId))),
    );
    sides.set(side, entry ? entryKey(entry) : null);
  }
  return {
    winnerSide: winnerSides.length === 1 ? winnerSides[0] : null,
    sides,
  };
}

/**
 * Aplica o resultado de uma luta à lista da divisão.
 * @returns {{ list: string[], changed: boolean, add?: {wrestlerId} }}
 */
function applyStakes({ stakes, list, entries, participants }) {
  const { winnerSide, sides } = mapSides(entries, participants);
  if (winnerSide === null) return { list, changed: false };
  const winnerKey = sides.get(winnerSide);
  const opponents = [...sides.entries()]
    .filter(([s, k]) => s !== winnerSide && k)
    .map(([, k]) => k);

  let next = list;
  if (stakes === 'CONTENDER') {
    if (winnerKey) {
      next = moveToTop(list, winnerKey);
    } else {
      // vencedor fora da divisão: só entra se for um único lutador
      const winners = participants.filter((p) => p.side === winnerSide);
      if (winners.length !== 1) return { list, changed: false };
      next = moveToTop(list, wKey(winners[0].wrestlerId));
    }
  } else if (stakes === 'RANKING' && winnerKey) {
    next = climb(list, winnerKey, opponents);
  }
  return {
    list: next,
    changed: next.some((k, i) => k !== list[i]) || next.length !== list.length,
  };
}

/**
 * Troca de campeão: os novos campeões saem da fila (passam a ficar acima dela) e os
 * ex-campeões entram no MEIO da fila.
 * @param {string[]} list      fila atual
 * @param {string[]} incoming  chaves dos novos campeões
 * @param {string[]} outgoing  chaves dos ex-campeões
 */
function applyTitleChange({ list, incoming, outgoing }) {
  const next = list.filter((k) => !incoming.includes(k));
  const toAdd = [...new Set(outgoing)].filter(
    (k) => !incoming.includes(k) && !next.includes(k),
  );
  next.splice(Math.floor(next.length / 2), 0, ...toAdd);
  return next;
}

module.exports = {
  applyTitleChange,
  wKey,
  tKey,
  entryKey,
  moveToTop,
  climb,
  mapSides,
  applyStakes,
};
