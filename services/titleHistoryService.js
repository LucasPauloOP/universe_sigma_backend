// Histórico de reinados "de antes do universe", vindo da tabela estatisticas_por_titulo_wwe
// (services/defaultTitleHistory.json): por título, quantas vezes cada lutador/dupla foi
// campeão e quantos dias somou. Vira registros de TitleBaseline (ver stats de reinados).
const { randomUUID } = require('crypto');
const prisma = require('../config/database');
const history = require('./defaultTitleHistory.json');
const { BASE_YEAR } = require('./timeline');

// Nome sem acento, caixa, pontuação nem "The" inicial: "The Usos" = "Usos".
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^the/, '');

/** Títulos do universe padrão que têm um campeão atual na tabela (o reinado vem de lá). */
const titlesWithCurrentChampion = () =>
  new Set(
    history.filter((h) => h.entries.some((e) => e.current)).map((h) => h.title),
  );

/**
 * Cadastra o histórico de reinados. Idempotente: não mexe em quem já tem histórico
 * cadastrado nesse título (não sobrescreve ajustes seus).
 *
 * @param {object} opts
 * @param {boolean} opts.setCurrentChampions cria o reinado em aberto do campeão atual da
 *   tabela (usado ao criar/restaurar o universe; no universe existente, não mexe nos reinados)
 * @returns {{ created, skipped, wrestlersCreated, teamsCreated, championsSet }}
 */
async function seedTitleHistory(
  universeId,
  client = prisma,
  { setCurrentChampions = false } = {},
) {
  const [titles, wrestlers, teams, reigns, baselines] = await Promise.all([
    client.title.findMany({ where: { universeId } }),
    client.wrestler.findMany({
      where: { universeId },
      select: { id: true, name: true },
    }),
    client.team.findMany({
      where: { universeId },
      select: { id: true, name: true },
    }),
    client.titleReign.findMany({
      where: { title: { universeId }, endDate: null },
      include: { holders: true },
    }),
    client.titleBaseline.findMany({ where: { title: { universeId } } }),
  ]);

  const titleByName = new Map(titles.map((t) => [t.name, t]));
  const wrestlerBy = new Map(wrestlers.map((w) => [norm(w.name), w]));
  const teamBy = new Map(teams.map((t) => [norm(t.name), t]));
  const stats = {
    created: 0,
    skipped: 0,
    wrestlersCreated: 0,
    teamsCreated: 0,
    championsSet: 0,
  };

  // Tudo é montado em memória e gravado em LOTE no fim (poucas consultas): o seed roda
  // dentro de uma transação com tempo limite, e cada ida ao banco custa.
  const newWrestlers = [];
  const newTeams = [];
  const newMembers = [];
  const newReigns = [];
  const newHolders = [];
  const newBaselines = [];

  // Lutador que não está no elenco (lendas): entra inativo, só para guardar o histórico.
  const ensureWrestler = (name, gender) => {
    const found = wrestlerBy.get(norm(name));
    if (found) return found;
    const w = {
      id: randomUUID(),
      universeId,
      name,
      gender,
      contractType: 'LEGEND',
      isActive: false,
      notes: 'Criado a partir do histórico de títulos',
    };
    newWrestlers.push(w);
    wrestlerBy.set(norm(name), w);
    return w;
  };

  const ensureTeam = (entry, gender) => {
    const found = teamBy.get(norm(entry.name));
    if (found) return found;
    const t = {
      id: randomUUID(),
      universeId,
      name: entry.name,
      kind: 'TAG_TEAM',
    };
    newTeams.push(t);
    teamBy.set(norm(entry.name), t);
    for (const m of entry.members ?? []) {
      newMembers.push({
        teamId: t.id,
        wrestlerId: ensureWrestler(m, gender).id,
      });
    }
    return t;
  };

  const holdsOpen = new Map(); // titleId -> Set de chaves dos campeões em aberto
  for (const r of reigns) {
    holdsOpen.set(
      r.titleId,
      new Set(
        r.holders.map((x) =>
          x.wrestlerId ? `w:${x.wrestlerId}` : `t:${x.teamId}`,
        ),
      ),
    );
  }
  const seen = new Set(
    baselines.map(
      (b) =>
        `${b.titleId}:${b.wrestlerId ? `w:${b.wrestlerId}` : `t:${b.teamId}`}`,
    ),
  );

  for (const h of history) {
    const title = titleByName.get(h.title);
    if (!title) continue; // título renomeado/removido: pula
    const gender = title.gender ?? 'M';

    for (const e of h.entries) {
      const wrestler = h.isTag ? null : ensureWrestler(e.name, gender);
      const team = h.isTag ? ensureTeam(e, gender) : null;
      const holder = wrestler
        ? { wrestlerId: wrestler.id }
        : { teamId: team.id };
      const key = wrestler ? `w:${wrestler.id}` : `t:${team.id}`;

      // campeão atual da tabela vira o reinado em aberto (só se o título ainda não tem um)
      if (e.current && setCurrentChampions && !holdsOpen.has(title.id)) {
        const reignId = randomUUID();
        newReigns.push({
          id: reignId,
          titleId: title.id,
          startDate: new Date(Date.UTC(BASE_YEAR, 4, 1)),
        });
        newHolders.push({ id: randomUUID(), reignId, ...holder });
        holdsOpen.set(title.id, new Set([key]));
        stats.championsSet++;
      }

      if (seen.has(`${title.id}:${key}`)) {
        stats.skipped++;
        continue;
      }
      seen.add(`${title.id}:${key}`);

      // Os totais da tabela já incluem o reinado atual: ele é contado pelo reinado em aberto
      // do universe, então sai do histórico (senão contaria duas vezes).
      const holdsNow = holdsOpen.get(title.id)?.has(key) ?? false;
      newBaselines.push({
        id: randomUUID(),
        titleId: title.id,
        ...holder,
        reigns: Math.max(0, e.reigns - (holdsNow ? 1 : 0)),
        days: e.days,
      });
      stats.created++;
    }
  }

  stats.wrestlersCreated = newWrestlers.length;
  stats.teamsCreated = newTeams.length;
  const bulk = (model, data) =>
    data.length ? client[model].createMany({ data }) : null;
  await bulk('wrestler', newWrestlers);
  await bulk('team', newTeams);
  await bulk('teamMember', newMembers);
  await bulk('titleReign', newReigns);
  await bulk('reignHolder', newHolders);
  await bulk('titleBaseline', newBaselines);
  return stats;
}

module.exports = { seedTitleHistory, titlesWithCurrentChampion, norm };
