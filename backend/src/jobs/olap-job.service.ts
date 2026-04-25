import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { olapMartService } from '../services/olap-mart.service';
import { Logger } from '../utils/logger';

const logger = new Logger('OlapJobService');
const QUEUE_NAME = 'olap-mart-refresh';
const JOB_NAME = 'refresh-materialized-view';

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

class OlapJobService {
  private queue: Queue | null = null;

  private worker: Worker | null = null;

  async start(): Promise<void> {
    const enabled = parseBoolean(process.env.OLAP_MART_DAILY_ENABLED, true);
    if (!enabled) {
      logger.log('OLAP refresh job is disabled by OLAP_MART_DAILY_ENABLED=false');
      return;
    }

    const connection = getRedisConnection();

    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        logger.log(`Running OLAP refresh job ${job.id}`);
        await olapMartService.refreshMaterializedView();
        logger.log(`OLAP refresh job ${job.id} completed`);
      },
      {
        connection,
        concurrency: 1,
      }
    );

    this.worker.on('failed', (job, error) => {
      logger.error(`OLAP refresh job failed: ${job?.id ?? 'unknown'}`, error);
    });

    this.worker.on('error', (error) => {
      logger.error('OLAP worker error', error);
    });

    await this.enqueueBootstrapJob();
    await this.enqueueScheduledJob();

    logger.log('OLAP refresh queue and worker started');
  }

  private async enqueueBootstrapJob(): Promise<void> {
    if (!this.queue) {
      return;
    }

    await this.queue.add(
      JOB_NAME,
      {},
      {
        jobId: `olap-bootstrap-${Date.now()}`,
      }
    );
    logger.log('Enqueued bootstrap OLAP refresh job');
  }

  private async enqueueScheduledJob(): Promise<void> {
    if (!this.queue) {
      return;
    }

    const pattern = process.env.OLAP_MART_DAILY_CRON || '0 2 * * *';

    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { pattern },
        jobId: 'olap-refresh-recurring',
      }
    );

    logger.log(`Scheduled OLAP refresh recurring job with pattern: ${pattern}`);
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
