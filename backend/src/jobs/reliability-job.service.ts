import { JobsOptions, Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';
import {
  ReliabilityBatchPayload,
  ReliabilitySourcePeriod,
  reliabilityMartService,
} from '../services/reliability-mart.service';

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

function buildJobId(payload: ReliabilityBatchPayload): string {
  return `reliability:${payload.sourcePeriod}:${payload.periodStart}:${payload.periodEnd}`;
}

function buildRecurringJobId(sourcePeriod: ReliabilitySourcePeriod): string {
  return `reliability:repeat:${sourcePeriod}`;
}

function getPeriodRange(sourcePeriod: ReliabilitySourcePeriod): { periodStart: string; periodEnd: string } {
  const now = new Date();

  if (sourcePeriod === 'MONTHLY') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
  }

  const day = now.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const thisWeekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday, 0, 0, 0, 0)
  );
  const previousWeekStart = new Date(thisWeekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

  return {
    periodStart: previousWeekStart.toISOString(),
    periodEnd: thisWeekStart.toISOString(),
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
        const effectivePayload: ReliabilityBatchPayload = isRecurringJob
          ? {
              ...job.data,
              ...getPeriodRange(job.data.sourcePeriod),
            }
          : job.data;

        logger.log(
          `Executing reliability job ${job.id} (${isRecurringJob ? 'recurring' : 'manual'}) for ${effectivePayload.sourcePeriod}: ${effectivePayload.periodStart} -> ${effectivePayload.periodEnd}`
        );

        const result = await reliabilityMartService.computeReliabilityPeriod({
          ...effectivePayload,
          jobRunId: job.id,
        });

        const durationMs = Date.now() - startedAt;
        logger.log(`Completed reliability job ${job.id} in ${durationMs}ms, upserted=${result.upsertedRows}`);
        return result;
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
    logger.log('Reliability queue and worker started');
  }

  private async enqueueScheduledJobs(): Promise<void> {
    if (!this.queue) {
      return;
    }

    const weeklyEnabled = parseBoolean(process.env.RELIABILITY_WEEKLY_ENABLED, true);
    const monthlyEnabled = parseBoolean(process.env.RELIABILITY_MONTHLY_ENABLED, true);

    if (weeklyEnabled) {
      await this.upsertRecurringJob('WEEKLY', process.env.RELIABILITY_WEEKLY_CRON || '0 5 * * 1');
    }

    if (monthlyEnabled) {
      await this.upsertRecurringJob('MONTHLY', process.env.RELIABILITY_MONTHLY_CRON || '0 4 1 * *');
    }
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
