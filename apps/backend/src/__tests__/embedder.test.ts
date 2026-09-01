import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EmbedderService, embedderService } from '../rag/core/embedder.service';

describe('EmbedderService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should generate 1024-dimensional embedding vector for query text', async () => {
    const mockVector = new Array(1024).fill(0.123);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: mockVector }),
    } as Response);

    const embedder = new EmbedderService({
      baseUrl: 'http://localhost:11434',
      modelName: 'bge-m3',
    });

    const result = await embedder.embedQuery('Vượt đèn đỏ phạt bao nhiêu?');
    expect(result).toHaveLength(1024);
    expect(result[0]).toBe(0.123);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'bge-m3',
          prompt: 'Vượt đèn đỏ phạt bao nhiêu?',
        }),
      })
    );
  });

  it('should trim text and reject empty query', async () => {
    const embedder = new EmbedderService();
    await expect(embedder.embedQuery('   ')).rejects.toThrowError(/empty/i);
  });

  it('should batch embed multiple documents', async () => {
    const mockVector1 = new Array(1024).fill(0.1);
    const mockVector2 = new Array(1024).fill(0.2);

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: mockVector1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: mockVector2 }),
      } as Response);

    const embedder = new EmbedderService();
    const results = await embedder.embedDocuments([
      'Điều 5 Nghị định 100',
      'Điều 6 Nghị định 100',
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveLength(1024);
    expect(results[1]).toHaveLength(1024);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should throw descriptive error when Ollama endpoint fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'Ollama model bge-m3 not loaded',
    } as Response);

    const embedder = new EmbedderService();
    await expect(
      embedder.embedQuery('Mức phạt nồng độ cồn')
    ).rejects.toThrow(/Ollama embedding failed with status 503/i);
  });

  it('should export a singleton embedderService instance', () => {
    expect(embedderService).toBeInstanceOf(EmbedderService);
  });
});
