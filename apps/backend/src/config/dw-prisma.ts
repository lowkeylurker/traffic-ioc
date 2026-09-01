// Cấu hình Prisma Client cho Data Warehouse (OLAP)
// Singleton Pattern để tránh khởi tạo nhiều instance

import { PrismaClient as DwPrismaClient } from '../generated/client-dw';

const globalForDwPrisma = global as unknown as { dwPrisma: DwPrismaClient };

function buildDwDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.DW_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl || process.env.NODE_ENV === 'production') {
    return databaseUrl;
  }

  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT || '3');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', process.env.PRISMA_POOL_TIMEOUT || '20');
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

const databaseUrl = buildDwDatabaseUrl();

export const dwPrisma =
  globalForDwPrisma.dwPrisma ||
  new DwPrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForDwPrisma.dwPrisma = dwPrisma;

export { Prisma } from '../generated/client-dw';
export default dwPrisma;
