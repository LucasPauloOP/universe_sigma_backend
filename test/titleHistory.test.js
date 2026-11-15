process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://u:p@localhost/db';
const history = require('../services/defaultTitleHistory.json');
const {
  norm,
  titlesWithCurrentChampion,
} = require('../services/titleHistoryService');
const { TITLES } = require('../services/defaultUniverse');

describe('tabela de histórico de reinados', () => {
  it('cobre os 11 títulos do universe padrão (nomes batem)', () => {
    const names = new Set(TITLES.map((t) => t[0]));
    expect(history).toHaveLength(11);
    history.forEach((h) => expect(names.has(h.title)).toBe(true));
  });

  it('todo título tem exatamente um campeão atual', () => {
    for (const h of history) {
      expect(h.entries.filter((e) => e.current)).toHaveLength(1);
    }
    expect(titlesWithCurrentChampion().size).toBe(11);
  });

  it('totais são válidos e títulos de duplas têm duplas', () => {
    for (const h of history) {
      for (const e of h.entries) {
        expect(e.reigns).toBeGreaterThanOrEqual(1);
        expect(e.days).toBeGreaterThanOrEqual(0);
        expect(e.name).not.toMatch(/Atual|Atuais/);
      }
    }
    expect(history.filter((h) => h.isTag).map((h) => h.title)).toEqual([
      'World Tag Team Championship',
      'Tag Team Championship',
      "Women's Tag Team Championship",
    ]);
  });

  it('nomes de duplas sem nome de time guardam os integrantes', () => {
    const wtag = history.find((h) => h.title === 'World Tag Team Championship');
    const penta = wtag.entries.find((e) => e.current);
    expect(penta.members).toEqual(['Penta', "Je'Von Evans"]);
  });

  it('norm ignora acento, pontuação, caixa e "The"', () => {
    expect(norm('The Usos')).toBe(norm('usos'));
    expect(norm("Je'Von Evans")).toBe(norm('JeVon  Evans'));
  });
});
