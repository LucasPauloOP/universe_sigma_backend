// Uma luta só pode ser marcada como REALIZADA com o resultado informado:
//  - vencedor (ou lado vencedor, em lutas de duplas/times) E como terminou; ou
//  - empate (sem vencedor).
// Promos e outros segmentos não têm resultado.

/**
 * @param {object} s { type, isDone, isDraw, finishType, participants: [{ side, isWinner }] }
 * @returns {string|null} mensagem do problema, ou null se está tudo certo
 */
function resultProblem(s) {
  if (!s.isDone || s.type !== 'MATCH') return null;
  const participants = s.participants ?? [];
  if (!participants.length) {
    return 'Para marcar a luta como realizada, informe os participantes';
  }
  const winners = participants.filter((p) => p.isWinner);
  if (s.isDraw) {
    return winners.length ? 'Uma luta empatada não pode ter vencedor' : null;
  }
  if (!winners.length) {
    return 'Para marcar a luta como realizada, informe o vencedor (ou o lado vencedor) ou marque empate';
  }
  if (new Set(winners.map((p) => p.side)).size > 1) {
    return 'Os vencedores precisam ser do mesmo lado';
  }
  if (!s.finishType) {
    return 'Para marcar a luta como realizada, informe como ela terminou';
  }
  return null;
}

module.exports = { resultProblem };
