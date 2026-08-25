import { describe, it, expect } from 'vitest';
import {
  TrafficLawStrategy,
  EnrichedLegalContext,
} from '../rag/strategies/traffic-law.strategy';

describe('TrafficLawStrategy', () => {
  const strategy = new TrafficLawStrategy();

  const sampleChunks: EnrichedLegalContext[] = [
    {
      chunkId: 'c1',
      docCode: 'ND100/2019/ND-CP',
      docTitle: 'Nghị định 100/2019/NĐ-CP về xử phạt vi phạm giao thông',
      articleNumber: 6,
      clauseNumber: 2,
      pointCode: 'b',
      breadcrumb: 'Chương II > Mục 1 > Điều 6 > Khoản 2 > Điểm b',
      content:
        'Không đội mũ bảo hiểm cho người đi mô tô, xe máy hoặc đội mũ bảo hiểm không cài quai đúng quy cách khi điều khiển xe tham gia giao thông trên đường bộ.',
      fineMin: 400000,
      fineMax: 600000,
      suspensionMonths: null,
      score: 0.88,
      sourceUrl: 'https://thuvienphapluat.vn/van-ban/Giao-thong-Van-tai/ND100',
    },
  ];

  it('should build a robust system prompt containing legal context and strict grounding rules', () => {
    const prompt = strategy.buildSystemPrompt(sampleChunks, 'MOTORBIKE');

    expect(prompt).toContain('Nghị định 100/2019/NĐ-CP');
    expect(prompt).toContain('Điều 6');
    expect(prompt).toContain('400.000');
    expect(prompt).toContain('600.000');
    expect(prompt).toContain('Luật Giao thông');
    // Strict negative grounding instruction
    expect(prompt).toMatch(/không tự ý bịa đặt|chỉ dựa vào căn cứ|nếu không có trong văn bản/i);
  });

  it('should extract structured citations from enriched context chunks', () => {
    const citations = strategy.extractCitations(sampleChunks);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toEqual(
      expect.objectContaining({
        docCode: 'ND100/2019/ND-CP',
        articleNumber: 6,
        clauseNumber: 2,
        pointCode: 'b',
        fineMin: 400000,
        fineMax: 600000,
      })
    );
  });

  it('should handle empty context gracefully by instructing model to state lack of legal data', () => {
    const prompt = strategy.buildSystemPrompt([], 'CAR');
    expect(prompt).toContain('Không tìm thấy căn cứ');
  });
});
