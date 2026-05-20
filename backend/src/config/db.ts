// db.ts - PostgreSQL connection pool (replace Prisma with raw SQL + PostGIS)
import { Pool } from 'pg';

const maxConnections = Number(process.env.PG_POOL_MAX || (process.env.NODE_ENV === 'production' ? 10 : 3));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
    max: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
