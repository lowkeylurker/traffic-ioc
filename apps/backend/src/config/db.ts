// db.ts - PostgreSQL connection pool (replace Prisma with raw SQL + PostGIS)
import { Pool } from 'pg';

const maxConnections = Number(process.env.PG_POOL_MAX || (process.env.NODE_ENV === 'production' ? 10 : 3));

const dwDatabaseUrl = process.env.DW_DATABASE_URL || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: dwDatabaseUrl,
    ssl: dwDatabaseUrl?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
    max: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
