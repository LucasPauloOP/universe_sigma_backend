// Regras do card de um episódio (show ou PLE):
//  - a ordem é livre: inserir/mover/remover reorganiza as posições (1..N);
//  - só pode existir UM main event por episódio.
const prisma = require('../config/database');
const HttpError = require('../utils/httpError');

const orderedIds = async (tx, episodeId) =>
  (
    await tx.segment.findMany({
      where: { episodeId },
      orderBy: { position: 'asc' },
      select: { id: true },
    })
  ).map((s) => s.id);

// Grava a ordem em duas fases para nunca violar @@unique([episodeId, position]).
async function applyOrder(tx, episodeId, ids) {
  for (let i = 0; i < ids.length; i++) {
    await tx.segment.update({
      where: { id: ids[i] },
      data: { position: -(i + 1) },
    });
  }
  for (let i = 0; i < ids.length; i++) {
    await tx.segment.update({
      where: { id: ids[i] },
      data: { position: i + 1 },
    });
  }
}

// Quem vira main event tira o posto do anterior (no mesmo episódio).
const demoteOtherMainEvents = (tx, episodeId, exceptId) =>
  tx.segment.updateMany({
    where: {
      episodeId,
      isMainEvent: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { isMainEvent: false },
  });

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Cria um segmento. `position` opcional: sem ela vai para o fim; com ela os
// demais são empurrados para baixo.
async function createSegment(data, include) {
  const wanted = data.position;
  return prisma.$transaction(async (tx) => {
    const ids = await orderedIds(tx, data.episodeId);
    // Primeiro tira o posto do main event atual (o índice único do banco
    // não aceita dois ao mesmo tempo), depois cria o novo.
    if (data.isMainEvent) await demoteOtherMainEvents(tx, data.episodeId);
    const row = await tx.segment.create({
      data: { ...data, position: ids.length + 1 },
    });
    if (wanted && wanted <= ids.length) {
      ids.splice(clamp(wanted, 1, ids.length + 1) - 1, 0, row.id);
      await applyOrder(tx, data.episodeId, ids);
    }
    return tx.segment.findUnique({ where: { id: row.id }, include });
  });
}

async function updateSegment(id, data, current, include) {
  if (data.episodeId && data.episodeId !== current.episodeId) {
    throw new HttpError(
      400,
      'Não é possível mover o segmento para outro episódio; crie um novo lá',
    );
  }
  const { position: wanted, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    if (rest.isMainEvent === true) {
      await demoteOtherMainEvents(tx, current.episodeId, id);
    }
    await tx.segment.update({ where: { id }, data: rest });
    if (wanted) {
      const ids = (await orderedIds(tx, current.episodeId)).filter(
        (x) => x !== id,
      );
      ids.splice(clamp(wanted, 1, ids.length + 1) - 1, 0, id);
      await applyOrder(tx, current.episodeId, ids);
    }
    return tx.segment.findUnique({ where: { id }, include });
  });
}

// Remove e fecha o buraco na numeração.
async function removeSegment(current) {
  await prisma.$transaction(async (tx) => {
    await tx.segment.delete({ where: { id: current.id } });
    await applyOrder(
      tx,
      current.episodeId,
      await orderedIds(tx, current.episodeId),
    );
  });
}

// Monta o card de uma vez: os segmentos entram na ordem do array.
// `replace: true` apaga o card atual antes.
async function createCard(episodeId, items, { replace, toData, include }) {
  if (items.filter((s) => s.isMainEvent).length > 1) {
    throw new HttpError(400, 'Só pode haver um main event por card');
  }
  return prisma.$transaction(
    async (tx) => {
      if (replace) await tx.segment.deleteMany({ where: { episodeId } });
      let position = (await orderedIds(tx, episodeId)).length;
      if (items.some((s) => s.isMainEvent)) {
        await demoteOtherMainEvents(tx, episodeId);
      }
      for (const item of items) {
        await tx.segment.create({
          data: { ...toData(item, 'create'), episodeId, position: ++position },
        });
      }
      return tx.segment.findMany({
        where: { episodeId },
        orderBy: { position: 'asc' },
        include,
      });
    },
    { timeout: 30000 },
  );
}

module.exports = {
  orderedIds,
  applyOrder,
  createSegment,
  updateSegment,
  removeSegment,
  createCard,
};
