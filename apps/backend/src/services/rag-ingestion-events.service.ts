import { createRedisConnection } from '../config/redis';
import { oltpPrisma } from '../config/oltp-prisma';
import { globalEmitter, jobRegistry } from '../controllers/admin-rag.controller';
import { Logger } from '../utils/logger';

const logger = new Logger('RagIngestionEventsService');
const RAG_INGESTION_CHANNEL = 'rag:ingestion:events';

export interface IngestionBusEvent {
  jobId: string;
  docCode: string;
  event: 'progress' | 'complete' | 'error';
  data: {
    step?: string;
    percent?: number;
    message?: string;
    chunks_count?: number;
    points_upserted?: number;
    error?: string;
    [key: string]: any;
  };
}

export class RagIngestionEventsService {
  private subscriber: any = null;
  private isSubscribed: boolean = false;

  async start(): Promise<void> {
    if (this.isSubscribed) return;

    try {
      this.subscriber = createRedisConnection();

      this.subscriber.on('message', async (channel: string, message: string) => {
        if (channel !== RAG_INGESTION_CHANNEL) return;

        try {
          const payload: IngestionBusEvent = JSON.parse(message);
          await this.handleEvent(payload);
        } catch (err) {
          logger.error('Error parsing Redis Pub/Sub message:', err);
        }
      });

      await this.subscriber.subscribe(RAG_INGESTION_CHANNEL);
      this.isSubscribed = true;
      logger.log(`✓ Subscribed to Redis channel: ${RAG_INGESTION_CHANNEL}`);
    } catch (err) {
      logger.error(`Failed to subscribe to Redis channel ${RAG_INGESTION_CHANNEL}:`, err);
    }
  }

  public async handleEvent(payload: IngestionBusEvent): Promise<void> {
    const { jobId, docCode, event, data } = payload;

    // 1. Update job in jobRegistry if registered
    const job = jobRegistry.get(jobId);
    if (job) {
      const item = { event, data };
      job.events.push(item);
      job.emitter.emit('data', item);
      if (event === 'complete') {
        job.status = 'COMPLETED';
        job.result = data;
      } else if (event === 'error') {
        job.status = 'FAILED';
        job.error = data?.error || 'Ingestion failed';
      }
    }

    // 2. Broadcast to global SSE emitter for connected frontend clients
    globalEmitter.emit('data', {
      jobId,
      docCode,
      event,
      data,
    });

    // 2. Synchronize database state on terminal events
    try {
      const docDelegate = (oltpPrisma as any).knowledgeDocument || (oltpPrisma as any).knowledge_document;
      if (!docDelegate) return;

      if (event === 'complete') {
        await docDelegate.updateMany({
          where: { code: docCode },
          data: {
            status: 'COMPLETED',
            chunkCount: data?.chunks_count || 0,
          },
        });
        logger.log(`✓ Updated document ${docCode} to COMPLETED via Redis event`);
      } else if (event === 'error') {
        await docDelegate.updateMany({
          where: { code: docCode },
          data: {
            status: 'FAILED',
            errorMessage: data?.error || 'Ingestion failed',
          },
        });
        logger.error(`Document ${docCode} failed via Redis event: ${data?.error}`);
      }
    } catch (dbErr) {
      logger.error(`Failed to update OLTP document ${docCode} on event ${event}:`, dbErr);
    }
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(RAG_INGESTION_CHANNEL);
        await this.subscriber.quit();
      } catch {
        // Ignore
      }
      this.subscriber = null;
      this.isSubscribed = false;
    }
  }
}

export const ragIngestionEventsService = new RagIngestionEventsService();
