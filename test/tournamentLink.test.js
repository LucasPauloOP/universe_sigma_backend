process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://u:p@localhost/db';
const {
  participantsFor,
  roundTitle,
  winnerEntrantId,
  wrestlersOf,
} = require('../services/tournamentLink');

const single = (id, wrestlerId) => ({ id, wrestlerId, team: null });
const team = (id, ...ids) => ({
  id,
  wrestlerId: null,
  team: { members: ids.map((wrestlerId) => ({ wrestlerId })) },
});

describe('roundTitle', () => {
  const t8 = { format: 'SINGLE_ELIMINATION', size: 8 };
  it('torneio de 8: quartas, semifinal e final', () => {
    expect(roundTitle(t8, { round: 1 })).toBe('Quartas de final');
    expect(roundTitle(t8, { round: 2 })).toBe('Semifinal');
    expect(roundTitle(t8, { round: 3 })).toBe('Final');
  });
  it('torneio de 16 começa na Rodada 1; round-robin usa o grupo', () => {
    expect(
      roundTitle({ format: 'SINGLE_ELIMINATION', size: 16 }, { round: 1 }),
    ).toBe('Rodada 1');
    expect(
      roundTitle(
        { format: 'ROUND_ROBIN', size: 8 },
        { round: 1, groupName: 'Grupo A' },
      ),
    ).toBe('Grupo A');
  });
});

describe('participantes da luta do torneio', () => {
  it('individual: lado 1 = A, lado 2 = B', () => {
    const m = { entrantA: single('a', 'w1'), entrantB: single('b', 'w2') };
    expect(participantsFor(m)).toEqual([
      { wrestlerId: 'w1', side: 1, isWinner: false },
      { wrestlerId: 'w2', side: 2, isWinner: false },
    ]);
  });
  it('dupla: todos os integrantes; vaga ainda vazia gera só um lado', () => {
    expect(wrestlersOf(team('t', 'x', 'y'))).toEqual(['x', 'y']);
    expect(
      participantsFor({ entrantA: single('a', 'w1'), entrantB: null }),
    ).toHaveLength(1);
  });
});

describe('winnerEntrantId', () => {
  const m = {
    entrantAId: 'a',
    entrantBId: 'b',
    entrantA: single('a', 'w1'),
    entrantB: team('b', 'x', 'y'),
  };
  it('descobre o inscrito vencedor pelos lutadores', () => {
    expect(
      winnerEntrantId(m, [
        { wrestlerId: 'w1', isWinner: true },
        { wrestlerId: 'x', isWinner: false },
      ]),
    ).toBe('a');
    expect(
      winnerEntrantId(m, [
        { wrestlerId: 'x', isWinner: true },
        { wrestlerId: 'y', isWinner: true },
      ]),
    ).toBe('b');
  });
  it('sem vencedor ou ambíguo: nenhum', () => {
    expect(
      winnerEntrantId(m, [{ wrestlerId: 'w1', isWinner: false }]),
    ).toBeNull();
    expect(
      winnerEntrantId(m, [
        { wrestlerId: 'w1', isWinner: true },
        { wrestlerId: 'x', isWinner: true },
      ]),
    ).toBeNull();
  });
});

describe('luta de torneio com 3 ou mais competidores', () => {
  const {
    competitors,
    suggestedTypeName,
  } = require('../services/tournamentLink');
  const triple = {
    entrantAId: 'a',
    entrantBId: 'b',
    entrantA: single('a', 'w1'),
    entrantB: single('b', 'w2'),
    extras: [{ entrant: single('c', 'w3') }],
  };

  it('cada competidor é um lado: A=1, B=2, adicionais=3...', () => {
    expect(participantsFor(triple).map((p) => [p.wrestlerId, p.side])).toEqual([
      ['w1', 1],
      ['w2', 2],
      ['w3', 3],
    ]);
    expect(competitors(triple)).toHaveLength(3);
  });

  it('sugere o tipo pelo número de competidores', () => {
    expect(suggestedTypeName(triple)).toBe('Triple Threat');
    expect(
      suggestedTypeName({
        ...triple,
        extras: [...triple.extras, { entrant: single('d', 'w4') }],
      }),
    ).toBe('Fatal 4-Way');
    expect(suggestedTypeName({ ...triple, extras: [] })).toBe('Singles');
    expect(
      suggestedTypeName({
        entrantA: team('t1', 'x', 'y'),
        entrantB: team('t2', 'm', 'n'),
        extras: [],
      }),
    ).toBe('Tag Team');
  });

  it('só um vence: o vencedor do triple threat é identificado entre os 3', () => {
    const win = (wrestlerId) =>
      [
        { wrestlerId: 'w1', isWinner: false },
        { wrestlerId: 'w2', isWinner: false },
        { wrestlerId: 'w3', isWinner: false },
      ].map((p) =>
        p.wrestlerId === wrestlerId ? { ...p, isWinner: true } : p,
      );
    expect(winnerEntrantId(triple, win('w3'))).toBe('c');
    expect(winnerEntrantId(triple, win('w1'))).toBe('a');
  });
});
