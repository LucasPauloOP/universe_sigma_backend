const HttpError = require('../utils/httpError');

// Limite simples em memória para as rotas de IA (protege a cota do plano gratuito):
// no máximo MAX pedidos por usuário a cada janela.
const WINDOW_MS = 60 * 1000;
const MAX = 6;
const hits = new Map();

module.exports = (req, res, next) => {
  const now = Date.now();
  const key = req.userId ?? req.ip;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX) {
    return next(new HttpError(429, 'Muitos pedidos à IA. Aguarde um minuto'));
  }
  recent.push(now);
  hits.set(key, recent);
  next();
};
