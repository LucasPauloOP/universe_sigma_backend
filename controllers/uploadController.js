const multer = require('multer');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const storage = require('../services/storage');

// Memória é suficiente: limite de 5 MB por imagem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    storage.EXT[file.mimetype]
      ? cb(null, true)
      : cb(new HttpError(415, 'Envie uma imagem JPEG, PNG, WebP ou GIF')),
});

exports.single = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'Imagem maior que 5 MB'));
    }
    next(err);
  });

// Devolve `imageUrl` (referência para salvar em wrestler/title/show/...) e
// uma `url` temporária para pré-visualizar.
exports.create = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Envie o arquivo no campo "file"');
  const { key, ref } = await storage.uploadImage(
    req.universe.id,
    req.file.buffer,
    req.file.mimetype,
  );
  res.status(201).json({ key, imageUrl: ref, url: await storage.presign(key) });
});
