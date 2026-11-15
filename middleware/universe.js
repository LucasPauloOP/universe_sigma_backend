const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

// Garante que o universe da URL existe e pertence ao usuário logado.
module.exports = asyncHandler(async (req, res, next) => {
  const universe = await prisma.universe.findFirst({
    where: { id: req.params.universeId, userId: req.userId },
  });
  if (!universe) throw new HttpError(404, 'Universe não encontrado');
  req.universe = universe;
  next();
});
