import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import adminRagRoutes from '../routes/admin-rag.routes';
import { oltpPrisma } from '../config/oltp-prisma';
import { qdrantClient } from '../rag/core/qdrant.client';

describe('Admin RAG Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/rag/documents', adminRagRoutes);
  });

  describe('GET /api/v1/admin/rag/documents', () => {
    it('should return paginated list of legal documents', async () => {
      const docDelegate = (oltpPrisma as any).knowledgeDocument || (oltpPrisma as any).knowledge_document;
      if (docDelegate) {
        vi.spyOn(docDelegate, 'count').mockResolvedValueOnce(1);
        vi.spyOn(docDelegate, 'findMany').mockResolvedValueOnce([
          {
            id: 'doc-uuid-1',
            kbId: 'kb-uuid-1',
            code: '100/2019/ND-CP',
            title: 'Nghị định 100/2019/NĐ-CP',
            fileName: 'ND100.docx',
            status: 'COMPLETED',
            _count: { chunks: 142 },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }

      const res = await request(app).get('/api/v1/admin/rag/documents');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].code).toBe('100/2019/ND-CP');
      expect(res.body.data.items[0].chunkCount).toBe(142);
    });
  });

  describe('GET /api/v1/admin/rag/documents/:docId/chunks', () => {
    it('should return chunks for given docId', async () => {
      const chunkDelegate = (oltpPrisma as any).knowledgeChunk || (oltpPrisma as any).knowledge_chunk;
      if (chunkDelegate) {
        vi.spyOn(chunkDelegate, 'findMany').mockResolvedValueOnce([
          {
            id: 'chunk-1',
            documentId: 'doc-uuid-1',
            chunkIndex: 0,
            breadcrumb: 'Điều 6 > Khoản 2 > Điểm b',
            content: 'Không đội mũ bảo hiểm...',
            qdrantPointId: 'pt-1',
          },
        ]);
      }

      const res = await request(app).get('/api/v1/admin/rag/documents/doc-uuid-1/chunks');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].breadcrumb).toContain('Điều 6');
    });
  });

  describe('GET /api/v1/admin/rag/documents/jobs/:jobId/stream', () => {
    it('should return 404 for non-existent job', async () => {
      const res = await request(app).get('/api/v1/admin/rag/documents/jobs/non-existent-job/stream');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/admin/rag/documents/:docId', () => {
    it('should delete document in DB and purge from Qdrant', async () => {
      const docDelegate = (oltpPrisma as any).knowledgeDocument || (oltpPrisma as any).knowledge_document;
      if (docDelegate) {
        vi.spyOn(docDelegate, 'findUnique').mockResolvedValueOnce({
          id: 'doc-uuid-1',
          code: '100/2019/ND-CP',
        });
        vi.spyOn(docDelegate, 'delete').mockResolvedValueOnce({ id: 'doc-uuid-1' });
      }

      if (typeof qdrantClient.delete === 'function') {
        vi.spyOn(qdrantClient, 'delete').mockResolvedValueOnce({ status: 'ok' } as any);
      }

      const res = await request(app).delete('/api/v1/admin/rag/documents/doc-uuid-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('xóa thành công');
    });
  });
});
