const prisma = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const {
  createUniverse,
  resetUniverse,
} = require('../services/universeService');

exports.list = asyncHandler(async (req, res) => {
  res.json(
    await prisma.universe.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    }),
  );
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json(await createUniverse(req.userId, req.body));
});

exports.get = asyncHandler(async (req, res) => {
  res.json(req.universe);
});

exports.update = asyncHandler(async (req, res) => {
  res.json(
    await prisma.universe.update({
      where: { id: req.universe.id },
      data: req.body,
    }),
  );
});

exports.remove = asyncHandler(async (req, res) => {
  await prisma.universe.delete({ where: { id: req.universe.id } });
  res.status(204).end();
});

// Volta o universe ao padrão. Exige { "confirm": true } porque apaga tudo.
exports.reset = asyncHandler(async (req, res) => {
  await resetUniverse(req.universe.id);
  res.json({ message: 'Universe restaurado para o padrão' });
});
