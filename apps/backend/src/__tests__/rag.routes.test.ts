import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import ragRoutes from '../routes/rag.routes';
import { oltpPrisma } from '../config/oltp-prisma';
import { ragOrchestrator } from '../rag/core/rag-orchestrator';

describe('RAG Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/v1/rag', ragRoutes);
  });

  describe('POST /api/v1/rag/traffic-law/chat', () => {
    it('should reject requests with empty message with 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/v1/rag/traffic-law/chat')
        .send({ message: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Message');
    });

    it('should stream Server-Sent Events with citations, tokens, and done event for valid message', async () => {
      // Mock textStream async iterator
      async function* mockTextStream() {
        yield 'Mức phạt ';
        yield 'từ 400.000đ đến 600.000đ.';
      }

      vi.spyOn(ragOrchestrator, 'streamChat').mockResolvedValueOnce({
        sessionId: 'test-session-123',
        citations: [
          {
            docCode: 'ND100/2019/ND-CP',
            articleNumber: 6,
            clauseNumber: 2,
            pointCode: 'b',
            fineMin: 400000,
            fineMax: 600000,
            suspensionMonths: null,
            title: 'Nghị định 100/2019/NĐ-CP',
            breadcrumb: 'Điều 6 > Khoản 2 > Điểm b',
            sourceUrl: null,
            content: 'Không đội mũ bảo hiểm...',
          },
        ],
        streamResult: {
          textStream: mockTextStream(),
          text: Promise.resolve('Mức phạt từ 400.000đ đến 600.000đ.'),
        } as any,
      });

      const response = await request(app)
        .post('/api/v1/rag/traffic-law/chat')
        .send({
          message: 'Không đội mũ bảo hiểm bị phạt bao nhiêu tiền?',
          vehicleFilter: 'MOTORBIKE',
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toContain('event: citations');
      expect(response.text).toContain('ND100/2019/ND-CP');
      expect(response.text).toContain('event: token');
      expect(response.text).toContain('Mức phạt');
      expect(response.text).toContain('event: done');
    });
  });

  describe('POST /api/v1/rag/feedback', () => {
    it('should reject invalid rating or missing messageId with 400', async () => {
      const response = await request(app)
        .post('/api/v1/rag/feedback')
        .send({ messageId: 'not-a-uuid', rating: 'positive' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should save feedback and return 200/201 for valid submission', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';

      vi.spyOn(oltpPrisma.chat_feedback, 'create').mockResolvedValueOnce({
        id: 'fb-uuid-1',
        message_id: validUuid,
        rating: 1,
        comment: 'Rất chính xác!',
        created_at: new Date(),
      } as any);

      const response = await request(app)
        .post('/api/v1/rag/feedback')
        .send({
          messageId: validUuid,
          rating: 1,
          comment: 'Rất chính xác!',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message_id).toBe(validUuid);
    });
  });
});
