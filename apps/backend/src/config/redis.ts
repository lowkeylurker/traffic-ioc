import IORedis, { Redis, RedisOptions } from 'ioredis';
import { Logger } from '../utils/logger';

const logger = new Logger('RedisConfig');

const activeConnections: Set<Redis> = new Set();
let sharedRedisClient: Redis | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function getRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 3000);
      return delay;
    },
  };
}

export function createRedisConnection(): Redis {
  const url = getRedisUrl();
  const client = new IORedis(url, getRedisOptions());

  client.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  activeConnections.add(client);
  return client;
}

export function getRedisConnection(): Redis {
  if (sharedRedisClient) {
    return sharedRedisClient;
  }
  sharedRedisClient = createRedisConnection();
  return sharedRedisClient;
}

export async function closeRedisConnection(): Promise<void> {
  const closePromises = Array.from(activeConnections).map((client) =>
    client.quit().catch((err) => {
      logger.warn('Error quitting Redis client', err);
    })
  );
  await Promise.allSettled(closePromises);
  activeConnections.clear();
  sharedRedisClient = null;
}

