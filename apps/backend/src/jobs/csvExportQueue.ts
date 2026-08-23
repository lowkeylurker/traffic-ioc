import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';

const logger = new Logger('CsvExportQueue');

export const CSV_EXPORT_QUEUE_NAME = 'csvExportQueue';

export interface CsvExportJobData {
  userId: string;
  email: string;
  exportParams: {
    startDateTime: string;
    endDateTime: string;
    roadKey?: string;
    roadName?: string;
    minTrafficIndex?: number;
  };
}

export const csvExportQueue = new Queue<CsvExportJobData>(CSV_EXPORT_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,                  // Tự động thử lại 3 lần nếu có lỗi phát sinh (ví dụ: DB bottleneck, Resend API rate limit)
    backoff: {
      type: 'exponential',
      delay: 5000,                // Chờ 5 giây trước khi thử lại
    },
    removeOnComplete: 20,         // Chỉ lưu tối đa 20 job hoàn tất gần nhất trong Redis để giữ Redis sạch sẽ
    removeOnFail: 50,             // Lưu tối đa 50 job thất bại để phục vụ việc debug
  },
});

logger.log('✓ CsvExportQueue initialized successfully.');
