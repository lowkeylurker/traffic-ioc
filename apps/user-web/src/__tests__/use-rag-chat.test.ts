import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSSEEvents, processSSEStream } from '../hooks/use-rag-chat';
import type { LegalCitation } from '@traffic-ioc/shared';

describe('use-rag-chat SSE Stream Reader & Event Processing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseSSEEvents', () => {
    it('should parse a single complete SSE event block', () => {
      const buffer = 'event: token\ndata: {"token":"Xin chào"}\n\n';
      const result = parseSSEEvents(buffer);

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toEqual({
        event: 'token',
        data: '{"token":"Xin chào"}',
      });
      expect(result.remainingBuffer).toBe('');
    });

    it('should handle multiple concatenated SSE events in one buffer', () => {
      const buffer = [
        'event: citations\ndata: {"citations":[{"docCode":"ND100/2019/ND-CP","articleNumber":6}]}\n\n',
        'event: token\ndata: {"token":"Mức phạt"}\n\n',
        'event: token\ndata: {"token":" là 1.000.000đ"}\n\n',
        'event: done\ndata: {"messageId":"msg-999","sessionId":"sess-123"}\n\n',
      ].join('');

      const result = parseSSEEvents(buffer);

      expect(result.events).toHaveLength(4);
      expect(result.events[0].event).toBe('citations');
      expect(result.events[1].event).toBe('token');
      expect(result.events[2].event).toBe('token');
      expect(result.events[3].event).toBe('done');
      expect(result.remainingBuffer).toBe('');
    });

    it('should retain incomplete trailing data in remainingBuffer', () => {
      const buffer = 'event: token\ndata: {"token":"Đoạn 1"}\n\nevent: token\ndata: {"tok';
      const result = parseSSEEvents(buffer);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].event).toBe('token');
      expect(result.remainingBuffer).toBe('event: token\ndata: {"tok');
    });

    it('should correctly parse multi-line data fields', () => {
      const buffer = 'event: error\ndata: {"error":\ndata: "Lỗi kết nối"}\n\n';
      const result = parseSSEEvents(buffer);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].event).toBe('error');
    });
  });

  describe('processSSEStream', () => {
    const mockCitations: LegalCitation[] = [
      {
        docCode: 'ND100/2019/ND-CP',
        articleNumber: 6,
        clauseNumber: 4,
        pointCode: 'a',
        fineMin: 800000,
        fineMax: 1000000,
        suspensionMonths: 2,
        title: 'Nghị định 100/2019/NĐ-CP',
        breadcrumb: 'Điều 6 > Khoản 4 > Điểm a',
        sourceUrl: 'https://thuvienphapluat.vn',
        content: 'Vượt đèn đỏ xe máy phạt từ 800.000 đến 1.000.000 đồng.',
      },
    ];

    it('should dispatch onCitations, onToken, and onDone in sequence', async () => {
      const citationsHandler = vi.fn();
      const tokenHandler = vi.fn();
      const doneHandler = vi.fn();
      const errorHandler = vi.fn();

      async function* mockStream() {
        yield 'event: citations\ndata: {"citations":[{"docCode":"ND100/2019/ND-CP","articleNumber":6,"fineMin":800000,"fineMax":1000000}]}\n\n';
        yield 'event: token\ndata: {"token":"Theo Nghị định 100, "}\n\n';
        yield 'event: token\ndata: {"token":"mức phạt vượt đèn đỏ xe máy là 800k - 1tr."}\n\n';
        yield 'event: done\ndata: {"messageId":"msg-done-1","sessionId":"session-abc"}\n\n';
      }

      await processSSEStream(mockStream(), {
        onCitations: citationsHandler,
        onToken: tokenHandler,
        onDone: doneHandler,
        onError: errorHandler,
      });

      expect(citationsHandler).toHaveBeenCalledTimes(1);
      expect(citationsHandler).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ docCode: 'ND100/2019/ND-CP', articleNumber: 6 }),
        ])
      );

      expect(tokenHandler).toHaveBeenCalledTimes(2);
      expect(tokenHandler).toHaveBeenNthCalledWith(1, 'Theo Nghị định 100, ');
      expect(tokenHandler).toHaveBeenNthCalledWith(2, 'mức phạt vượt đèn đỏ xe máy là 800k - 1tr.');

      expect(doneHandler).toHaveBeenCalledTimes(1);
      expect(doneHandler).toHaveBeenCalledWith({
        messageId: 'msg-done-1',
        sessionId: 'session-abc',
      });

      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should dispatch onError when event: error is streamed', async () => {
      const citationsHandler = vi.fn();
      const tokenHandler = vi.fn();
      const doneHandler = vi.fn();
      const errorHandler = vi.fn();

      async function* mockStream() {
        yield 'event: error\ndata: {"error":"Model rate limit exceeded"}\n\n';
      }

      await processSSEStream(mockStream(), {
        onCitations: citationsHandler,
        onToken: tokenHandler,
        onDone: doneHandler,
        onError: errorHandler,
      });

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith('Model rate limit exceeded');
      expect(doneHandler).not.toHaveBeenCalled();
    });
  });
});
