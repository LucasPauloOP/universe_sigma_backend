const multer = require('multer');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const sheetImport = require('../services/sheetImport');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    /\.xlsx$/i.test(file.originalname)
      ? cb(null, true)
      : cb(new HttpError(415, 'Envie uma planilha .xlsx')),
});

exports.single = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'Planilha maior que 10 MB'));
    }
    next(err);
  });

// As opções chegam como texto (multipart): só aceita as conhecidas, como booleanos.
function readOptions(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    throw new HttpError(400, 'Opções inválidas');
  }
  const out = {};
  for (const key of Object.keys(sheetImport.DEFAULT_OPTIONS)) {
    if (typeof parsed[key] === 'boolean') out[key] = parsed[key];
  }
  return out;
}

// POST /import/universe-sheet            -> analisa e devolve o relatório (não grava)
// POST /import/universe-sheet?apply=true -> analisa de novo e grava
exports.universeSheet = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Envie a planilha no campo "file"');
  const options = readOptions(req.body?.options);
  const run =
    req.query.apply === 'true' ? sheetImport.importSheet : sheetImport.preview;
  res.json(await run(req.file.buffer, req.universe.id, options));
});
