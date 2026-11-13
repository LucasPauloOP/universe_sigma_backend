process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://u:p@localhost/db';
const { buildDefaultDivisions } = require('../services/defaultDivisions');
const { resultProblem } = require('../services/segmentResult');

const brands = [
  { id: 'raw', name: 'RAW', isActive: true },
  { id: 'sd', name: 'SmackDown', isActive: true },
  { id: 'nxt', name: 'NXT', isActive: true },
  { id: 'aaa', name: 'AAA', isActive: false },
];
const titleIdByName = {
  "Men's WWE Championship": 't-wwe',
  "Women's World Championship": 't-ww',
  "Women's Tag Team Championship": 't-wtag',
};

describe('divisões padrão', () => {
  const rows = buildDefaultDivisions({ brands, titleIdByName });
  const byName = (name) => rows.filter((r) => r.name === name);

  it('Main Card, Mid Card, Lendas, Tag masculino e Outros: uma por show', () => {
    for (const name of [
      'Main Card Masculino',
      'Main Card Feminino',
      'Mid Card Masculino',
      'Mid Card Feminino',
      'Tag Team Masculino',
      'Lendas Masculino',
      'Lendas Feminino',
      'Outros',
    ]) {
      expect(byName(name)).toHaveLength(4);
      byName(name).forEach((r) => expect(r.brandIds).toHaveLength(1));
    }
  });

  it('Tag Team feminino e Managers: UMA divisão para todos os shows', () => {
    for (const name of ['Tag Team Feminino', 'Managers']) {
      expect(byName(name)).toHaveLength(1);
      expect(byName(name)[0].brandIds.sort()).toEqual([
        'aaa',
        'nxt',
        'raw',
        'sd',
      ]);
    }
  });

  it('gênero: masculino, feminino e inter-gênero (Outros, Managers)', () => {
    expect(byName('Main Card Masculino')[0].gender).toBe('M');
    expect(byName('Main Card Feminino')[0].gender).toBe('W');
    expect(byName('Tag Team Feminino')[0].gender).toBe('W');
    expect(byName('Outros')[0].gender).toBeNull();
    expect(byName('Managers')[0].gender).toBeNull();
  });

  it('liga o título quando existe e deixa vazio quando não', () => {
    const rawMain = byName('Main Card Masculino').find(
      (r) => r.brandIds[0] === 'raw',
    );
    expect(rawMain.titleId).toBe('t-wwe');
    expect(
      byName('Main Card Masculino').find((r) => r.brandIds[0] === 'nxt')
        .titleId,
    ).toBeNull();
    expect(byName('Tag Team Feminino')[0].titleId).toBe('t-wtag');
  });

  it('divisões de brand desativada nascem desativadas', () => {
    expect(byName('Outros').find((r) => r.brandIds[0] === 'aaa').isActive).toBe(
      false,
    );
    expect(byName('Outros').find((r) => r.brandIds[0] === 'raw').isActive).toBe(
      true,
    );
  });

  it('é idempotente: não recria o que já existe', () => {
    const existing = [
      { name: 'Main Card Masculino', brandIds: ['raw'] },
      { name: 'Managers', brandIds: ['raw', 'sd'] },
    ];
    const again = buildDefaultDivisions({ brands, titleIdByName, existing });
    expect(again.some((r) => r.name === 'Managers')).toBe(false);
    expect(again.filter((r) => r.name === 'Main Card Masculino')).toHaveLength(
      3,
    );
    expect(buildDefaultDivisions({ brands: [], titleIdByName })).toEqual([]);
  });
});

describe('resultProblem: luta realizada exige resultado', () => {
  const win = (side) => ({ side, isWinner: true });
  const lose = (side) => ({ side, isWinner: false });
  const base = {
    type: 'MATCH',
    isDone: true,
    isDraw: false,
    finishType: 'PINFALL',
  };

  it('não exige nada se não está realizada, nem para promo', () => {
    expect(
      resultProblem({ ...base, isDone: false, participants: [] }),
    ).toBeNull();
    expect(
      resultProblem({ ...base, type: 'PROMO', participants: [] }),
    ).toBeNull();
  });

  it('vencedor + como terminou: ok; sem vencedor ou sem finalização: erro', () => {
    expect(
      resultProblem({ ...base, participants: [win(1), lose(2)] }),
    ).toBeNull();
    expect(
      resultProblem({ ...base, participants: [lose(1), lose(2)] }),
    ).toMatch(/vencedor/);
    expect(
      resultProblem({
        ...base,
        finishType: null,
        participants: [win(1), lose(2)],
      }),
    ).toMatch(/como ela terminou/);
  });

  it('luta de times: o lado vencedor inteiro, e só um lado', () => {
    expect(
      resultProblem({
        ...base,
        participants: [win(1), win(1), lose(2), lose(2)],
      }),
    ).toBeNull();
    expect(resultProblem({ ...base, participants: [win(1), win(2)] })).toMatch(
      /mesmo lado/,
    );
  });

  it('empate: sem vencedor e sem exigir a finalização', () => {
    expect(
      resultProblem({
        ...base,
        isDraw: true,
        finishType: null,
        participants: [lose(1), lose(2)],
      }),
    ).toBeNull();
    expect(
      resultProblem({ ...base, isDraw: true, participants: [win(1), lose(2)] }),
    ).toMatch(/empatada/);
  });

  it('sem participantes não dá para marcar como realizada', () => {
    expect(resultProblem({ ...base, participants: [] })).toMatch(
      /participantes/,
    );
  });
});
