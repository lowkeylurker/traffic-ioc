import { Queue } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';

const logger = new Logger('NewsQueue');

export const NEWS_QUEUE_NAME = 'trafficNewsQueue';

// Sử dụng IORedis instance đã cấu hình sẵn trong dự án
export const newsQueue = new Queue(NEWS_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 10,
    removeOnFail: true,
  },
});

/**
 * Xóa toàn bộ job còn lưu trong Redis của queue khi khởi động lại server
 */
export async function clearTrafficNewsQueueOnStartup() {
  try {
    await newsQueue.obliterate({ force: true });
    logger.log('Traffic News Queue cleared on startup.');
  } catch (error) {
    logger.error('Failed to clear Traffic News Queue on startup', error);
  }
}

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
