const {
  moveToTop,
  climb,
  applyStakes,
  wKey,
} = require('../services/divisionRanking');

const wrestlers = (...ids) =>
  ids.map((id) => ({ wrestlerId: id, teamId: null }));
const p = (wrestlerId, side, isWinner = false) => ({
  wrestlerId,
  side,
  isWinner,
});

describe('moveToTop / climb', () => {
  it('o vencedor da luta de desafiante vai para a 1ª posição', () => {
    expect(moveToTop(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'a', 'b', 'd']);
  });

  it('4º x 5º valendo subida: se o 5º vence, troca com o 4º', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    expect(climb(list, 'e', ['d'])).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('se o 4º vence, mantém as posições', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    expect(climb(list, 'd', ['e'])).toEqual(list);
  });

  it('vencer alguém bem acima sobe só UMA colocação', () => {
    expect(climb(['a', 'b', 'c', 'd', 'e'], 'e', ['a'])).toEqual([
      'a',
      'b',
      'c',
      'e',
      'd',
    ]);
  });

  it('1º colocado ou fora da lista não muda nada', () => {
    const list = ['a', 'b'];
    expect(climb(list, 'a', ['b'])).toEqual(list);
    expect(climb(list, 'z', ['a'])).toEqual(list);
  });
});

describe('applyStakes', () => {
  const entries = wrestlers('a', 'b', 'c', 'd', 'e');
  const list = entries.map((e) => wKey(e.wrestlerId));

  it('RANKING: 5º vence o 4º e sobe', () => {
    const r = applyStakes({
      stakes: 'RANKING',
      list,
      entries,
      participants: [p('d', 1), p('e', 2, true)],
    });
    expect(r.list).toEqual(['w:a', 'w:b', 'w:c', 'w:e', 'w:d']);
    expect(r.changed).toBe(true);
  });

  it('RANKING: sem vencedor definido não altera', () => {
    const r = applyStakes({
      stakes: 'RANKING',
      list,
      entries,
      participants: [p('d', 1), p('e', 2)],
    });
    expect(r.changed).toBe(false);
  });

  it('CONTENDER: vencedor vai ao topo, mesmo triple threat', () => {
    const r = applyStakes({
      stakes: 'CONTENDER',
      list,
      entries,
      participants: [p('b', 1), p('d', 2, true), p('e', 3)],
    });
    expect(r.list[0]).toBe('w:d');
    expect(r.list).toHaveLength(5);
  });

  it('CONTENDER: vencedor fora da divisão entra no topo', () => {
    const r = applyStakes({
      stakes: 'CONTENDER',
      list,
      entries,
      participants: [p('b', 1), p('novo', 2, true)],
    });
    expect(r.list[0]).toBe('w:novo');
    expect(r.list).toHaveLength(6);
  });

  it('divisão de duplas: casa o lado pelos integrantes da dupla', () => {
    const teams = [
      {
        wrestlerId: null,
        teamId: 'T1',
        team: { members: [{ wrestlerId: 'x' }, { wrestlerId: 'y' }] },
      },
      {
        wrestlerId: null,
        teamId: 'T2',
        team: { members: [{ wrestlerId: 'm' }, { wrestlerId: 'n' }] },
      },
      {
        wrestlerId: null,
        teamId: 'T3',
        team: { members: [{ wrestlerId: 'q' }, { wrestlerId: 'r' }] },
      },
    ];
    const r = applyStakes({
      stakes: 'CONTENDER',
      list: ['t:T1', 't:T2', 't:T3'],
      entries: teams,
      participants: [p('x', 1), p('y', 1), p('q', 2, true), p('r', 2, true)],
    });
    expect(r.list).toEqual(['t:T3', 't:T1', 't:T2']);
  });
});

describe('applyTitleChange', () => {
  const { applyTitleChange } = require('../services/divisionRanking');

  it('novo campeão sai da fila e o ex-campeão entra no meio', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f'];
    const r = applyTitleChange({ list, incoming: ['c'], outgoing: ['x'] });
    // sem o 'c' sobram 5; meio = índice 2
    expect(r).toEqual(['a', 'b', 'x', 'd', 'e', 'f']);
  });

  it('fila vazia: o ex-campeão vira o único', () => {
    expect(
      applyTitleChange({ list: [], incoming: [], outgoing: ['x'] }),
    ).toEqual(['x']);
  });

  it('não duplica quem já está na fila e ignora o novo campeão como ex-campeão', () => {
    const r = applyTitleChange({
      list: ['a', 'x', 'b'],
      incoming: [],
      outgoing: ['x', 'x'],
    });
    expect(r).toEqual(['a', 'x', 'b']);
    expect(
      applyTitleChange({ list: ['a'], incoming: ['y'], outgoing: ['y'] }),
    ).toEqual(['a']);
  });

  it('primeiro reinado (sem ex-campeão) só tira o campeão da fila', () => {
    expect(
      applyTitleChange({
        list: ['a', 'b', 'c'],
        incoming: ['b'],
        outgoing: [],
      }),
    ).toEqual(['a', 'c']);
  });
});
