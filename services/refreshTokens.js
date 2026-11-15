const crypto = require('crypto');
const prisma = require('../config/database');
const HttpError = require('../utils/httpError');

const TTL_DAYS = () => Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 90;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Emite um refresh token novo (o valor em claro só existe nesta resposta).
async function issue(userId, userAgent) {
  const token = crypto.randomBytes(48).toString('base64url');
  const row = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + TTL_DAYS() * 24 * 60 * 60 * 1000),
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
  });
  return { token, id: row.id };
}

const revokeAll = (userId) =>
  prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

// Troca um refresh token válido por um novo (rotação). Reuso de token já
// revogado = possível roubo: revoga todos os do usuário.
async function rotate(token, userAgent) {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash(token) },
  });
  if (!row) throw new HttpError(401, 'Refresh token inválido');
  if (row.revokedAt) {
    await revokeAll(row.userId);
    throw new HttpError(401, 'Refresh token inválido');
  }
  if (row.expiresAt <= new Date()) {
    throw new HttpError(401, 'Refresh token expirado');
  }
  const next = await issue(row.userId, userAgent);
  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date(), replacedById: next.id },
  });
  return { userId: row.userId, refreshToken: next.token };
}

async function revoke(token) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = { issue, rotate, revoke, revokeAll };
