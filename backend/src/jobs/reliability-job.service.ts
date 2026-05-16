import { JobsOptions, Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';
import {
  ReliabilityBatchPayload,
  ReliabilitySourcePeriod,
  ReliabilityTimeWindow,
  reliabilityMartService,
} from '../services/reliability-mart.service';
import { analyticsService } from '../services/analytics.service';
import { corridorReliabilityCacheService } from '../services/corridor-reliability-cache.service';

const logger = new Logger('ReliabilityJobService');

const QUEUE_NAME = 'reliability-mart-batch';
const JOB_NAME = 'compute-reliability-period';

function parsePositiveNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.floor(parsed);
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseSourcePeriod(value: string | undefined, defaultValue: ReliabilitySourcePeriod): ReliabilitySourcePeriod {
  if (!value) return defaultValue;
  const normalized = value.toUpperCase();
  return normalized === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY';
}

function toIdSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function buildJobId(payload: ReliabilityBatchPayload): string {
  return `reliability-${payload.sourcePeriod}-${toIdSafe(payload.periodStart)}-${toIdSafe(payload.periodEnd)}`;
}

function buildRecurringJobId(sourcePeriod: ReliabilitySourcePeriod): string {
  return `reliability-repeat-${sourcePeriod}`;
}

function subtractOneMonthUtcClamped(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const maxDayInPreviousMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const targetDay = Math.min(date.getUTCDate(), maxDayInPreviousMonth);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      targetDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

function getPeriodRange(sourcePeriod: ReliabilitySourcePeriod): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const periodEnd = new Date(now);

  if (sourcePeriod === 'MONTHLY') {
    const periodStart = subtractOneMonthUtcClamped(now);
    return { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
  }

  const periodStart = new Date(now);
  periodStart.setUTCDate(periodStart.getUTCDate() - 7);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

class ReliabilityJobService {
  private queue: Queue<ReliabilityBatchPayload> | null = null;

  private worker: Worker<ReliabilityBatchPayload> | null = null;

  async start(): Promise<void> {
    const enabled = parseBoolean(process.env.RELIABILITY_QUEUE_ENABLED, true);
    if (!enabled) {
      logger.log('Reliability queue is disabled by RELIABILITY_QUEUE_ENABLED=false');
      return;
    }

    const connection = getRedisConnection();
    this.queue = new Queue<ReliabilityBatchPayload>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: parsePositiveNumber(process.env.RELIABILITY_JOB_ATTEMPTS, 3),
        backoff: {
          type: 'exponential',
          delay: parsePositiveNumber(process.env.RELIABILITY_JOB_BACKOFF_MS, 5000),
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    this.worker = new Worker<ReliabilityBatchPayload>(
      QUEUE_NAME,
      async (job) => {
        const startedAt = Date.now();
        logger.log(`Started reliability job ${job.id}`, job.data);

        const isRecurringJob = Boolean(job.opts.repeat);
        
        const periodsToCompute: ReliabilitySourcePeriod[] = isRecurringJob 
          ? ['WEEKLY', 'MONTHLY'] 
          : [job.data.sourcePeriod];

        let totalUpserted = 0;

        for (const period of periodsToCompute) {
          const effectivePayload: ReliabilityBatchPayload = {
            ...job.data,
            sourcePeriod: period,
            ...getPeriodRange(period),
          };

          logger.log(
            `Đang thực thi job reliability ${job.id} (${isRecurringJob ? 'định kỳ' : 'thủ công'}) cho ${period}: ${effectivePayload.periodStart} -> ${effectivePayload.periodEnd}`
          );

          const result = await reliabilityMartService.computeReliabilityPeriod({
            ...effectivePayload,
            jobRunId: `${job.id}-${period}`,
          });
          
          totalUpserted += result.upsertedRows;

          // Sau khi tính toán xong mart trong PostgreSQL, cập nhật cache MongoDB cho period này
          logger.log(`Đang làm mới cache MongoDB cho reliability (${period})...`);
          const timeWindows: ReliabilityTimeWindow[] = ['AM_PEAK', 'PM_PEAK', 'OFF_PEAK'];
          for (const tw of timeWindows) {
            await analyticsService.getReliability({
              timeWindow: tw,
              sourcePeriod: period,
              sortBy: 'buffer_index',
              limit: 10000
            });
          }
        }
        
        logger.log(`✓ Đã hoàn tất tính toán và làm mới cache cho tất cả chu kỳ`);

        // Dọn dẹp dữ liệu cũ (mặc định giữ 3 tháng)
        await reliabilityMartService.clearOldReliabilityData(3);

        const durationMs = Date.now() - startedAt;
        logger.log(`Hoàn thành job reliability ${job.id} trong ${durationMs}ms, tổng dòng cập nhật=${totalUpserted}`);
        return { totalUpserted };
      },
      {
        connection,
        concurrency: parsePositiveNumber(process.env.RELIABILITY_JOB_CONCURRENCY, 1),
      }
    );

    this.worker.on('failed', (job, error) => {
      logger.error(`Reliability job failed: ${job?.id ?? 'unknown'}`, error);
    });

    this.worker.on('error', (error) => {
      logger.error('Reliability worker error', error);
    });

    await this.enqueueScheduledJobs();
    await this.enqueueBootstrapJobIfMartEmpty();
    await this.checkAndBackfillCache();
    logger.log('Reliability queue and worker started');
  }

  private async enqueueBootstrapJobIfMartEmpty(): Promise<void> {
    if (!this.queue) {
      return;
    }

    const martEmpty = await reliabilityMartService.isMartEmpty();
    if (!martEmpty) {
      logger.log('Reliability mart already has data, skipping bootstrap job');
      return;
    }

    const sourcePeriod: ReliabilitySourcePeriod = 'MONTHLY';
    const currentPeriod = getPeriodRange(sourcePeriod);
    const payload: ReliabilityBatchPayload = {
      periodStart: currentPeriod.periodStart,
      periodEnd: currentPeriod.periodEnd,
      sourcePeriod,
    };

    await this.queue.add(JOB_NAME, payload, {
      jobId: buildJobId(payload),
    });

    logger.log(
      `Reliability mart is empty, enqueued bootstrap job for ${sourcePeriod}: ${payload.periodStart} -> ${payload.periodEnd}`
    );
  }

  private async checkAndBackfillCache(): Promise<void> {
    if (!this.queue) return;

    const cacheEmpty = await corridorReliabilityCacheService.isCacheEmpty();
    if (cacheEmpty) {
      logger.log('[Backfill] Cache Reliability trong MongoDB đang trống. Khởi động worker nạp cache...');
      // Nạp cho cả WEEKLY và MONTHLY
      const periods: ReliabilitySourcePeriod[] = ['WEEKLY', 'MONTHLY'];
      for (const period of periods) {
        const range = getPeriodRange(period);
        const payload: ReliabilityBatchPayload = {
          periodStart: range.periodStart,
          periodEnd: range.periodEnd,
          sourcePeriod: period,
        };
        await this.queue.add(JOB_NAME, payload, {
          jobId: `bootstrap-cache-${period}-${Date.now()}`,
        });
      }
    } else {
      logger.log('[Backfill] Cache Reliability đã có dữ liệu');
    }
  }

  private async enqueueScheduledJobs(): Promise<void> {
    if (!this.queue) {
      return;
    }

    const dailyEnabled = parseBoolean(process.env.RELIABILITY_DAILY_ENABLED, true);
    if (!dailyEnabled) {
      logger.log('Reliability daily schedule is disabled by RELIABILITY_DAILY_ENABLED=false');
      return;
    }

    const sourcePeriod = parseSourcePeriod(process.env.RELIABILITY_SCHEDULE_SOURCE_PERIOD, 'WEEKLY');
    const pattern = process.env.RELIABILITY_DAILY_CRON || '0 2 * * *';

    await this.upsertRecurringJob(sourcePeriod, pattern);
  }

  private async upsertRecurringJob(sourcePeriod: ReliabilitySourcePeriod, pattern: string): Promise<void> {
    if (!this.queue) {
      return;
    }

    const currentPeriod = getPeriodRange(sourcePeriod);
    const payload: ReliabilityBatchPayload = {
      periodStart: currentPeriod.periodStart,
      periodEnd: currentPeriod.periodEnd,
      sourcePeriod,
    };

    const defaultOptions: JobsOptions = {
      jobId: buildRecurringJobId(sourcePeriod),
      repeat: { pattern },
    };

    await this.queue.add(JOB_NAME, payload, defaultOptions);
    logger.log(`Scheduled ${sourcePeriod} job with cron: ${pattern}`);
  }

  async enqueueNow(payload: ReliabilityBatchPayload): Promise<void> {
    if (!this.queue) {
      throw new Error('Reliability queue has not been started');
    }

    await this.queue.add(JOB_NAME, payload, {
      jobId: buildJobId(payload),
    });
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }
}

export const reliabilityJobService = new ReliabilityJobService();
