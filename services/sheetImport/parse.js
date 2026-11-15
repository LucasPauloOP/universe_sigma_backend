// Lê a planilha do universe (abas "Roster completo", uma aba por brand com as colunas de
// divisão, e "PLEs") para uma estrutura simples. Não toca no banco.
//
// Entrada: o que o read-excel-file devolve: [{ sheet, data: [[célula, ...], ...] }].
const { norm, clean } = require('./text');

// Cabeçalhos das colunas de divisão (aba de cada brand) -> chave da divisão.
const DIVISION_HEADERS = {
  maincard: 'mainM',
  midcard: 'midM',
  tags: 'tagM',
  tag: 'tagM',
  womensworld: 'mainW',
  womensmid: 'midW',
  womenstag: 'tagW',
  womenstags: 'tagW',
  legends: 'legends',
  others: 'others',
};

const MONTHS = {
  jan: 1,
  feb: 2,
  fev: 2,
  mar: 3,
  apr: 4,
  abr: 4,
  may: 5,
  mai: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  agu: 8,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  out: 10,
  nov: 11,
  dec: 12,
  dez: 12,
};

const cellText = (row, i) => clean(row?.[i]);

// Coluna inteira abaixo do cabeçalho (ignora células vazias), parando na coluna seguinte.
function columnValues(data, headerRow, col) {
  const out = [];
  for (let r = headerRow + 1; r < data.length; r++) {
    const v = cellText(data[r], col);
    if (v) out.push(v);
  }
  return out;
}

// Primeira linha (nas 6 primeiras) com pelo menos `min` células de texto.
function findHeaderRow(data, test, min = 2) {
  for (let r = 0; r < Math.min(data.length, 6); r++) {
    const hits = (data[r] ?? []).filter((c) => c != null && test(clean(c)));
    if (hits.length >= min) return r;
  }
  return -1;
}

/**
 * "Roster completo": cabeçalhos como "SmackDown (Roster completo)", "SmackDown Tag teams",
 * "RAW", "RAW Tag teams". Devolve { brandName: { wrestlers: [], teams: [] } }.
 */
function parseRosterSheet(data) {
  const out = {};
  const headerRow = findHeaderRow(data, (t) => t.length > 0, 2);
  if (headerRow < 0) return out;
  (data[headerRow] ?? []).forEach((h, col) => {
    const header = clean(h);
    if (!header) return;
    const isTeams = /tag\s*teams?$/i.test(header);
    const brand = header
      .replace(/\(.*?\)/g, '')
      .replace(/tag\s*teams?$/i, '')
      .trim();
    if (!brand) return;
    out[brand] ??= { wrestlers: [], teams: [] };
    out[brand][isTeams ? 'teams' : 'wrestlers'].push(
      ...columnValues(data, headerRow, col),
    );
  });
  return out;
}

/**
 * Aba de uma brand: colunas Main Card, Mid Card, Tags, WOMENS WORLD... em ordem de
 * colocação. Devolve [{ key, header, names }] ou null se a aba não tem essas colunas.
 */
function parseBrandSheet(data) {
  const headerRow = findHeaderRow(data, (t) => norm(t) in DIVISION_HEADERS, 3);
  if (headerRow < 0) return null;
  const columns = [];
  (data[headerRow] ?? []).forEach((h, col) => {
    const key = DIVISION_HEADERS[norm(clean(h))];
    if (!key) return;
    columns.push({
      key,
      header: clean(h),
      names: columnValues(data, headerRow, col),
    });
  });
  return columns;
}

const monthOf = (text) => MONTHS[norm(text).slice(0, 3)] ?? null;

/** Aba "PLEs": "May - 2" | "Bad Blood" -> { month: 5, week: 2, name }. */
function parsePlesSheet(data) {
  const out = [];
  for (const row of data) {
    const when = cellText(row, 0);
    const name = cellText(row, 1);
    const m = when.match(/^([A-Za-zÀ-ÿ]+)\s*[-–]\s*(\d)/);
    if (!m || !name) continue;
    const month = monthOf(m[1]);
    if (!month) continue;
    out.push({ month, week: Math.min(Number(m[2]), 4), name });
  }
  return out;
}

/**
 * @param {Array} sheets [{ sheet, data }]
 * @returns {{ roster, brandSheets, ples, ignored }}
 */
function parseWorkbook(sheets) {
  const result = { roster: {}, brandSheets: [], ples: [], ignored: [] };
  for (const { sheet, data } of sheets) {
    const key = norm(sheet);
    if (key === 'rostercompleto') {
      result.roster = parseRosterSheet(data);
    } else if (key === 'ples' || key === 'ple') {
      result.ples = parsePlesSheet(data);
    } else {
      const columns = parseBrandSheet(data);
      if (columns?.length)
        result.brandSheets.push({ sheet: clean(sheet), columns });
      else result.ignored.push(clean(sheet));
    }
  }
  return result;
}

module.exports = {
  parseWorkbook,
  parseRosterSheet,
  parseBrandSheet,
  parsePlesSheet,
  DIVISION_HEADERS,
  monthOf,
};
