const prisma = require('../../config/database');
const readXlsxFile = require('read-excel-file/node');
const HttpError = require('../../utils/httpError');
const { parseWorkbook } = require('./parse');
const { buildPlan, DEFAULT_OPTIONS } = require('./plan');
const { applyPlan, loadSnapshot } = require('./apply');

// Lê o .xlsx (buffer) e devolve as abas [{ sheet, data }].
async function readBuffer(buffer) {
  try {
    return await readXlsxFile(buffer);
  } catch {
    throw new HttpError(
      400,
      'Não consegui ler o arquivo. Envie uma planilha .xlsx válida.',
    );
  }
}

/** Analisa a planilha e devolve o relatório (sem gravar nada). */
async function preview(buffer, universeId, options) {
  const parsed = parseWorkbook(await readBuffer(buffer));
  const plan = buildPlan(parsed, await loadSnapshot(universeId), options);
  return { applied: false, options: plan.options, report: plan.report };
}

/** Analisa e GRAVA. Repete a análise para não confiar em nada que veio do navegador. */
async function importSheet(buffer, universeId, options) {
  const parsed = parseWorkbook(await readBuffer(buffer));
  const plan = buildPlan(parsed, await loadSnapshot(universeId), options);
  const result = await prisma.$transaction(
    (tx) => applyPlan(plan, universeId, tx),
    {
      timeout: 60000,
      maxWait: 10000,
    },
  );
  return { applied: true, options: plan.options, report: plan.report, result };
}

module.exports = { preview, importSheet, DEFAULT_OPTIONS };
