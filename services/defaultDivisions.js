// Divisões padrão do universe (função pura, sem banco).
//
// Por show (uma divisão para CADA brand que tem show): Main Card, Mid Card, Tag Team
// masculino, Lendas (M e F) e Outros.
// Compartilhadas (UMA divisão para TODOS os shows): Tag Team feminino e Managers.
// Um lutador pode estar em várias delas (ex.: Cena em Lendas do RAW, Lendas do SmackDown
// e Main Card do RAW).

// [nome, gênero (null = inter-gênero), chave do título na brand]
const PER_SHOW = [
  ['Main Card Masculino', 'M', 'mainM'],
  ['Main Card Feminino', 'W', 'mainW'],
  ['Mid Card Masculino', 'M', 'midM'],
  ['Mid Card Feminino', 'W', 'midW'],
  ['Tag Team Masculino', 'M', 'tagM'],
  ['Lendas Masculino', 'M', null],
  ['Lendas Feminino', 'W', null],
  ['Outros', null, null],
];

// [nome, gênero, nome do título]
const SHARED = [
  ['Tag Team Feminino', 'W', "Women's Tag Team Championship"],
  ['Managers', null, null],
];

// Título de cada divisão por brand (nomes do universe padrão); o usuário ajusta depois.
const TITLES_BY_BRAND = {
  RAW: {
    mainM: "Men's WWE Championship",
    mainW: "Women's World Championship",
    midM: "Men's Intercontinental Championship",
    midW: "Women's Intercontinental Championship",
    tagM: 'Tag Team Championship',
  },
  SmackDown: {
    mainM: "Men's World Championship",
    mainW: "Women's WWE Championship",
    midM: "Men's US Championship",
    midW: "Women's US Championship",
    tagM: 'World Tag Team Championship',
  },
};

/**
 * @param {object} p
 * @param {Array}  p.brands          [{ id, name, isActive }] brands que têm show
 * @param {object} p.titleIdByName   { 'Men\'s WWE Championship': id }
 * @param {Array}  p.existing        [{ name, brandIds: [] }] divisões já cadastradas
 * @returns {Array} [{ name, gender, titleId, brandIds, isActive, order }] só as que faltam
 */
function buildDefaultDivisions({ brands, titleIdByName, existing = [] }) {
  const rows = [];
  const has = (name, brandId) =>
    existing.some(
      (d) => d.name === name && (!brandId || d.brandIds.includes(brandId)),
    );

  for (const brand of brands) {
    const titles = TITLES_BY_BRAND[brand.name] ?? {};
    PER_SHOW.forEach(([name, gender, titleKey], i) => {
      if (has(name, brand.id)) return;
      rows.push({
        name,
        gender,
        titleId: (titleKey && titleIdByName[titles[titleKey]]) || null,
        brandIds: [brand.id],
        isActive: brand.isActive !== false,
        order: i,
      });
    });
  }

  if (brands.length) {
    SHARED.forEach(([name, gender, titleName], i) => {
      if (has(name)) return;
      rows.push({
        name,
        gender,
        titleId: (titleName && titleIdByName[titleName]) || null,
        brandIds: brands.map((b) => b.id),
        isActive: brands.some((b) => b.isActive !== false),
        order: PER_SHOW.length + i,
      });
    });
  }
  return rows;
}

module.exports = { buildDefaultDivisions, PER_SHOW, SHARED, TITLES_BY_BRAND };
