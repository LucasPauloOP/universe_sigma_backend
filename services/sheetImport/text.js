// Comparação de nomes tolerante a erros de digitação ("Becky Linch" = "Becky Lynch").

// Sem acento, caixa, pontuação nem "The" inicial: "The Usos" = "Usos".
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^the/, '');

// Texto de célula limpo: espaços repetidos viram um só.
const clean = (v) =>
  v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();

function levenshtein(a, b, max = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Quantos erros de digitação aceitamos, conforme o tamanho do nome.
const tolerance = (len) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

/**
 * Procura um nome numa lista de itens { id, name, ... }.
 *   exact: mesmo nome (ignorando acento/caixa/pontuação);
 *   fuzzy: erro de digitação, desde que haja UM único candidato mais próximo;
 *   short: nome curto ("Raquel") que só combina com UM item pelo primeiro/último nome
 *          (só quando allowShort).
 * Devolve { item, how } ou null (inexistente ou ambíguo).
 */
class Resolver {
  constructor(items = []) {
    this.items = [];
    this.byNorm = new Map();
    items.forEach((i) => this.add(i));
  }

  add(item) {
    const key = norm(item.name);
    if (!key) return item;
    this.items.push({ ...item, _n: key, _tokens: tokens(item.name) });
    if (!this.byNorm.has(key)) this.byNorm.set(key, item);
    return item;
  }

  resolve(name, { allowShort = false } = {}) {
    const key = norm(name);
    if (!key) return null;
    const exact = this.byNorm.get(key);
    if (exact) return { item: exact, how: 'exact' };

    const tol = tolerance(key.length);
    if (tol > 0) {
      let best = null;
      let bestD = tol + 1;
      let tie = false;
      for (const it of this.items) {
        // erro de digitação raramente muda a 1ª letra ("Rayo" não é "Bravo")
        if (it._n[0] !== key[0]) continue;
        const d = levenshtein(key, it._n, tol);
        if (d > tol) continue;
        if (d < bestD) {
          best = it;
          bestD = d;
          tie = false;
        } else if (d === bestD && it.id !== best?.id) tie = true;
      }
      if (best && !tie) return { item: best, how: 'fuzzy' };
      if (tie) return null; // ambíguo
    }

    if (allowShort && !/\s/.test(clean(name))) {
      const t = norm(name);
      const hits = this.items.filter((it) => it._tokens.some((x) => x === t));
      const ids = new Set(hits.map((h) => h.id));
      if (ids.size === 1) return { item: hits[0], how: 'short' };
    }
    return null;
  }
}

const tokens = (name) => clean(name).split(' ').map(norm).filter(Boolean);

module.exports = { norm, clean, levenshtein, Resolver };
