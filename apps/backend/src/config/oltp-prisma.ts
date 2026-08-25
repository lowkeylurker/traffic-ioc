// Cấu hình Prisma Client cho OLTP App Database (RAG, Chat, Feedback)
// Singleton Pattern để tránh khởi tạo nhiều instance

import { PrismaClient as OltpPrismaClient } from '../generated/client-oltp';

const globalForOltpPrisma = global as unknown as { oltpPrisma: OltpPrismaClient };

function buildOltpDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.OLTP_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl || process.env.NODE_ENV === 'production') {
    return databaseUrl;
  }

  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT || '5');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', process.env.PRISMA_POOL_TIMEOUT || '20');
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

const databaseUrl = buildOltpDatabaseUrl();

export const oltpPrisma =
  globalForOltpPrisma.oltpPrisma ||
  new OltpPrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForOltpPrisma.oltpPrisma = oltpPrisma;

export default oltpPrisma;
