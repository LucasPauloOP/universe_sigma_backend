const {
  unitMatches,
  recognize,
  buildSides,
  sidesName,
  winnerSideOf,
} = require('../services/rivalryService');

const w = (id, side = 1) => ({ wrestlerId: id, teamId: null, side });
const tag = (id, members, side = 1, kind = 'TAG_TEAM') => ({
  wrestlerId: null,
  teamId: id,
  side,
  team: { kind, members: members.map((wrestlerId) => ({ wrestlerId })) },
});

describe('unitMatches', () => {
  it('lutador: está escalado', () => {
    expect(unitMatches(w('a'), new Set(['a']))).toBe(true);
    expect(unitMatches(w('a'), new Set(['b']))).toBe(false);
  });
  it('dupla: todos os integrantes; facção: um basta', () => {
    expect(unitMatches(tag('t', ['a', 'b']), new Set(['a', 'b']))).toBe(true);
    expect(unitMatches(tag('t', ['a', 'b']), new Set(['a']))).toBe(false);
    const f = tag('f', ['a', 'b', 'c'], 1, 'FACTION');
    expect(unitMatches(f, new Set(['c']))).toBe(true);
    expect(unitMatches(f, new Set(['x']))).toBe(false);
  });
  it('time sem integrantes nunca casa', () => {
    expect(unitMatches(tag('t', []), new Set(['a']))).toBe(false);
  });
});

describe('recognize', () => {
  const riv = (members, isActive = true) => ({ isActive, members });
  it('reconhece com envolvidos dos dois lados escalados', () => {
    const r = riv([w('a', 1), w('b', 2)]);
    expect(recognize([r], ['a', 'b'])).toEqual([r]);
  });
  it('não reconhece com um lado só, nem rivalidade encerrada', () => {
    expect(recognize([riv([w('a', 1), w('b', 2)])], ['a'])).toEqual([]);
    expect(recognize([riv([w('a', 1), w('b', 2)], false)], ['a', 'b'])).toEqual(
      [],
    );
  });
  it('dupla x lutador: reconhece quando a dupla inteira e o lutador estão', () => {
    const r = riv([tag('t', ['a', 'b'], 1), w('c', 2)]);
    expect(recognize([r], ['a', 'b', 'c'])).toEqual([r]);
    expect(recognize([r], ['a', 'c'])).toEqual([]);
  });
  it('rivalidade antiga (um lado só) pede ao menos dois envolvidos', () => {
    const r = riv([w('a'), w('b'), w('c')]);
    expect(recognize([r], ['a', 'b'])).toEqual([r]);
    expect(recognize([r], ['a'])).toEqual([]);
  });
  it('um lutador pode estar em várias rivalidades', () => {
    const r1 = riv([w('a', 1), w('b', 2)]);
    const r2 = riv([w('a', 1), w('c', 2)]);
    expect(recognize([r1, r2], ['a', 'b', 'c'])).toHaveLength(2);
    expect(recognize([r1, r2], ['a', 'b'])).toEqual([r1]);
  });
});

describe('buildSides', () => {
  const names = { a: 'Cena', b: 'Orton', c: 'Jey', d: 'Jimmy', e: 'Solo' };
  const nameOf = (id) => names[id];
  const usos = {
    id: 't1',
    name: 'Usos',
    members: [{ wrestlerId: 'c' }, { wrestlerId: 'd' }],
  };

  it('singles: um lutador por lado', () => {
    const s = buildSides(
      [
        { wrestlerId: 'a', side: 1 },
        { wrestlerId: 'b', side: 2 },
      ],
      [],
      nameOf,
    );
    expect(sidesName(s)).toBe('Cena vs Orton');
    expect(s.map((x) => x.side)).toEqual([1, 2]);
  });
  it('lado que é uma dupla cadastrada vira um envolvido só (o time)', () => {
    const s = buildSides(
      [
        { wrestlerId: 'a', side: 1 },
        { wrestlerId: 'c', side: 2 },
        { wrestlerId: 'd', side: 2 },
      ],
      [usos],
      nameOf,
    );
    expect(s[1].units).toEqual([{ teamId: 't1', name: 'Usos' }]);
    expect(sidesName(s)).toBe('Cena vs Usos');
  });
  it('dupla incompleta entra como lutadores', () => {
    const s = buildSides(
      [
        { wrestlerId: 'a', side: 1 },
        { wrestlerId: 'c', side: 2 },
      ],
      [usos],
      nameOf,
    );
    expect(s[1].units).toEqual([{ wrestlerId: 'c', name: 'Jey' }]);
  });
  it('renumera os lados em sequência e aceita 3 lados', () => {
    const s = buildSides(
      [
        { wrestlerId: 'a', side: 2 },
        { wrestlerId: 'b', side: 5 },
        { wrestlerId: 'e', side: 9 },
      ],
      [],
      nameOf,
    );
    expect(s.map((x) => x.side)).toEqual([1, 2, 3]);
    expect(sidesName(s)).toBe('Cena vs Orton vs Solo');
  });
});

describe('winnerSideOf', () => {
  const members = [w('a', 1), tag('t', ['c', 'd'], 2)];
  it('lado do lutador vencedor', () => {
    const p = [
      { wrestlerId: 'a', side: 1, isWinner: true },
      { wrestlerId: 'c', side: 2, isWinner: false },
      { wrestlerId: 'd', side: 2, isWinner: false },
    ];
    expect(winnerSideOf(members, p)).toBe(1);
  });
  it('dupla vencedora (todos os integrantes) ganha o lado dela', () => {
    const p = [
      { wrestlerId: 'a', side: 1, isWinner: false },
      { wrestlerId: 'c', side: 2, isWinner: true },
      { wrestlerId: 'd', side: 2, isWinner: true },
    ];
    expect(winnerSideOf(members, p)).toBe(2);
  });
  it('sem vencedor marcado: null', () => {
    expect(
      winnerSideOf(members, [{ wrestlerId: 'a', side: 1, isWinner: false }]),
    ).toBeNull();
  });
});
