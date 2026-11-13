const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado');
  return process.env.JWT_SECRET;
};

const signToken = (user) =>
  jwt.sign({ sub: user.id }, secret(), { expiresIn: '7d' });

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Token não informado'));
  }
  try {
    req.userId = jwt.verify(token, secret()).sub;
    next();
  } catch {
    next(new HttpError(401, 'Token inválido ou expirado'));
  }
};

module.exports = { signToken, requireAuth };
