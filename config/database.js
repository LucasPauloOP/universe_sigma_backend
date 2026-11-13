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
const prisma = new PrismaClient({ datasourceUrl: appDatabaseUrl() });

module.exports = prisma;
