import { Queue, Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';
import { query } from '../config/db';

const logger = new Logger('RoutingRefreshJobService');

const QUEUE_NAME = 'routing-view-refresh';
const JOB_NAME = 'refresh-materialized-view';

class RoutingRefreshJobService {
  private queue: Queue | null = null;

  private worker: Worker | null = null;

  async start(): Promise<void> {
    this.queue = new Queue(QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 10,
        removeOnFail: 20,
      },
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        logger.log(`Executing job ${job.id}: ${JOB_NAME}...`);
        try {
          // REFRESH CONCURRENTLY requires a unique index on the MV
          await query('REFRESH MATERIALIZED VIEW CONCURRENTLY view_dynamic_routing_edges;');
          logger.log('Successfully refreshed view_dynamic_routing_edges');
        } catch (error) {
          logger.error('Failed to refresh view_dynamic_routing_edges', error);
          throw error;
        }
      },
      {
        connection: createRedisConnection(),
      }
    );

    this.worker.on('failed', (job, error) => {
      logger.error(`Routing refresh job failed: ${job?.id}`, error);
    });

    await this.enqueueScheduledJob();
    logger.log('Routing view refresh queue and worker started');
  }

  private async enqueueScheduledJob(): Promise<void> {
    if (!this.queue) {
      return;
    }

    const pattern = '*/15 * * * *'; // Every 15 minutes
    
    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { pattern },
        jobId: 'routing-refresh-recurring',
      }
    );

    logger.log(`Scheduled routing refresh recurring job with pattern: ${pattern}`);
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

export const routingRefreshJobService = new RoutingRefreshJobService();
