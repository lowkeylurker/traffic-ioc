export interface EmbedderOptions {
  baseUrl?: string;
  modelName?: string;
  timeoutMs?: number;
}

export class EmbedderService {
  private baseUrl: string;
  private modelName: string;
  private timeoutMs: number;

  constructor(options: EmbedderOptions = {}) {
    let url = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    // Normalize url: remove trailing /api or slash
    url = url.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    this.baseUrl = url;
    this.modelName = options.modelName || process.env.EMBEDDING_MODEL_NAME || 'bge-m3';
    this.timeoutMs = options.timeoutMs || 15000;
  }

  public async embedQuery(text: string): Promise<number[]> {
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error('Cannot embed empty text query.');
    }

    const endpoint = `${this.baseUrl}/api/embeddings`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          prompt: trimmed,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `Ollama embedding failed with status ${response.status}: ${response.statusText} - ${errorBody}`
        );
      }

      const data = (await response.json()) as { embedding: number[] };
      if (!data || !Array.isArray(data.embedding)) {
        throw new Error('Invalid response structure from Ollama embeddings endpoint.');
      }

      return data.embedding;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (const text of texts) {
      const emb = await this.embedQuery(text);
      embeddings.push(emb);
    }
    return embeddings;
  }
}

export const embedderService = new EmbedderService();
export default embedderService;
