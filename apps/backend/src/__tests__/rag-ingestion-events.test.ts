import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { oltpPrisma } from '../config/oltp-prisma';
import { globalEmitter } from '../controllers/admin-rag.controller';

// Mock redis
vi.mock('../config/redis', () => {
  const mockSubscriber = new EventEmitter() as any;
  mockSubscriber.subscribe = vi.fn().mockResolvedValue(1);
  mockSubscriber.unsubscribe = vi.fn().mockResolvedValue(1);
  mockSubscriber.quit = vi.fn().mockResolvedValue('OK');
  mockSubscriber.on = EventEmitter.prototype.on;
  mockSubscriber.emit = EventEmitter.prototype.emit;

  return {
    createRedisConnection: vi.fn(() => mockSubscriber),
  };
});

describe('RagIngestionEventsService', () => {
  let ragIngestionEventsService: any;
  let mockSubscriber: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const redisModule = await import('../config/redis');
    mockSubscriber = redisModule.createRedisConnection();

    // Dynamically import service
    const serviceModule = await import('../services/rag-ingestion-events.service');
    ragIngestionEventsService = serviceModule.ragIngestionEventsService;
  });

  it('should subscribe to rag:ingestion:events on start', async () => {
    await ragIngestionEventsService.start();
    expect(mockSubscriber.subscribe).toHaveBeenCalledWith('rag:ingestion:events');
  });

  it('should forward progress event to globalEmitter', async () => {
    await ragIngestionEventsService.start();

    const emittedEvents: any[] = [];
    const listener = (event: any) => emittedEvents.push(event);
    globalEmitter.on('data', listener);

    const payload = {
      jobId: 'job-123',
      docCode: 'LAW-100',
      event: 'progress',
      data: {
        step: 'AST_PARSED',
        percent: 50,
        message: 'Parsing AST',
      },
    };

    mockSubscriber.emit('message', 'rag:ingestion:events', JSON.stringify(payload));

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0]).toEqual(payload);

    globalEmitter.off('data', listener);
  });

  it('should update OLTP database on complete event', async () => {
    await ragIngestionEventsService.start();

    const updateSpy = vi.fn().mockResolvedValue({});
    (oltpPrisma as any).knowledgeDocument = {
      updateMany: updateSpy,
    };

    const payload = {
      jobId: 'job-456',
      docCode: 'LAW-123',
      event: 'complete',
      data: {
        step: 'COMPLETED',
        percent: 100,
        chunks_count: 24,
      },
    };

    mockSubscriber.emit('message', 'rag:ingestion:events', JSON.stringify(payload));

    // Allow promise tick
    await new Promise((r) => setTimeout(r, 10));

    expect(updateSpy).toHaveBeenCalledWith({
      where: { code: 'LAW-123' },
      data: {
        status: 'COMPLETED',
        chunkCount: 24,
      },
    });
  });

  it('should update OLTP database on error event', async () => {
    await ragIngestionEventsService.start();

    const updateSpy = vi.fn().mockResolvedValue({});
    (oltpPrisma as any).knowledgeDocument = {
      updateMany: updateSpy,
    };

    const payload = {
      jobId: 'job-789',
      docCode: 'LAW-ERR',
      event: 'error',
      data: {
        step: 'FAILED',
        error: 'OCR Failed',
      },
    };

    mockSubscriber.emit('message', 'rag:ingestion:events', JSON.stringify(payload));

    await new Promise((r) => setTimeout(r, 10));

    expect(updateSpy).toHaveBeenCalledWith({
      where: { code: 'LAW-ERR' },
      data: {
        status: 'FAILED',
        errorMessage: 'OCR Failed',
      },
    });
  });
});
