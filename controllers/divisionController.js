const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { assertIds } = require('../utils/crud');
const { resolveImages } = require('../services/storage');
const svc = require('../services/divisionService');

// GET /card-divisions/board?brandId=
exports.board = asyncHandler(async (req, res) => {
  const { brandId } = req.query;
  if (brandId) await assertIds('brand', [brandId], req.universe.id);
  res.json(await resolveImages(await svc.board(req.universe.id, brandId)));
});

// PUT /card-divisions/:id/entries  { entries: [{ wrestlerId } | { teamId }] }
// Define a lista inteira, na ordem recebida (1ª posição = primeiro desafiante).
exports.setEntries = asyncHandler(async (req, res) => {
  const u = req.universe.id;
  const division = await prisma.cardDivision.findFirst({
    where: { id: req.params.id, universeId: u },
  });
  if (!division) throw new HttpError(404, 'Registro não encontrado');
  const { entries } = req.body;
  svc.assertBody(entries);
  await assertIds(
    'wrestler',
    entries.map((e) => e.wrestlerId),
    u,
  );
  await assertIds(
    'team',
    entries.map((e) => e.teamId),
    u,
  );
  await svc.replaceEntries(division.id, entries);
  const [updated] = (await svc.board(u)).filter((d) => d.id === division.id);
  res.json(await resolveImages(updated));
});

// POST /card-divisions/defaults — cria as divisões padrão das brands que não têm nenhuma.
exports.defaults = asyncHandler(async (req, res) => {
  const created = await svc.seedDefaultDivisions(req.universe.id);
  res.status(201).json({ created });
});

// PUT /card-divisions/:id/champion  { mode: 'fix'|'change', holders: [{ wrestlerId } | { teamId }] }
exports.setChampion = asyncHandler(async (req, res) => {
  const u = req.universe.id;
  const division = await prisma.cardDivision.findFirst({
    where: { id: req.params.id, universeId: u },
  });
  if (!division) throw new HttpError(404, 'Registro não encontrado');
  if (!division.titleId)
    throw new HttpError(422, 'Esta divisão não está vinculada a um título');
  const { holders, mode } = req.body;
  await assertIds(
    'wrestler',
    holders.map((h) => h.wrestlerId),
    u,
  );
  await assertIds(
    'team',
    holders.map((h) => h.teamId),
    u,
  );
  await svc.setChampion(u, division, { mode, holders });
  const [updated] = (await svc.board(u)).filter((d) => d.id === division.id);
  res.json(await resolveImages(updated));
});
