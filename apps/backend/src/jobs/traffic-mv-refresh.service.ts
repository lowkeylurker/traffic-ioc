import { Queue, Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';

const logger = new Logger('TrafficMVRefreshJob');
const QUEUE_NAME = 'traffic-mv-refresh';
const JOB_NAME = 'refresh-mv-latest-traffic';

class TrafficMVRefreshJobService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  async start(): Promise<void> {
    this.queue = new Queue(QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        try {
          logger.log(`Refreshing mv_latest_traffic_status (job: ${job.id})...`);
          // Note: Concurrent refresh requires a unique index on the MV
          await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_traffic_status');
          logger.log(`✓ mv_latest_traffic_status refreshed (job: ${job.id})`);
        } catch (error) {
          logger.error(`Failed to refresh MV (job: ${job.id})`, error);
        }
      },
      {
        connection: createRedisConnection(),
        concurrency: 1,
      }
    );

    await this.scheduleJob();
    logger.log('Traffic MV refresh queue and worker started');
  }

  private async scheduleJob(): Promise<void> {
    if (!this.queue) return;

    // Refresh every minute
    const pattern = '* * * * *';

    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { pattern },
        jobId: 'traffic-mv-refresh-recurring',
      }
    );

    logger.log(`Scheduled Traffic MV refresh recurring job with pattern: ${pattern}`);
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

export const trafficMVRefreshJobService = new TrafficMVRefreshJobService();
