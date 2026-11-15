// Express só reconhece como handler de erro funções com 4 argumentos.
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erro interno no servidor';

  // Erros conhecidos do Prisma
  if (err.code === 'P2002') {
    statusCode = 409;
    message = `Já existe um registro com esse valor (${(err.meta?.target || []).join(', ')})`;
  } else if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Registro não encontrado';
  } else if (err.code === 'P2003') {
    statusCode = 400;
    message = 'Referência inválida: o registro relacionado não existe';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'JSON inválido';
  }

  if (statusCode === 500) console.error(err);

  res.status(statusCode).json({
    success: false,
    message,
    details: err.details,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
