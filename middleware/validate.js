const HttpError = require('../utils/httpError');

// Valida req.body com um schema Joi e substitui o body pelo valor limpo.
module.exports = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return next(
      new HttpError(
        422,
        'Dados inválidos',
        error.details.map((d) => d.message),
      ),
    );
  }
  req.body = value;
  next();
};
