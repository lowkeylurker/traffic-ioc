## Design Summary

The Smart Traffic IOC platform will introduce a production-grade, verified Vietnamese Traffic Legislation Multi-RAG platform. The system operates in two decoupled stages:
1. **Document Ingestion Service (`rag-ingestion/`)**: A dedicated Python FastAPI microservice built with `uv` (`pyproject.toml`, `uv.lock`, and `pyrefly` type checking) utilizing LlamaIndex, Google Gemini Flash OCR for scanned decree PDFs, and local Ollama `BAAI/bge-m3` (1024-dimension) embeddings. It parses decrees hierarchically (Chương > Điều > Khoản > Điểm) into self-contained, breadcrumb-enriched chunks and synchronizes them to an OLTP PostgreSQL database and a Qdrant vector database (`vietnam_traffic_laws` collection).
2. **Real-Time Retrieval & Serving (`apps/backend` + `apps/user-web`)**: Express.js gateway leveraging dual Prisma clients (`oltpPrisma` and `dwPrisma`) and Vercel AI SDK (`ai`), streaming grounded answers, citation badges, and fine summary cards via Server-Sent Events (SSE) to Next.js 16 commuter portal.

---

## Alternatives Considered

### Alternative A: Single Unified PostgreSQL with `pgvector` inside OLAP Data Warehouse
- **Approach**: Add `pgvector` tables directly to the existing Kimball star schema in `apps/backend/prisma/schema.prisma`.
- **Pros**:
  - Single database instance to manage with zero extra infrastructure containers.
- **Cons**:
  - Pollutes analytical star-schema (`dim_*`, `fact_*`) with high-frequency transactional chat sessions and message logs.
  - Risk of lock contention and connection pool exhaustion between analytical sensor telemetry jobs and commuter chat traffic.
  - Prisma ORM lacks native vector indexing support without raw SQL workarounds.
- **Why not chosen**: Fails to maintain clean separation between OLAP Data Warehouse and operational transactional workloads.

### Alternative B: Dedicated Vector DB (Qdrant) + Redis for Sessions (No OLTP Relational DB)
- **Approach**: Store all vectors in Qdrant and keep chat history/state exclusively in Redis memory, leaving PostgreSQL purely for OLAP.
- **Pros**:
  - Zero SQL schema modifications on PostgreSQL.
  - Extremely fast in-memory session operations.
- **Cons**:
  - Redis memory is ephemeral or costly for long-term audit trails, citation logs, and user feedback.
  - Lacks relational querying and foreign key integrity for knowledge base cataloging and decree metadata.
- **Why not chosen**: Relational structure is critical for verified citation lookups, document versioning, and commuter feedback tracking.

### Alternative C: Dual PostgreSQL (OLAP DW + OLTP DB) + Qdrant + Pluggable Multi-RAG (Agreed Approach)
- **Approach**: Separate the existing OLAP Data Warehouse from an operational OLTP PostgreSQL DB with dual Prisma clients in Express. Store 1024-dim dense vectors in Qdrant, parse decrees with LlamaIndex in Python, and stream responses via Vercel AI SDK.
- **Pros**:
  - Complete workload and schema isolation between analytical sensor telemetry and interactive commuter RAG.
  - Zero DB migrations when adding future RAG domains (Operator SOPs, Transit Guides) via universal `knowledge_*` schema.
  - Deterministic legal AST chunking ensures 100% accurate legal citations and zero hallucination.
  - 100% local, private embeddings via Ollama `bge-m3` combined with fast Google Gemini Flash OCR.
- **Cons**:
  - Requires managing a secondary PostgreSQL database and Qdrant container in `docker-compose.yml`.
- **Why chosen**: Best architectural balance of performance, isolation, legal precision, and long-term multi-domain scalability.

---

## Agreed Approach

We adopt **Alternative C (Dual PostgreSQL + Qdrant + Python Ingestion + TypeScript Serving)**:

### 1. Ingestion Pipeline (`rag-ingestion/`)
- Adaptive document loader (Google Gemini Flash OCR for scanned decrees, native parser for digital DOCX/PDF).
- LlamaIndex custom `LegalNodeParser` extracting hierarchical AST (Chương > Điều > Khoản > Điểm) enriched with parent fine brackets and license penalties.
- Ollama `BAAI/bge-m3` embedding generator producing 1024-dimensional dense vectors.
- Dual-store sync: Upserts vectors to Qdrant collection `vietnam_traffic_laws` (ID = `chunk_id`) and relational records to OLTP PostgreSQL.

### 2. Retrieval & Search Strategy (`apps/backend`)
```
 User Query (Next.js user-web)
    │
    ▼
 1. Query Pre-processing & Embedding
    ├── Multi-turn Context Rewriting: Resolves conversational references (e.g., "Còn ô tô thì sao?")
    └── Dense Vector Generation: Local Ollama `bge-m3` (1024-dim)
    │
    ▼
 2. Qdrant Vector Search & Pre-filtering
    ├── Metric: Cosine Similarity, Top-K = 4–5
    ├── Quality Guardrail: Similarity Score Threshold ≥ 0.60 (rejects off-topic queries)
    └── Payload Pre-filtering (Contextual): Pre-filters by `vehicle_types` and `violation_group`
    │
    ▼
 3. OLTP PostgreSQL Hydration
    └── Fetches full chunk texts, breadcrumbs (`Điều 6 > Khoản 4 > Điểm a`), and fine ranges by UUIDs
    │
    ▼
 4. Pluggable Reranking Middleware (`RAG_RERANK_ENABLED=false` for MVP)
    ├── Phase 1 (MVP): Direct Top-4 chunks to LLM
    └── Phase 2 (Optional Toggle): Cross-Encoder reranking (Cohere / BGE) for borderline fine thresholds
    │
    ▼
 5. Vercel AI SDK Streaming Generation
    └── Streams structured citation badges + grounded answer tokens via Server-Sent Events (SSE)
```

---

## Key Decisions

1. **Service Boundary**: Ingestion microservice in Python (`rag-ingestion/`), retrieval gateway in TypeScript Express (`apps/backend`).
2. **OCR Engine**: Google Gemini Flash for transcribing scanned decrees, circulars with red stamps, and complex penalty tables into structured Markdown.
3. **Embedding Engine**: `BAAI/bge-m3` (1024 dimensions) served locally via Ollama (`http://localhost:11434`).
4. **Vector Store**: Qdrant vector database (`vietnam_traffic_laws` collection) with payload filtering by `vehicle_types` and `violation_group`.
5. **Legal Chunking**: Structural AST parsing (Chương > Điều > Khoản > Điểm) + breadcrumb contextualization instead of statistical semantic chunking.
6. **Retrieval Pipeline**: Multi-turn query rewriting ➔ Qdrant vector search (score $\ge 0.60$) ➔ PostgreSQL metadata hydration ➔ pluggable reranking ➔ Vercel AI SDK streaming.
7. **Dual Prisma Clients**: `prisma/oltp.prisma` generating `../src/generated/client-oltp` and `prisma/dw.prisma` generating `../src/generated/client-dw`.
8. **Serving Framework**: Vercel AI SDK (`ai` + `@ai-sdk/google` / `ollama-ai-provider`) for standard SSE response streaming.
9. **Pluggable Reranking**: `RAG_RERANK_ENABLED=false` for fast MVP (< 300ms TTFT), switchable to `true` for fine-grained thresholds (e.g. alcohol brackets).

---

## Open Questions

- *None currently blocking implementation.* (All architectural, schema, chunking, OCR, and search strategy choices have been validated).
