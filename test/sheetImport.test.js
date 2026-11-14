process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://u:p@localhost/db';
const { Resolver, norm } = require('../services/sheetImport/text');
const { parseWorkbook } = require('../services/sheetImport/parse');
const { buildPlan } = require('../services/sheetImport/plan');

describe('Resolver (nomes com erro de digitação)', () => {
  const r = new Resolver([
    { id: '1', name: 'Becky Lynch' },
    { id: '2', name: 'Liv Morgan' },
    { id: '3', name: 'Raquel Rodriguez' },
    { id: '4', name: 'Bravo Americano' },
    { id: '5', name: 'Jade Cargill' },
  ]);

  it('exato ignora caixa, acento e pontuação', () => {
    expect(r.resolve('becky LYNCH').how).toBe('exact');
    expect(norm('The Usos')).toBe(norm('usos'));
  });
  it('erro de digitação vira fuzzy', () => {
    expect(r.resolve('Becky Linch')).toMatchObject({
      how: 'fuzzy',
      item: { id: '1' },
    });
    expect(r.resolve('Jade Cargil').item.id).toBe('5');
  });
  it('não confunde nomes diferentes (1ª letra e distância)', () => {
    expect(r.resolve('Rayo Americano')).toBeNull();
    expect(r.resolve('Seth Rollins')).toBeNull();
  });
  it('nome curto só vale com allowShort e se for único', () => {
    expect(r.resolve('Raquel')).toBeNull();
    expect(r.resolve('Raquel', { allowShort: true })).toMatchObject({
      how: 'short',
      item: { id: '3' },
    });
    expect(r.resolve('Liv', { allowShort: true }).item.id).toBe('2');
  });
});

// células como o read-excel-file entrega: linhas de arrays, com vazios nulos
const sheets = [
  {
    sheet: 'Roster completo',
    data: [
      [],
      [null, 'RAW', 'RAW Tag teams', null, 'Drafts e shakeups'],
      [null, 'Cody Rhodes', 'The Usos'],
      [null, 'Becky Linch'],
      [null, 'Novo Cara'],
    ],
  },
  {
    sheet: 'raw',
    data: [
      [],
      [
        null,
        'Main Card',
        'Tags',
        'WOMENS WORLD',
        'Legends',
        'Others',
        null,
        'Title',
      ],
      [null, 'Cody Rhodes', 'The Usos', 'Becky Lynch', 'Edge', 'Paul Heyman'],
      [null, 'Novo Cara', 'Dupla Nova', null, null, null],
    ],
  },
  {
    sheet: 'PLEs',
    data: [
      ['SEMANA DO MES', 'PPV'],
      ['May - 4', 'Bad Blood'],
      ['Agust - 4', 'Summerslam'],
      ['Mar - 2', 'Saturday Night Main Event'],
      ['May - 2', 'Saturday Night Main Event'],
    ],
  },
  { sheet: 'Shows', data: [['x']] },
];

const snapshot = {
  brands: [
    { id: 'b-raw', name: 'RAW', isActive: true },
    { id: 'b-sd', name: 'SmackDown', isActive: true },
  ],
  wrestlers: [
    {
      id: 'w1',
      name: 'Cody Rhodes',
      gender: 'M',
      isActive: true,
      brandIds: ['b-raw'],
    },
    {
      id: 'w2',
      name: 'Becky Lynch',
      gender: 'W',
      isActive: false,
      brandIds: [],
    },
    {
      id: 'w3',
      name: 'Quem Saiu',
      gender: 'M',
      isActive: true,
      brandIds: ['b-raw'],
    },
  ],
  teams: [{ id: 't1', name: 'The Usos', memberIds: [] }],
  shows: [
    {
      id: 's1',
      name: 'Bad Blood',
      kind: 'PLE',
      ppvMonth: 9,
      ppvWeek: null,
      isActive: true,
    },
    {
      id: 's2',
      name: 'SummerSlam',
      kind: 'PLE',
      ppvMonth: 7,
      ppvWeek: null,
      isActive: true,
    },
    {
      id: 's3',
      name: "Saturday Night's Main Event",
      kind: 'SPECIAL',
      ppvMonth: 1,
      ppvWeek: null,
      isActive: true,
    },
    {
      id: 's4',
      name: 'Crown Jewel',
      kind: 'PLE',
      ppvMonth: 10,
      ppvWeek: null,
      isActive: true,
    },
    {
      id: 's5',
      name: 'RAW',
      kind: 'WEEKLY',
      ppvMonth: null,
      ppvWeek: null,
      isActive: true,
    },
  ],
};

describe('parseWorkbook', () => {
  const parsed = parseWorkbook(sheets);
  it('lê rosters, colunas de divisão e PLEs; ignora o resto', () => {
    expect(parsed.roster.RAW.wrestlers).toEqual([
      'Cody Rhodes',
      'Becky Linch',
      'Novo Cara',
    ]);
    expect(parsed.roster['RAW'].teams).toEqual(['The Usos']);
    expect(parsed.brandSheets[0].sheet).toBe('raw');
    expect(parsed.brandSheets[0].columns.map((c) => c.key)).toEqual([
      'mainM',
      'tagM',
      'mainW',
      'legends',
      'others',
    ]);
    expect(parsed.brandSheets[0].columns[0].names).toEqual([
      'Cody Rhodes',
      'Novo Cara',
    ]);
    expect(parsed.ples).toEqual([
      { month: 5, week: 4, name: 'Bad Blood' },
      { month: 8, week: 4, name: 'Summerslam' }, // "Agust" também vale
      { month: 3, week: 2, name: 'Saturday Night Main Event' },
      { month: 5, week: 2, name: 'Saturday Night Main Event' },
    ]);
    expect(parsed.ignored).toEqual(['Shows']);
  });
});

describe('buildPlan', () => {
  const plan = buildPlan(parseWorkbook(sheets), snapshot, {});
  const { ops, report } = plan;

  it('roster da brand: adiciona o que falta e remove quem não está na planilha', () => {
    expect(ops.links.add.map((l) => l.wrestlerId)).toContain('w2'); // Becky Linch -> Becky Lynch
    expect(ops.links.remove).toEqual([{ wrestlerId: 'w3', brandId: 'b-raw' }]);
    expect(report.fuzzy).toContainEqual({
      from: 'Becky Linch',
      to: 'Becky Lynch',
    });
  });

  it('cria só o que não existe, com gênero e contrato deduzidos', () => {
    const names = report.newWrestlers.map((w) => w.name).sort();
    expect(names).toEqual(['Edge', 'Novo Cara', 'Paul Heyman']);
    expect(
      report.newWrestlers.find((w) => w.name === 'Edge').contractType,
    ).toBe('LEGEND');
    expect(
      report.newWrestlers.find((w) => w.name === 'Paul Heyman').contractType,
    ).toBe('MANAGER');
    expect(report.newTeams.map((t) => t.name)).toEqual(['Dupla Nova']);
  });

  it('ativa quem estava inativo e preenche as divisões na ordem da planilha', () => {
    expect(ops.activate).toEqual(['w2']);
    const main = ops.divisions.find((d) => d.name === 'Main Card Masculino');
    expect(main.keys[0]).toBe('w:w1');
    expect(main.keys).toHaveLength(2);
    expect(
      ops.divisions.find((d) => d.name === 'Tag Team Masculino').keys[0],
    ).toBe('t:t1');
    expect(
      ops.divisions.find((d) => d.name === 'Main Card Feminino').keys,
    ).toEqual(['w:w2']);
    expect(
      ops.divisions.find((d) => d.name === 'Lendas Masculino').keys,
    ).toHaveLength(1);
  });

  it('PLEs: ajusta mês/semana dos existentes, cria o que falta e separa o mesmo PLE em dois meses', () => {
    expect(ops.ples.update.map((u) => [u.id, u.to])).toEqual([
      ['s1', { month: 5, week: 4 }],
      ['s2', { month: 8, week: 4 }],
      ['s3', { month: 3, week: 2 }],
    ]);
    expect(ops.ples.create).toEqual([
      {
        name: "Saturday Night's Main Event (maio)",
        kind: 'SPECIAL',
        ppvMonth: 5,
        ppvWeek: 2,
      },
    ]);
    expect(ops.ples.unlisted.map((s) => s.name)).toEqual(['Crown Jewel']);
  });

  it('opções: sem criar faltantes, sem trocar roster e sem divisões', () => {
    const p = buildPlan(parseWorkbook(sheets), snapshot, {
      createMissing: false,
      replaceRosters: false,
      importDivisions: false,
      importPles: false,
    });
    expect(p.ops.newWrestlers).toHaveLength(0);
    expect(p.ops.links.remove).toHaveLength(0);
    expect(p.ops.divisions).toHaveLength(0);
    expect(p.ops.ples.update).toHaveLength(0);
    expect(p.report.skippedMissing).toContain('Novo Cara');
  });
});
