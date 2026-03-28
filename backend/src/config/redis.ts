import IORedis, { Redis } from 'ioredis';

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (redisConnection) {
    return redisConnection;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redisConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (!redisConnection) {
    return;
  }

  await redisConnection.quit();
  redisConnection = null;
}
