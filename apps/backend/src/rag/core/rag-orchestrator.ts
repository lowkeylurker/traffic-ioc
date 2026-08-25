import { streamText } from 'ai';
import { LegalCitation, VehicleType } from '@traffic-ioc/shared';
import { EmbedderService, embedderService as defaultEmbedder } from './embedder.service';
import { LLMGateway, defaultLLMGateway } from './llm-gateway';
import { qdrantClient as defaultQdrantClient } from './qdrant.client';
import { oltpPrisma as defaultOltpPrisma } from '../../config/oltp-prisma';
import {
  TrafficLawStrategy,
  trafficLawStrategy as defaultTrafficLawStrategy,
  EnrichedLegalContext,
} from '../strategies/traffic-law.strategy';

export interface RagChatParams {
  message: string;
  sessionId?: string | null;
  vehicleFilter?: VehicleType | null;
  userId?: string | null;
}

export interface RagRetrievalResult {
  sessionId: string;
  citations: LegalCitation[];
  systemPrompt: string;
  userPrompt: string;
  enrichedChunks: EnrichedLegalContext[];
}

export interface RagOrchestratorDependencies {
  embedder?: EmbedderService;
  qdrant?: any;
  oltpPrisma?: any;
  llmGateway?: LLMGateway;
  strategy?: TrafficLawStrategy;
  collectionName?: string;
  scoreThreshold?: number;
  topK?: number;
}

export class RagOrchestrator {
  private embedder: EmbedderService;
  private qdrant: any;
  private oltpPrisma: any;
  private llmGateway: LLMGateway;
  private strategy: TrafficLawStrategy;
  private collectionName: string;
  private scoreThreshold: number;
  private topK: number;

  constructor(deps: RagOrchestratorDependencies = {}) {
    this.embedder = deps.embedder || defaultEmbedder;
    this.qdrant = deps.qdrant || defaultQdrantClient;
    this.oltpPrisma = deps.oltpPrisma || defaultOltpPrisma;
    this.llmGateway = deps.llmGateway || defaultLLMGateway;
    this.strategy = deps.strategy || defaultTrafficLawStrategy;
    this.collectionName = deps.collectionName || process.env.QDRANT_COLLECTION || 'vietnam_traffic_laws';
    this.scoreThreshold = deps.scoreThreshold ?? 0.60;
    this.topK = deps.topK ?? 5;
  }

  /**
   * Resolves or creates chat session in OLTP
   */
  public async ensureChatSession(sessionId?: string | null, userId?: string | null, title?: string): Promise<string> {
    if (sessionId) {
      try {
        const existing = await this.oltpPrisma.chat_session.findUnique({
          where: { id: sessionId },
        });
        if (existing) {
          return existing.id;
        }
      } catch {
        // Fallback to creating or returning
      }
    }

    try {
      let kb = await this.oltpPrisma.knowledge_base.findFirst({
        where: { code: 'vietnam_traffic_laws' },
      });

      if (!kb) {
        kb = await this.oltpPrisma.knowledge_base.create({
          data: {
            code: 'vietnam_traffic_laws',
            name: 'Bộ Pháp điển & Nghị định Giao thông Đường bộ Việt Nam',
            qdrant_collection: this.collectionName,
          },
        });
      }

      const newSession = await this.oltpPrisma.chat_session.create({
        data: {
          kb_id: kb.id,
          user_id: userId || null,
          title: title ? title.slice(0, 100) : 'Cuộc trò chuyện mới',
        },
      });

      return newSession.id;
    } catch {
      return sessionId || 'default-session-id';
    }
  }

  /**
   * Executes 5-step retrieval pipeline
   */
  public async retrieveAndPrepareStream(params: RagChatParams): Promise<RagRetrievalResult> {
    const { message, sessionId: providedSessionId, vehicleFilter, userId } = params;

    // 1. Session & Query Preprocessing
    const sessionId = await this.ensureChatSession(providedSessionId, userId, message);

    // 2. Embedding generation via Ollama bge-m3
    const queryVector = await this.embedder.embedQuery(message);

    // 3. Qdrant vector search with payload filtering
    const searchFilter: any = {};
    if (vehicleFilter && vehicleFilter !== 'ALL') {
      searchFilter.should = [
        { key: 'vehicle_types', match: { value: vehicleFilter } },
        { key: 'vehicle_types', match: { value: 'ALL' } },
      ];
    }

    let searchResults: any[] = [];
    try {
      searchResults = await this.qdrant.search(this.collectionName, {
        vector: queryVector,
        limit: this.topK,
        score_threshold: this.scoreThreshold,
        filter: Object.keys(searchFilter).length > 0 ? searchFilter : undefined,
      });
    } catch (err) {
      console.warn(`[RagOrchestrator] Qdrant search warning:`, err);
      searchResults = [];
    }

    // Filter results strictly above scoreThreshold
    const validPoints = (searchResults || []).filter(
      (p: any) => (p.score ?? 0) >= this.scoreThreshold
    );

    // 4. OLTP PostgreSQL Hydration
    const pointIds = validPoints.map((p: any) => String(p.id));
    const enrichedChunks: EnrichedLegalContext[] = [];

    if (pointIds.length > 0) {
      try {
        const oltpChunks = await this.oltpPrisma.knowledge_chunk.findMany({
          where: {
            OR: [
              { qdrant_point_id: { in: pointIds } },
              { id: { in: pointIds } },
            ],
          },
          include: {
            document: true,
          },
        });

        const chunkMap = new Map<string, any>();
        for (const c of oltpChunks || []) {
          chunkMap.set(c.qdrant_point_id, c);
          chunkMap.set(c.id, c);
        }

        for (const point of validPoints) {
          const oltpChunk = chunkMap.get(String(point.id));
          const payload = point.payload || {};

          const docCode =
            oltpChunk?.document?.code || payload.doc_code || 'ND100/2019/ND-CP';
          const docTitle =
            oltpChunk?.document?.title || payload.doc_title || docCode;
          const articleNumber =
            oltpChunk?.metadata?.article_number ?? payload.article_number ?? 0;
          const clauseNumber =
            oltpChunk?.metadata?.clause_number ?? payload.clause_number ?? null;
          const pointCode =
            oltpChunk?.metadata?.point_code ?? payload.point_code ?? null;
          const fineMin =
            oltpChunk?.metadata?.fine_min ?? payload.fine_min ?? null;
          const fineMax =
            oltpChunk?.metadata?.fine_max ?? payload.fine_max ?? null;
          const suspensionMonths =
            oltpChunk?.metadata?.suspension_months ?? payload.suspension_months ?? null;
          const content =
            oltpChunk?.content || payload.content || '';
          const breadcrumb =
            oltpChunk?.breadcrumb || payload.breadcrumb || '';
          const sourceUrl =
            oltpChunk?.document?.source_url || payload.source_url || null;

          if (content) {
            enrichedChunks.push({
              chunkId: String(point.id),
              docCode,
              docTitle,
              articleNumber,
              clauseNumber,
              pointCode,
              breadcrumb,
              content,
              fineMin,
              fineMax,
              suspensionMonths,
              score: point.score,
              sourceUrl,
            });
          }
        }
      } catch (err) {
        console.warn(`[RagOrchestrator] OLTP chunk hydration warning:`, err);
      }
    }

    // 5. System Prompt & Citation Extraction
    const systemPrompt = this.strategy.buildSystemPrompt(enrichedChunks, vehicleFilter);
    const citations = this.strategy.extractCitations(enrichedChunks);

    return {
      sessionId,
      citations,
      systemPrompt,
      userPrompt: message,
      enrichedChunks,
    };
  }

  /**
   * Full stream orchestration calling Vercel AI SDK
   */
  public async streamChat(params: RagChatParams) {
    const retrieval = await this.retrieveAndPrepareStream(params);
    const model = this.llmGateway.getModel();

    const streamResult = streamText({
      model,
      system: retrieval.systemPrompt,
      prompt: retrieval.userPrompt,
      temperature: 0.1,
    });

    return {
      sessionId: retrieval.sessionId,
      citations: retrieval.citations,
      streamResult,
    };
  }
}

export const ragOrchestrator = new RagOrchestrator();
export default ragOrchestrator;
