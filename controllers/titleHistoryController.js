const asyncHandler = require('../utils/asyncHandler');
const { seedTitleHistory } = require('../services/titleHistoryService');

// POST /title-baselines/defaults — cadastra o histórico de reinados padrão (tabela de
// estatísticas por título). Não sobrescreve o que já está cadastrado.
exports.importDefaults = asyncHandler(async (req, res) => {
  res.status(201).json(await seedTitleHistory(req.universe.id));
});
