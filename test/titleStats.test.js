const { buildTitleStats } = require('../services/titleStats');

const d = (s) => new Date(`${s}T00:00:00.000Z`);
const cena = {
  wrestlerId: 'w1',
  teamId: null,
  wrestler: { name: 'John Cena' },
};
const titles = [{ id: 't1', name: 'WWE Championship' }];

describe('buildTitleStats', () => {
  it('soma o histórico anterior com os reinados do universe (16 -> 17)', () => {
    const { titles: out } = buildTitleStats({
      asOf: d('2026-03-01'),
      titles,
      baselines: [
        { titleId: 't1', ...cena, reigns: 16, days: 1254, note: null },
      ],
      reigns: [
        {
          id: 'r1',
          titleId: 't1',
          startDate: d('2026-01-01'),
          endDate: null,
          holders: [cena],
        },
      ],
    });
    const h = out[0].holders[0];
    expect(h.reigns).toBe(17);
    expect(h.universeReigns).toBe(1);
    expect(h.days).toBe(1254 + 56); // dias de jogo: jan + fev = 2 meses x 28
    expect(h.isCurrent).toBe(true);
    expect(h.reignList[0].days).toBe(56);
    expect(h.longestDays).toBe(56);
  });

  it('reinado fechado conta só até o fim; título sem ninguém some', () => {
    const { titles: out } = buildTitleStats({
      asOf: d('2026-12-31'),
      titles: [...titles, { id: 't2', name: 'Vazio' }],
      baselines: [],
      reigns: [
        {
          id: 'r1',
          titleId: 't1',
          startDate: d('2026-01-01'),
          endDate: d('2026-01-11'),
          holders: [cena],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].holders[0].days).toBe(10);
    expect(out[0].holders[0].isCurrent).toBe(false);
  });

  it('cada integrante de uma dupla recebe o reinado; ordena por dias', () => {
    const a = { wrestlerId: 'a', teamId: null, wrestler: { name: 'A' } };
    const b = { wrestlerId: 'b', teamId: null, wrestler: { name: 'B' } };
    const { titles: out } = buildTitleStats({
      asOf: d('2026-02-01'),
      titles,
      baselines: [{ titleId: 't1', ...b, reigns: 2, days: 500, note: null }],
      reigns: [
        {
          id: 'r',
          titleId: 't1',
          startDate: d('2026-01-01'),
          endDate: null,
          holders: [a, b],
        },
      ],
    });
    expect(out[0].holders.map((h) => h.name)).toEqual(['B', 'A']);
    expect(out[0].holders[0].reigns).toBe(3);
    expect(out[0].holders[1].reigns).toBe(1);
  });
});
