import { Queue } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';

const logger = new Logger('NewsQueue');

export const NEWS_QUEUE_NAME = 'trafficNewsQueue';

// Sử dụng IORedis instance đã cấu hình sẵn trong dự án
export const newsQueue = new Queue(NEWS_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

/**
 * Thêm job khởi chạy News Worker định kỳ mỗi 5 phút
 */
export async function scheduleTrafficNewsJob() {
  try {
    await newsQueue.add(
      'generateTrafficNews',
      {},
      {
        repeat: {
          pattern: '*/5 * * * *', // Chạy mỗi 5 phút
        },
      }
    );
    logger.log('Traffic News Job scheduled successfully.');
  } catch (error) {
    logger.error('Failed to schedule Traffic News Job', error);
  }
}
