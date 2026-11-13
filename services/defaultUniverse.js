// Dados do universe padrão (usado ao criar a conta e em "resetar universe").
// Os nomes de brands, títulos e PLEs são editáveis depois pelo usuário.

const BRANDS = [
  { name: 'RAW', color: '#d4161c' },
  { name: 'SmackDown', color: '#1f5fbf' },
  { name: 'NXT', color: '#f2c200' },
  { name: 'AAA', color: '#0a8f3c' },
  { name: 'TNA', color: '#6b2fa0' },
];

const ALIGNMENTS = ['Face', 'Heel', 'Tweener'];
const DIVISIONS = ["Men's", "Women's", 'Tag Team'];
const WEIGHT_CLASSES = ['Heavyweight', 'Cruiserweight'];

const MATCH_TYPES = [
  'Singles',
  'Tag Team',
  'Triple Threat',
  'Fatal 4-Way',
  'Handicap',
  'Submission',
  'Iron Man',
  'Last Man Standing',
  'I Quit',
  'Falls Count Anywhere',
  'Steel Cage',
  'Ladder',
  'TLC',
  'Hell in a Cell',
  'Elimination Chamber',
  'Money in the Bank',
  'Royal Rumble',
  'Battle Royal',
];

// Títulos da planilha "2K26 Universe Organiser" + campeões atuais.
// nome, gênero, tag?, campeões
const TITLES = [
  ["Men's WWE Championship", 'M', false, ['Cody Rhodes']],
  ["Women's WWE Championship", 'W', false, ['Rhea Ripley']],
  ["Men's World Championship", 'M', false, ['Roman Reigns']],
  ["Women's World Championship", 'W', false, ['Liv Morgan']],
  ["Men's Intercontinental Championship", 'M', false, ['Penta']],
  ["Women's Intercontinental Championship", 'W', false, ['Becky Lynch']],
  ["Men's US Championship", 'M', false, ['Trick Williams']],
  ["Women's US Championship", 'W', false, ['Tiffany Stratton']],
  ['World Tag Team Championship', 'M', true, ['Logan Paul', 'Austin Theory']],
  ['Tag Team Championship', 'M', true, ['Damian Priest', 'R-Truth']],
  ["Women's Tag Team Championship", 'W', true, ['Paige', 'Brie Bella']],
];

// brand, nome, dia da semana (0 = domingo) — como nas abas mensais
const WEEKLY_SHOWS = [
  ['RAW', 'RAW', 1],
  ['NXT', 'NXT', 2],
  ['SmackDown', 'SmackDown', 5],
  ['AAA', 'AAA', 6],
];

// mês -> PLE (aba "Match Cards"; dezembro não tem PLE)
const PLES = [
  [1, 'Royal Rumble'],
  [2, 'Elimination Chamber'],
  [3, 'WrestleMania'],
  [4, 'Backlash'],
  [5, 'Clash in Italy'],
  [6, 'Night of Champions'],
  [7, 'SummerSlam'],
  [8, 'Money in the Bank'],
  [9, 'Bad Blood'],
  [10, 'Crown Jewel'],
  [11, 'Survivor Series'],
];

// Especiais que aparecem na aba de janeiro
const SPECIALS = [
  [1, "NXT New Year's Evil"],
  [1, "Saturday Night's Main Event"],
];

const TEMPLATE_TOURNAMENTS = [
  { name: 'Torneio de 8 (modelo)', size: 8 },
  { name: 'Torneio de 16 (modelo)', size: 16 },
];

module.exports = {
  BRANDS,
  ALIGNMENTS,
  DIVISIONS,
  WEIGHT_CLASSES,
  MATCH_TYPES,
  TITLES,
  WEEKLY_SHOWS,
  PLES,
  SPECIALS,
  TEMPLATE_TOURNAMENTS,
};
