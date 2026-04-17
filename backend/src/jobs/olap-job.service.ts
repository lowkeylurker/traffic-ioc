import { JobsOptions, Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { olapMartService, OlapRefreshPayload } from '../services/olap-mart.service';
import { Logger } from '../utils/logger';

const logger = new Logger('OlapJobService');

const QUEUE_NAME = 'olap-mart-refresh';
const JOB_NAME = 'refresh-olap-mart';

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

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildWindow(days: number): OlapRefreshPayload {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - Math.max(days, 1));
  return {
    fromDate: toIsoDateOnly(fromDate),
    toDate: toIsoDateOnly(toDate),
  };
}

class OlapJobService {
  private queue: Queue<OlapRefreshPayload> | null = null;

  private worker: Worker<OlapRefreshPayload> | null = null;

  async start(): Promise<void> {
    const enabled = parseBoolean(process.env.OLAP_MART_QUEUE_ENABLED, true);
    if (!enabled) {
      logger.log('OLAP mart queue is disabled by OLAP_MART_QUEUE_ENABLED=false');
      return;
    }

    await olapMartService.ensureMartTable();

    const connection = getRedisConnection();
    this.queue = new Queue<OlapRefreshPayload>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: parsePositiveNumber(process.env.OLAP_MART_JOB_ATTEMPTS, 2),
        backoff: {
          type: 'exponential',
          delay: parsePositiveNumber(process.env.OLAP_MART_JOB_BACKOFF_MS, 4000),
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    this.worker = new Worker<OlapRefreshPayload>(
      QUEUE_NAME,
      async (job) => {
        const startedAt = Date.now();
        logger.log(`Started OLAP mart refresh job ${job.id}`, job.data);
        const result = await olapMartService.refreshRange(job.data);
        logger.log(
          `Completed OLAP mart refresh job ${job.id} in ${Date.now() - startedAt}ms, upserted=${result.upsertedRows}`
        );
        return result;
      },
      {
        connection,
        concurrency: parsePositiveNumber(process.env.OLAP_MART_JOB_CONCURRENCY, 1),
      }
    );

    this.worker.on('failed', (job, error) => {
      logger.error(`OLAP mart refresh job failed: ${job?.id ?? 'unknown'}`, error);
    });

    this.worker.on('error', (error) => {
      logger.error('OLAP mart worker error', error);
    });

    await this.enqueueScheduledJob();
    await this.enqueueBootstrapJobIfEmpty();

    logger.log('OLAP mart queue and worker started');
  }

  private async enqueueScheduledJob(): Promise<void> {
    if (!this.queue) return;

    const enabled = parseBoolean(process.env.OLAP_MART_DAILY_ENABLED, true);
    if (!enabled) {
      logger.log('OLAP mart daily schedule is disabled by OLAP_MART_DAILY_ENABLED=false');
      return;
    }

    const pattern = process.env.OLAP_MART_DAILY_CRON || '15 2 * * *';
    const rollingDays = parsePositiveNumber(process.env.OLAP_MART_REFRESH_DAYS, 35);
    const payload = buildWindow(rollingDays);

    const options: JobsOptions = {
      jobId: 'olap-mart-repeat-daily',
      repeat: { pattern },
    };

    await this.queue.add(JOB_NAME, payload, options);
    logger.log(`Scheduled OLAP mart refresh with cron: ${pattern}, rollingDays=${rollingDays}`);
  }

  private async enqueueBootstrapJobIfEmpty(): Promise<void> {
    if (!this.queue) return;

    const martEmpty = await olapMartService.isMartEmpty();
    if (!martEmpty) {
      logger.log('OLAP mart already has data, skipping bootstrap refresh');
      return;
    }

    const backfillDays = parsePositiveNumber(process.env.OLAP_MART_BACKFILL_DAYS, 400);
    const payload = buildWindow(backfillDays);
    const runImmediately = parseBoolean(process.env.OLAP_MART_BOOTSTRAP_RUN_IMMEDIATELY, true);

    if (runImmediately) {
      try {
        logger.log(`OLAP mart empty, running bootstrap refresh immediately ${payload.fromDate} -> ${payload.toDate}`);
        const result = await olapMartService.refreshRange(payload);
        logger.log(`OLAP bootstrap immediate refresh completed, upserted=${result.upsertedRows}`);
        return;
      } catch (error) {
        logger.error('OLAP bootstrap immediate refresh failed, fallback to queue', error);
      }
    }

    await this.queue.add(JOB_NAME, payload, {
      jobId: `olap-mart-bootstrap-${payload.fromDate}-${payload.toDate}`,
    });

    logger.log(`OLAP mart empty, enqueued bootstrap refresh ${payload.fromDate} -> ${payload.toDate}`);
  }

  async enqueueNow(payload: OlapRefreshPayload): Promise<void> {
    if (!this.queue) {
      throw new Error('OLAP mart queue has not been started');
    }

    await this.queue.add(JOB_NAME, payload, {
      jobId: `olap-mart-manual-${payload.fromDate}-${payload.toDate}`,
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

export const olapJobService = new OlapJobService();
