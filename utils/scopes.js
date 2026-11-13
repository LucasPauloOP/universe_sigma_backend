// Como filtrar cada tabela pelo universe do usuário (algumas só chegam nele
// através de relações: segmento -> episódio -> show -> universe).
const direct = (u) => ({ universeId: u });

module.exports = {
  brand: direct,
  wrestler: direct,
  team: direct,
  title: direct,
  season: direct,
  show: direct,
  matchType: direct,
  tournament: direct,
  alignment: direct,
  division: direct,
  weightClass: direct,
  rivalry: direct,
  episode: (u) => ({ show: { universeId: u } }),
  segment: (u) => ({ episode: { show: { universeId: u } } }),
  titleReign: (u) => ({ title: { universeId: u } }),
  tournamentEntrant: (u) => ({ tournament: { universeId: u } }),
  tournamentMatch: (u) => ({ tournament: { universeId: u } }),
};
