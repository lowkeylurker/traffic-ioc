import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { analyticsService } from '../services/analytics.service';
import { corridorCacheService } from '../services/corridor-cache.service';
import { Logger } from '../utils/logger';

const logger = new Logger('CorridorAnalyticsJobService');
const QUEUE_NAME = 'corridor-analytics-cache';

class CorridorAnalyticsJobService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  async start(): Promise<void> {
    const connection = getRedisConnection();

    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { type, date, corridorKey } = job.data;
        logger.log(`Đang xử lý job ${job.id} loại=${type} ngày=${date} mã hành lang=${corridorKey ?? 'TẤT CẢ'}`);

        if (type === 'REFRESH_CACHE') {
          const data = await analyticsService.computeCorridorDashboard({ date, corridorKey });
          await corridorCacheService.setCache(corridorKey, date, data);
        }
      },
      {
        connection,
        concurrency: 1,
      }
    );

    this.worker.on('failed', (job, error) => {
      logger.error(`Job thất bại: ${job?.id}`, error);
    });

    await this.scheduleJobs();

    logger.log('Dịch vụ Job Corridor Analytics đã khởi động');
  }

  private async scheduleJobs(): Promise<void> {
    if (!this.queue) return;

    // Xóa các job lặp lại cũ để tránh trùng lặp
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Job cuối ngày (12:00 AM) - xử lý dữ liệu ngày hôm qua
    // Chạy lúc 12:05 AM để đảm bảo an toàn
    await this.queue.add(
      'daily-end-of-day',
      { type: 'SCHEDULED_BATCH', subtype: 'YESTERDAY' },
      {
        repeat: { pattern: '5 0 * * *' }, // 00:05 AM hàng ngày
        jobId: 'daily-end-of-day',
      }
    );

    // Job cập nhật định kỳ (Mỗi 5 phút từ 6:00 đến 22:30)
    await this.queue.add(
      'periodic-update-today',
      { type: 'SCHEDULED_BATCH', subtype: 'TODAY' },
      {
        repeat: { pattern: '*/5 6-22 * * *' },
        jobId: 'periodic-update-today',
      }
    );

    // Worker đặc biệt cho các job batch đã được lên lịch
    const batchWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        if (job.name === 'daily-end-of-day' || job.name === 'periodic-update-today') {
          const isToday = job.name === 'periodic-update-today';
          
          // Bỏ qua nếu nằm ngoài giới hạn 22:30 cho ngày hôm nay
          if (isToday) {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            if (hour === 22 && minute > 30) {
              logger.log('Bỏ qua cập nhật ngày hôm nay sau 22:30');
              return;
            }
          }

          const date = isToday 
            ? new Date().toISOString().substring(0, 10)
            : new Date(Date.now() - 86400000).toISOString().substring(0, 10);

          await this.enqueueRefreshForDate(date);
        }
      },
      { connection: getRedisConnection() }
    );
  }

  private async enqueueRefreshForDate(date: string): Promise<void> {
    if (!this.queue) return;

    // Lấy tất cả hành lang
    const corridors = await analyticsService.getCorridorOptions();
    const corridorKeys = [null, ...corridors.map(c => c.corridorKey)];

    for (const key of corridorKeys) {
      await this.queue.add(
        'refresh-cache',
        { type: 'REFRESH_CACHE', date, corridorKey: key },
        { jobId: `refresh-${date}-${key ?? 'ALL'}-${Date.now()}` }
      );
    }
    logger.log(`Đã thêm vào hàng đợi làm mới cho ${corridorKeys.length} hành lang vào ngày ${date}`);
  }


  async stop(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}

export const corridorAnalyticsJobService = new CorridorAnalyticsJobService();
