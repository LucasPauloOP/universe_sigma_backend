// Monta o PLANO da importação: o que seria criado/alterado no universe, sem gravar nada.
// Recebe a planilha já lida (parse.js) e uma foto do que existe hoje no banco.
const { randomUUID } = require('crypto');
const { norm, clean, Resolver } = require('./text');

const DEFAULT_OPTIONS = {
  createMissing: true, // cria lutadores/duplas que a planilha cita e o universe não tem
  replaceRosters: true, // o roster da brand passa a ser exatamente o da planilha
  activateWrestlers: true, // quem está nos rosters da planilha fica ativo no universe
  deactivateOthers: false, // desativa quem não está em nenhum roster da planilha
  importDivisions: true, // preenche a fila (colocações) das divisões
  importPles: true, // cadastra/ajusta os PLEs da aba PLEs
  deactivateUnlistedPles: false, // desativa (e apaga os episódios dos) PLEs que não estão na aba
};

// Divisão do universe a partir da coluna da planilha.
const DIVISION_OF = {
  mainM: { name: 'Main Card Masculino' },
  midM: { name: 'Mid Card Masculino' },
  tagM: { name: 'Tag Team Masculino', teams: true },
  mainW: { name: 'Main Card Feminino' },
  midW: { name: 'Mid Card Feminino' },
  tagW: { name: 'Tag Team Feminino', teams: true, shared: true },
  others: { name: 'Outros' },
  // legends: Lendas Masculino/Feminino conforme o gênero de cada lutador
};

// Grafias corretas dos PLEs (a planilha tem erros de digitação).
const PLE_NAMES = [
  'Royal Rumble',
  'Elimination Chamber',
  'WrestleMania',
  'Backlash',
  'Clash in Italy',
  'Clash in Paris',
  'Night of Champions',
  'SummerSlam',
  'Money in the Bank',
  'Bad Blood',
  'Crown Jewel',
  'Survivor Series',
  'King and Queen of the Ring',
  'TLC',
  "Saturday Night's Main Event",
  "NXT New Year's Evil",
];

const MONTH_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const keyW = (id) => `w:${id}`;
const keyT = (id) => `t:${id}`;

/**
 * @param {object} parsed    saída de parseWorkbook
 * @param {object} snapshot  { brands, wrestlers: [{id,name,gender,isActive,brandIds}],
 *                             teams: [{id,name,memberIds}], shows }
 * @param {object} options
 */
function buildPlan(parsed, snapshot, userOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  const warnings = [];
  const fuzzy = []; // correções de digitação feitas ("Becky Linch" -> "Becky Lynch")
  const ignored = [...parsed.ignored];
  const assumedMale = new Set();
  const skippedMissing = new Set();

  const brandRes = new Resolver(snapshot.brands);
  const wrestlerRes = new Resolver(snapshot.wrestlers);
  const teamRes = new Resolver(snapshot.teams);
  const genderOf = new Map(snapshot.wrestlers.map((w) => [w.id, w.gender]));
  const knownTeams = snapshot.teams.map((t) => ({ ...t }));
  const newWrestlers = new Map();
  const newTeams = new Map();

  // ---- pistas para os lutadores novos: gênero e tipo de contrato ----
  const women = new Set();
  const inLegends = new Set();
  const inOthers = new Set();
  const inElse = new Set();
  const splitTeam = (n) => clean(n).split('&').map(clean).filter(Boolean);
  for (const s of parsed.brandSheets) {
    for (const col of s.columns) {
      for (const n of col.names) {
        if (col.key === 'mainW' || col.key === 'midW') women.add(norm(n));
        else if (col.key === 'tagW')
          splitTeam(n).forEach((m) => women.add(norm(m)));
        if (col.key === 'legends') inLegends.add(norm(n));
        else if (col.key === 'others') inOthers.add(norm(n));
        else inElse.add(norm(n));
      }
    }
  }
  Object.values(parsed.roster).forEach((r) =>
    r.wrestlers.forEach((n) => inElse.add(norm(n))),
  );

  const noteFuzzy = (from, r) => {
    if (r.how !== 'exact' && norm(from) !== norm(r.item.name)) {
      fuzzy.push({ from: clean(from), to: r.item.name });
    }
  };

  function wrestlerFor(rawName, { short = false } = {}) {
    const name = clean(rawName);
    if (!name) return null;
    const r = wrestlerRes.resolve(name, { allowShort: short });
    if (r) {
      noteFuzzy(name, r);
      return r.item.id;
    }
    if (!options.createMissing) {
      skippedMissing.add(name);
      return null;
    }
    const gender = women.has(norm(name)) ? 'W' : 'M';
    if (gender === 'M' && !women.has(norm(name))) assumedMale.add(name);
    const onlyOthers =
      inOthers.has(norm(name)) &&
      !inElse.has(norm(name)) &&
      !inLegends.has(norm(name));
    const w = {
      id: randomUUID(),
      name,
      gender,
      contractType: inLegends.has(norm(name))
        ? 'LEGEND'
        : onlyOthers
          ? 'MANAGER'
          : 'FULL_TIME',
    };
    newWrestlers.set(w.id, w);
    wrestlerRes.add({ id: w.id, name });
    genderOf.set(w.id, gender);
    return w.id;
  }

  function teamFor(rawName) {
    const name = clean(rawName);
    if (!name) return null;
    const exact = teamRes.resolve(name);
    if (exact && (exact.how === 'exact' || !name.includes('&'))) {
      noteFuzzy(name, exact);
      return exact.item.id;
    }
    if (name.includes('&')) {
      const ids = splitTeam(name).map((m) => wrestlerFor(m, { short: true }));
      if (ids.some((i) => !i)) {
        warnings.push(`Dupla "${name}": integrante não encontrado, ignorada`);
        return null;
      }
      const want = new Set(ids);
      const same = knownTeams.find(
        (t) =>
          t.memberIds.length === want.size &&
          t.memberIds.every((m) => want.has(m)),
      );
      if (same) return same.id;
      return createTeam(name, ids);
    }
    if (!options.createMissing) {
      skippedMissing.add(name);
      return null;
    }
    warnings.push(
      `Dupla "${name}" criada sem integrantes (cadastre-os depois)`,
    );
    return createTeam(name, []);
  }

  function createTeam(name, memberIds) {
    if (!options.createMissing) {
      skippedMissing.add(name);
      return null;
    }
    const t = { id: randomUUID(), name, memberIds };
    newTeams.set(t.id, t);
    knownTeams.push(t);
    teamRes.add({ id: t.id, name });
    return t.id;
  }

  // ---- rosters (aba "Roster completo") e duplas ----
  const desired = new Map(); // brandId -> Set(wrestlerId)
  const authoritative = new Set(); // brands cujo roster veio da aba "Roster completo"
  const brandsInSheet = new Map(); // brandId -> brand
  const want = (brand) => {
    brandsInSheet.set(brand.id, brand);
    if (!desired.has(brand.id)) desired.set(brand.id, new Set());
    return desired.get(brand.id);
  };

  for (const [key, list] of Object.entries(parsed.roster)) {
    const found = brandRes.resolve(key);
    if (!found) {
      ignored.push(`"${key}" (Roster completo)`);
      continue;
    }
    const set = want(found.item);
    list.teams.forEach((n) => teamFor(n));
    const ids = list.wrestlers.map((n) => wrestlerFor(n)).filter(Boolean);
    ids.forEach((id) => set.add(id));
    if (list.wrestlers.length) authoritative.add(found.item.id);
  }

  // ---- divisões (abas de cada brand) ----
  const divisionLists = new Map(); // "brandId|nome" ou "*|nome" -> { name, brandId, shared, keys[] }
  const addToDivision = (spec, brandId, keys) => {
    const id = spec.shared ? `*|${spec.name}` : `${brandId}|${spec.name}`;
    if (!divisionLists.has(id)) {
      divisionLists.set(id, {
        name: spec.name,
        brandId: spec.shared ? null : brandId,
        shared: !!spec.shared,
        keys: [],
      });
    }
    const d = divisionLists.get(id);
    for (const k of keys) if (!d.keys.includes(k)) d.keys.push(k);
  };

  for (const s of parsed.brandSheets) {
    const found = brandRes.resolve(s.sheet);
    if (!found) {
      warnings.push(
        `Aba "${s.sheet}": nenhuma brand do universe com esse nome — ignorada`,
      );
      continue;
    }
    const brand = found.item;
    const set = want(brand);
    for (const col of s.columns) {
      if (col.key === 'legends') {
        const m = [];
        const f = [];
        for (const n of col.names) {
          const id = wrestlerFor(n);
          if (!id) continue;
          set.add(id);
          (genderOf.get(id) === 'W' ? f : m).push(keyW(id));
        }
        if (options.importDivisions) {
          addToDivision({ name: 'Lendas Masculino' }, brand.id, m);
          addToDivision({ name: 'Lendas Feminino' }, brand.id, f);
        }
        continue;
      }
      const spec = DIVISION_OF[col.key];
      if (!spec) continue;
      const keys = [];
      for (const n of col.names) {
        if (spec.teams) {
          const id = teamFor(n);
          if (id) keys.push(keyT(id));
        } else {
          const id = wrestlerFor(n);
          if (id) {
            set.add(id);
            keys.push(keyW(id));
          }
        }
      }
      if (options.importDivisions) addToDivision(spec, brand.id, keys);
    }
  }

  // ---- vínculos com as brands ----
  const links = { add: [], remove: [] };
  const brandSummary = [];
  for (const [brandId, set] of desired) {
    const brand = brandsInSheet.get(brandId);
    const current = new Set(
      snapshot.wrestlers
        .filter((w) => w.brandIds.includes(brandId))
        .map((w) => w.id),
    );
    const add = [...set].filter((id) => !current.has(id));
    const remove =
      options.replaceRosters && authoritative.has(brandId)
        ? [...current].filter((id) => !set.has(id))
        : [];
    add.forEach((wrestlerId) => links.add.push({ wrestlerId, brandId }));
    remove.forEach((wrestlerId) => links.remove.push({ wrestlerId, brandId }));
    brandSummary.push({
      brand: brand.name,
      isActive: brand.isActive !== false,
      roster: set.size,
      add: add.length,
      remove: remove.length,
      divisions: [...divisionLists.values()]
        .filter((d) => d.shared || d.brandId === brandId)
        .map((d) => ({
          name: d.name + (d.shared ? ' (compartilhada)' : ''),
          count: d.keys.length,
        })),
    });
  }

  // ---- ativar / desativar ----
  const allDesired = new Set([...desired.values()].flatMap((s) => [...s]));
  const activate = options.activateWrestlers
    ? snapshot.wrestlers
        .filter((w) => allDesired.has(w.id) && !w.isActive)
        .map((w) => w.id)
    : [];
  const sheetBrandIds = new Set(brandsInSheet.keys());
  const deactivate = options.deactivateOthers
    ? snapshot.wrestlers
        .filter(
          (w) =>
            w.isActive &&
            !allDesired.has(w.id) &&
            w.brandIds.every((b) => sheetBrandIds.has(b)),
        )
        .map((w) => w.id)
    : [];

  // ---- PLEs ----
  const ples = { create: [], update: [], unlisted: [] };
  if (options.importPles && parsed.ples.length) {
    const pleShows = snapshot.shows.filter((s) => s.kind !== 'WEEKLY');
    const showRes = new Resolver(
      pleShows.map((s) => ({ id: s.id, name: s.name })),
    );
    const byId = new Map(pleShows.map((s) => [s.id, s]));
    const canon = new Resolver(PLE_NAMES.map((n) => ({ id: n, name: n })));
    const used = new Set();

    for (const row of parsed.ples) {
      const name = clean(row.name);
      let r = showRes.resolve(name);
      let target = r?.item;
      if (target && used.has(target.id)) {
        // o mesmo PLE aparece de novo em outro mês (ex.: Saturday Night's Main Event): vira outro show
        const alt = `${target.name} (${MONTH_PT[row.month - 1]})`;
        r = showRes.resolve(alt);
        target = r?.item && !used.has(r.item.id) ? r.item : null;
        if (!target) {
          ples.create.push(newPle(alt, row));
          const id = `new:${alt}`;
          showRes.add({ id, name: alt });
          used.add(id);
          continue;
        }
      }
      if (target) {
        used.add(target.id);
        const cur = byId.get(target.id);
        if (cur && (cur.ppvMonth !== row.month || cur.ppvWeek !== row.week)) {
          ples.update.push({
            id: target.id,
            name: target.name,
            from: { month: cur.ppvMonth, week: cur.ppvWeek },
            to: { month: row.month, week: row.week },
          });
        }
        continue;
      }
      const spelled = canon.resolve(name)?.item.name ?? name;
      ples.create.push(newPle(spelled, row));
      const id = `new:${spelled}`;
      showRes.add({ id, name: spelled });
      used.add(id);
    }
    ples.unlisted = pleShows
      .filter((s) => s.isActive && !used.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }));
  }

  const divisions = [...divisionLists.values()].filter(
    (d) => d.keys.length || true,
  );

  return {
    options,
    ops: {
      newWrestlers: [...newWrestlers.values()],
      newTeams: [...newTeams.values()],
      links,
      activate,
      deactivate,
      divisions: options.importDivisions ? divisions : [],
      ples,
    },
    report: {
      brands: brandSummary,
      newWrestlers: [...newWrestlers.values()].map((w) => ({
        name: w.name,
        gender: w.gender,
        contractType: w.contractType,
      })),
      newTeams: [...newTeams.values()].map((t) => ({
        name: t.name,
        members: t.memberIds
          .map((id) => wrestlerRes.items.find((i) => i.id === id)?.name)
          .filter(Boolean),
      })),
      activate: activate.length,
      deactivate: deactivate.length,
      ples,
      fuzzy: dedupe(fuzzy),
      assumedMale: [...assumedMale].filter(
        (n) =>
          newWrestlers.size &&
          [...newWrestlers.values()].some((w) => w.name === n),
      ),
      skippedMissing: [...skippedMissing],
      ignored,
      warnings,
    },
  };
}

function newPle(name, row) {
  return {
    name,
    kind: /saturday\s*night|snme/i.test(name) ? 'SPECIAL' : 'PLE',
    ppvMonth: row.month,
    ppvWeek: row.week,
  };
}

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((x) => {
    const k = `${x.from}>${x.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

module.exports = { buildPlan, DEFAULT_OPTIONS, DIVISION_OF, PLE_NAMES };
