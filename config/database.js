const { PrismaClient } = require('@prisma/client');
const loadEnv = require('../utils/loadEnv.config');

loadEnv();

// A Neon entrega duas URLs: DATABASE_URL (com pooler/PgBouncer) para o app e
// DATABASE_URL_UNPOOLED (direta) para migrations. Com o pooler, o Prisma
// precisa de `pgbouncer=true` (desliga prepared statements nomeados).
function appDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  if (url.hostname.includes('-pooler') && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
  }
  return url.toString();
}

// Singleton: uma única conexão compartilhada por toda a aplicação.
// Transações interativas (card, reset...) fazem várias queries em sequência e o
// Neon fica a alguns ms de distância: o padrão de 5s do Prisma expira à toa.
const prisma = new PrismaClient({
  datasourceUrl: appDatabaseUrl(),
  transactionOptions: { timeout: 30000, maxWait: 10000 },
});

module.exports = prisma;
