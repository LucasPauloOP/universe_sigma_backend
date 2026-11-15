process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://u:p@localhost/db';
const { winnerHolders } = require('../services/reignService');

const p = (wrestlerId, side, isWinner = false) => ({
  wrestlerId,
  side,
  isWinner,
});

describe('winnerHolders', () => {
  it('individual: só o vencedor', () => {
    expect(winnerHolders([p('a', 1), p('b', 2, true)])).toEqual(['b']);
  });

  it('tag: todo o lado vencedor, mesmo com só um marcado', () => {
    expect(
      winnerHolders([p('a', 1), p('b', 1), p('c', 2, true), p('d', 2)]),
    ).toEqual(['c', 'd']);
  });

  it('sem vencedor ou com vencedores em lados diferentes: ninguém', () => {
    expect(winnerHolders([p('a', 1), p('b', 2)])).toEqual([]);
    expect(winnerHolders([p('a', 1, true), p('b', 2, true)])).toEqual([]);
  });
});
