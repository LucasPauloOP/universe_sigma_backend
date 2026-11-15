const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const rivalries = require('../services/rivalryService');

// GET /rivalries/match?wrestlerIds=a,b,c — rivalidades ativas reconhecidas pela luta montada
exports.match = asyncHandler(async (req, res) => {
  const raw = String(req.query.wrestlerIds ?? '');
  const ids = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (ids.length > 40) throw new HttpError(400, 'Lutadores demais');
  res.json(await rivalries.matchRivalries(req.universe.id, ids));
});
