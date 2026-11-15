// Estatísticas de reinados: junta o histórico anterior ao universe (TitleBaseline,
// só totais) com os reinados datados do universe. Função pura, sem banco.

const { gameDaysBetween } = require('./timeline');

// Dias de jogo (mês = 4 semanas = 28 dias).
const dayCount = gameDaysBetween;

/**
 * @param {object} p
 * @param {Date} p.asOf  data "de hoje" no universe (reinados em aberto contam até aqui)
 * @param {Array} p.titles    [{ id, name, ... }]
 * @param {Array} p.reigns    [{ id, titleId, startDate, endDate, holders: [{ wrestlerId, teamId, wrestler, team }] }]
 * @param {Array} p.baselines [{ titleId, wrestlerId, teamId, reigns, days, note, wrestler, team }]
 */
function buildTitleStats({ asOf, titles, reigns, baselines }) {
  const byTitle = new Map(
    titles.map((t) => [t.id, { title: t, holders: new Map() }]),
  );

  const holderOf = (entry, ref) => {
    const key = ref.wrestlerId ? `w:${ref.wrestlerId}` : `t:${ref.teamId}`;
    let h = entry.holders.get(key);
    if (!h) {
      h = {
        key,
        wrestlerId: ref.wrestlerId ?? null,
        teamId: ref.teamId ?? null,
        name: ref.wrestler?.name ?? ref.team?.name ?? '(removido)',
        imageUrl: ref.wrestler?.imageUrl ?? ref.team?.imageUrl ?? null,
        baselineReigns: 0,
        baselineDays: 0,
        baselineNote: null,
        reignList: [],
      };
      entry.holders.set(key, h);
    }
    return h;
  };

  for (const b of baselines) {
    const entry = byTitle.get(b.titleId);
    if (!entry || (!b.wrestlerId && !b.teamId)) continue;
    const h = holderOf(entry, b);
    h.baselineReigns += b.reigns;
    h.baselineDays += b.days;
    h.baselineNote = b.note ?? h.baselineNote;
  }

  for (const r of reigns) {
    const entry = byTitle.get(r.titleId);
    if (!entry) continue;
    const current = !r.endDate;
    const end = r.endDate ?? asOf;
    const days = dayCount(r.startDate, end);
    for (const holder of r.holders) {
      if (!holder.wrestlerId && !holder.teamId) continue;
      holderOf(entry, holder).reignList.push({
        id: r.id,
        startDate: r.startDate,
        endDate: r.endDate,
        days,
        current,
      });
    }
  }

  const result = [...byTitle.values()]
    .map(({ title, holders }) => ({
      title,
      holders: [...holders.values()]
        .map((h) => {
          h.reignList.sort((a, b) => a.startDate - b.startDate);
          const universeDays = h.reignList.reduce((s, r) => s + r.days, 0);
          const dated = h.reignList.map((r) => r.days);
          return {
            ...h,
            universeReigns: h.reignList.length,
            universeDays,
            reigns: h.baselineReigns + h.reignList.length,
            days: h.baselineDays + universeDays,
            // maior reinado com data conhecida (o histórico agregado não tem por reinado)
            longestDays: dated.length ? Math.max(...dated) : null,
            isCurrent: h.reignList.some((r) => r.current),
          };
        })
        .sort((a, b) => b.days - a.days || b.reigns - a.reigns),
    }))
    .filter((t) => t.holders.length)
    .sort((a, b) => a.title.name.localeCompare(b.title.name));

  return { asOf, titles: result };
}

module.exports = { buildTitleStats, dayCount };
