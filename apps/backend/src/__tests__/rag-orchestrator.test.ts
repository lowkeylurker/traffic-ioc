import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RagOrchestrator } from '../rag/core/rag-orchestrator';

describe('RagOrchestrator', () => {
  let mockEmbedder: any;
  let mockQdrant: any;
  let mockOltpPrisma: any;
  let mockLLMGateway: any;
  let orchestrator: RagOrchestrator;

  beforeEach(() => {
    mockEmbedder = {
      embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.05)),
    };

    mockQdrant = {
      search: vi.fn().mockResolvedValue([
        {
          id: 'chunk-uuid-1',
          score: 0.89,
          payload: {
            chunk_id: 'chunk-uuid-1',
            doc_code: 'ND100/2019/ND-CP',
            article_number: 6,
            clause_number: 2,
            point_code: 'b',
            fine_min: 400000,
            fine_max: 600000,
            vehicle_types: ['MOTORBIKE'],
          },
        },
      ]),
    };

    mockOltpPrisma = {
      knowledge_chunk: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'chunk-uuid-1',
            qdrant_point_id: 'chunk-uuid-1',
            chunk_index: 0,
            breadcrumb: 'Điều 6 > Khoản 2 > Điểm b',
            content: 'Không đội mũ bảo hiểm cho người đi mô tô, xe máy.',
            metadata: {
              fine_min: 400000,
              fine_max: 600000,
              article_number: 6,
              clause_number: 2,
              point_code: 'b',
            },
            document: {
              id: 'doc-uuid-1',
              code: 'ND100/2019/ND-CP',
              title: 'Nghị định 100/2019/NĐ-CP',
              source_url: 'https://thuvienphapluat.vn',
            },
          },
        ]),
      },
      chat_session: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sess-1', title: 'Test' }),
        create: vi.fn().mockResolvedValue({ id: 'sess-1', title: 'Test' }),
      },
      chat_message: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      },
    };

    mockLLMGateway = {
      getModel: vi.fn().mockReturnValue({ modelId: 'test-model' }),
    };

    orchestrator = new RagOrchestrator({
      embedder: mockEmbedder,
      qdrant: mockQdrant,
      oltpPrisma: mockOltpPrisma,
      llmGateway: mockLLMGateway,
    });
  });

  it('should execute 5-step retrieval pipeline and return citations with stream', async () => {
    const result = await orchestrator.retrieveAndPrepareStream({
      message: 'Không đội mũ bảo hiểm bị phạt bao nhiêu?',
      sessionId: 'sess-1',
      vehicleFilter: 'MOTORBIKE',
    });

    // 1. Embedding generated
    expect(mockEmbedder.embedQuery).toHaveBeenCalledWith(
      'Không đội mũ bảo hiểm bị phạt bao nhiêu?'
    );

    // 2. Qdrant searched with threshold >= 0.60
    expect(mockQdrant.search).toHaveBeenCalledWith(
      'vietnam_traffic_laws',
      expect.objectContaining({
        limit: 5,
        score_threshold: 0.6,
      })
    );

    // 3. PostgreSQL OLTP hydrated
    expect(mockOltpPrisma.knowledge_chunk.findMany).toHaveBeenCalled();

    // 4. Citations extracted
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].docCode).toBe('ND100/2019/ND-CP');
    expect(result.citations[0].fineMin).toBe(400000);
    expect(result.citations[0].fineMax).toBe(600000);

    // 5. System prompt prepared
    expect(result.systemPrompt).toContain('Nghị định 100/2019/NĐ-CP');
    expect(result.systemPrompt).toContain('400.000');
  });

  it('should apply Qdrant vehicleFilter when vehicleFilter is not ALL', async () => {
    await orchestrator.retrieveAndPrepareStream({
      message: 'Lỗi chạy quá tốc độ ô tô',
      vehicleFilter: 'CAR',
    });

    expect(mockQdrant.search).toHaveBeenCalledWith(
      'vietnam_traffic_laws',
      expect.objectContaining({
        filter: expect.objectContaining({
          should: expect.arrayContaining([
            {
              key: 'vehicle_types',
              match: { value: 'CAR' },
            },
          ]),
        }),
      })
    );
  });

  it('should filter out Qdrant results below 0.60 score threshold', async () => {
    mockQdrant.search.mockResolvedValueOnce([
      {
        id: 'low-score-chunk',
        score: 0.45, // < 0.60
        payload: { doc_code: 'ND100' },
      },
    ]);

    const result = await orchestrator.retrieveAndPrepareStream({
      message: 'Một câu hỏi không liên quan đến luật',
    });

    expect(result.citations).toHaveLength(0);
    expect(result.systemPrompt).toContain('Không tìm thấy căn cứ');
  });
});
