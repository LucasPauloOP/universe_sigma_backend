// A temporada segue o calendário da WWE: começa depois da WrestleMania (maio) e
// termina na WrestleMania (abril).
const SEASON_MONTHS = [5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4];

// Meses de uma temporada que começa em `startMonth` (vazio = maio), até abril.
function monthsFrom(startMonth) {
  const i = SEASON_MONTHS.indexOf(startMonth ?? 5);
  return SEASON_MONTHS.slice(i === -1 ? 0 : i);
}

// Noites de um PLE que ainda não têm episódio. `existing` = noites já cadastradas
// (episódio sem noite conta como noite 1).
function missingNights(nights, existing) {
  const present = new Set(existing.map((n) => n ?? 1));
  return Array.from({ length: nights }, (_, i) => i + 1).filter(
    (n) => !present.has(n),
  );
}

module.exports = { SEASON_MONTHS, monthsFrom, missingNights };
