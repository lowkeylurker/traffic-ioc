import { QdrantClient } from '@qdrant/js-client-rest';

const globalForQdrant = global as unknown as { qdrantClient: QdrantClient };

export function createQdrantClient(url?: string, apiKey?: string): QdrantClient {
  const qdrantUrl = url || process.env.QDRANT_URL || 'http://localhost:6333';
  const qdrantApiKey = apiKey || process.env.QDRANT_API_KEY;

  return new QdrantClient({
    url: qdrantUrl,
    apiKey: qdrantApiKey || undefined,
  });
}

export const qdrantClient =
  globalForQdrant.qdrantClient ||
  createQdrantClient();

if (process.env.NODE_ENV !== 'production') {
  globalForQdrant.qdrantClient = qdrantClient;
}

export default qdrantClient;
