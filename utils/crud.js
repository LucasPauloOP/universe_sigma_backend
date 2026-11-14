const prisma = require('../config/database');
const HttpError = require('./httpError');
const asyncHandler = require('./asyncHandler');
const scopes = require('./scopes');
const {
  resolveImages,
  isStorageRef,
  toStorageRef,
  PREFIX,
} = require('../services/storage');

const unique = (arr) => [...new Set(arr.filter(Boolean))];

// Confere que todos os ids existem DENTRO do universe (impede que um usuário
// vincule registros de outro usuário).
async function assertIds(model, ids, universeId, client = prisma) {
  const list = unique(ids);
  if (!list.length) return;
  const found = await client[model].count({
    where: { id: { in: list }, ...scopes[model](universeId) },
  });
  if (found !== list.length) {
    throw new HttpError(400, `Referência inválida em "${model}"`);
  }
}

/**
 * Gera os handlers de CRUD de um recurso.
 *
 * @param {object} o
 * @param {string} o.model        delegate do prisma (ex.: 'wrestler')
 * @param {boolean} o.hasUniverseId  a tabela tem coluna universeId própria
 * @param {object} o.include      include padrão do prisma
 * @param {object|array} o.orderBy
 * @param {string[]} o.filters    campos aceitos como filtro na query (?brandId=)
 * @param {object} o.refs         { campoFk: 'modelReferenciado' }
 * @param {function} o.nested     (body) => [{ model, ids }] refs dentro de listas
 * @param {function} o.toData     (body, mode) => dados do prisma (relações aninhadas)
 * @param {function} o.beforeWrite async (data, ctx) => void
 * @param {function} o.afterWrite  async (row, ctx) => void

 * @param {function} o.decorate   (row) => row com campos calculados na resposta
 * @param {object} o.persist      substitui o create/update/remove do prisma
 *                                ({ create(data, include), update(id, data, current, include), remove(current) })
 */
function makeCrud(o) {
  const {
    model,
    hasUniverseId = false,
    include,
    orderBy,
    filters = [],
    refs = {},
    nested = () => [],
    toData = (b) => b,
    beforeWrite,
    afterWrite,
    persist = {},
    decorate = (row) => row,
  } = o;

  const scopeOf = (req) => scopes[model](req.universe.id);

  const validateRefs = async (req, body) => {
    const u = req.universe.id;
    // URL assinada (ex.: imagem copiada do show) volta a ser a chave do storage.
    if (body.imageUrl) body.imageUrl = toStorageRef(body.imageUrl);
    // Só aceita arquivos enviados para ESTE universe.
    if (
      isStorageRef(body.imageUrl) &&
      !body.imageUrl.startsWith(`${PREFIX}${u}/`)
    ) {
      throw new HttpError(
        400,
        'imageUrl aponta para um arquivo de outro universe',
      );
    }
    for (const [field, refModel] of Object.entries(refs)) {
      if (body[field]) await assertIds(refModel, [body[field]], u);
    }
    for (const { model: m, ids } of nested(body)) {
      await assertIds(m, ids, u);
    }
  };

  const findOr404 = async (req) => {
    const row = await prisma[model].findFirst({
      where: { id: req.params.id, ...scopeOf(req) },
      include,
    });
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    return row;
  };

  return {
    list: asyncHandler(async (req, res) => {
      const where = { ...scopeOf(req) };
      for (const f of filters) {
        if (req.query[f] === undefined) continue;
        const v = req.query[f];
        where[f] =
          v === 'true'
            ? true
            : v === 'false'
              ? false
              : /^\d+$/.test(v)
                ? Number(v)
                : v;
      }
      const take = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      const skip = parseInt(req.query.offset, 10) || 0;
      const [data, total] = await Promise.all([
        prisma[model].findMany({ where, include, orderBy, take, skip }),
        prisma[model].count({ where }),
      ]);
      res.json({
        data: await resolveImages(data.map(decorate)),
        total,
        limit: take,
        offset: skip,
      });
    }),

    get: asyncHandler(async (req, res) => {
      res.json(await resolveImages(decorate(await findOr404(req))));
    }),

    create: asyncHandler(async (req, res) => {
      await validateRefs(req, req.body);
      const data = toData(req.body, 'create');
      if (hasUniverseId) data.universeId = req.universe.id;
      if (beforeWrite) await beforeWrite(data, { req, mode: 'create' });
      const row = persist.create
        ? await persist.create(data, include)
        : await prisma[model].create({ data, include });
      if (afterWrite) await afterWrite(row, { req, mode: 'create' });
      res.status(201).json(await resolveImages(decorate(row)));
    }),

    update: asyncHandler(async (req, res) => {
      const current = await findOr404(req);
      await validateRefs(req, req.body);
      const data = toData(req.body, 'update');
      if (beforeWrite) {
        await beforeWrite(data, { req, mode: 'update', current });
      }
      const row = persist.update
        ? await persist.update(req.params.id, data, current, include)
        : await prisma[model].update({
            where: { id: req.params.id },
            data,
            include,
          });
      if (afterWrite) await afterWrite(row, { req, mode: 'update', current });
      res.json(await resolveImages(decorate(row)));
    }),

    remove: asyncHandler(async (req, res) => {
      const current = await findOr404(req);
      if (persist.remove) await persist.remove(current);
      else await prisma[model].delete({ where: { id: req.params.id } });
      res.status(204).end();
    }),
  };
}

// Monta as 5 rotas padrão em um router.
function mountCrud(router, path, handlers, schemas, validate) {
  router.get(path, handlers.list);
  router.post(path, validate(schemas.create), handlers.create);
  router.get(`${path}/:id`, handlers.get);
  router.put(`${path}/:id`, validate(schemas.update), handlers.update);
  router.patch(`${path}/:id`, validate(schemas.update), handlers.update);
  router.delete(`${path}/:id`, handlers.remove);
}

module.exports = { makeCrud, mountCrud, assertIds };
