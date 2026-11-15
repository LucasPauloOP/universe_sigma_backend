const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken } = require('../middleware/auth');
const refreshTokens = require('../services/refreshTokens');
const { createUniverse } = require('../services/universeService');

const publicUser = ({ id, email, name, createdAt }) => ({
  id,
  email,
  name,
  createdAt,
});

exports.register = asyncHandler(async (req, res) => {
  const { email, password, name, useTemplate } = req.body;
  const normalized = email.toLowerCase();

  if (await prisma.user.findUnique({ where: { email: normalized } })) {
    throw new HttpError(409, 'E-mail já cadastrado');
  }

  const user = await prisma.user.create({
    data: {
      email: normalized,
      name,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  // Todo usuário novo já começa com um universe padrão.
  const universe = await createUniverse(user.id, {
    name: 'Meu Universe',
    useTemplate,
  });

  const refresh = await refreshTokens.issue(user.id, req.get('user-agent'));
  res.status(201).json({
    token: signToken(user),
    refreshToken: refresh.token,
    user: publicUser(user),
    universe,
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  // Mesma mensagem para e-mail e senha errados (não revela quais e-mails existem).
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'E-mail ou senha inválidos');
  }
  const refresh = await refreshTokens.issue(user.id, req.get('user-agent'));
  res.json({
    token: signToken(user),
    refreshToken: refresh.token,
    user: publicUser(user),
  });
});

// Recuperação de senha SEM e-mail (temporário): quem informar um e-mail
// cadastrado pode definir a nova senha. Trocar por token enviado por e-mail.
exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { email: req.body.email.toLowerCase() },
  });
  if (!user) throw new HttpError(404, 'E-mail não encontrado');
  res.json({ exists: true });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) throw new HttpError(404, 'E-mail não encontrado');
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  await refreshTokens.revokeAll(user.id); // sessões antigas deixam de renovar
  res.json({ ok: true });
});

// Troca o refresh token por um novo par {token, refreshToken} (rotação).
exports.refresh = asyncHandler(async (req, res) => {
  const { userId, refreshToken } = await refreshTokens.rotate(
    req.body.refreshToken,
    req.get('user-agent'),
  );
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, 'Usuário não existe mais');
  res.json({
    token: signToken(user),
    refreshToken,
    user: publicUser(user),
  });
});

exports.logout = asyncHandler(async (req, res) => {
  await refreshTokens.revoke(req.body.refreshToken);
  res.status(204).end();
});

exports.me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new HttpError(401, 'Usuário não existe mais');
  res.json(publicUser(user));
});
