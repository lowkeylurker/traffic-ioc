import { Queue, Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { analyticsService } from '../services/analytics.service';
import { corridorCacheService } from '../services/corridor-cache.service';
import { Logger } from '../utils/logger';

const logger = new Logger('CorridorAnalyticsJobService');
const QUEUE_NAME = 'corridor-analytics-cache';

class CorridorAnalyticsJobService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  async start(): Promise<void> {
    this.queue = new Queue(QUEUE_NAME, {
      connection: createRedisConnection(),
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
        const { type, date, corridorKey, isToday } = job.data || {};

        if (job.name === 'daily-end-of-day' || job.name === 'periodic-update-today' || type === 'SCHEDULED_BATCH' || type === 'REFRESH_DATE_BATCH') {
          const isTodayJob = job.name === 'periodic-update-today' || isToday;

          // Bỏ qua nếu nằm ngoài giới hạn 22:30 cho ngày hôm nay
          if (isTodayJob) {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            if (hour === 22 && minute > 30) {
              return;
            }
          }

          const targetDate = date || (isTodayJob
            ? new Date().toISOString().substring(0, 10)
            : new Date(Date.now() - 86400000).toISOString().substring(0, 10));

          await this.refreshCorridorsForDate(targetDate);
          return;
        }

        if (type === 'REFRESH_CACHE') {
          const data = await analyticsService.computeCorridorDashboard({ date, corridorKey });
          await corridorCacheService.setCache(corridorKey, date, data);
        }
      },
      {
        connection: createRedisConnection(),
        concurrency: 1,
      }
    );

    this.worker.on('failed', (job, error) => {
      logger.error(`Job thất bại: ${job?.id}`, error);
    });

    await this.scheduleJobs();
    await this.checkAndBackfillYesterday();

    logger.log('Dịch vụ Job Corridor Analytics đã khởi động');
  }

  /**
   * Refreshes all corridors for a target date and outputs only 2 logs: processing log and summary log
   */
  public async refreshCorridorsForDate(date: string): Promise<{ success: number; failed: number }> {
    const startedAt = Date.now();

    // 1. Lấy tất cả hành lang (+ 1 dữ liệu tổng thể null)
    const corridors = await analyticsService.getCorridorOptions();
    const corridorKeys = [null, ...corridors.map((c) => c.corridorKey)];

    // Log 1: Processing log
    logger.log(`Đang xử lý cập nhật dữ liệu phân tích hành lang cho ngày ${date} (tổng số: ${corridorKeys.length} hành lang)...`);

    let successCount = 0;
    let failCount = 0;

    for (const key of corridorKeys) {
      try {
        const data = await analyticsService.computeCorridorDashboard({ date, corridorKey: key ?? undefined });
        await corridorCacheService.setCache(key, date, data);
        successCount++;
      } catch (error) {
        failCount++;
        logger.error(`Lỗi khi xử lý hành lang ${key ?? 'TẤT CẢ'} ngày ${date}:`, error);
      }
    }

    const durationMs = Date.now() - startedAt;
    // Log 2: Summary log
    logger.log(`Hoàn tất cập nhật dữ liệu hành lang ngày ${date}: ${successCount} thành công, ${failCount} thất bại (${durationMs}ms)`);

    return { success: successCount, failed: failCount };
  }

  private async scheduleJobs(): Promise<void> {
    if (!this.queue) return;

    // Xóa các job lặp lại cũ để tránh trùng lặp
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Job cuối ngày (12:05 AM) - xử lý dữ liệu ngày hôm qua
    await this.queue.add(
      'daily-end-of-day',
      { type: 'SCHEDULED_BATCH', isToday: false },
      {
        repeat: { pattern: '5 0 * * *' }, // 00:05 AM hàng ngày
        jobId: 'daily-end-of-day',
      }
    );

    // Job cập nhật định kỳ (Mỗi 5 phút từ 6:00 đến 22:30)
    await this.queue.add(
      'periodic-update-today',
      { type: 'SCHEDULED_BATCH', isToday: true },
      {
        repeat: { pattern: '*/5 6-22 * * *' },
        jobId: 'periodic-update-today',
      }
    );
  }

  private async checkAndBackfillYesterday(): Promise<void> {
    if (!this.queue) return;

    const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
    const hasData = await corridorCacheService.hasDataForDate(yesterday);

    if (!hasData) {
      logger.log(`[Backfill] Dữ liệu ngày hôm qua (${yesterday}) đang trống. Khởi động cập nhật...`);
      await this.refreshCorridorsForDate(yesterday);
    }
  }

  async stop(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}

export const corridorAnalyticsJobService = new CorridorAnalyticsJobService();

