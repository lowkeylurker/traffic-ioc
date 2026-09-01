## Context

Smart Traffic IOC operates a dual-engine architecture: a PostgreSQL/PostGIS Kimball Star Schema Data Warehouse (`dw.prisma` + raw SQL pool) for traffic telemetry and historical analytics, and an operational layer for real-time services. Integrating Vietnamese traffic legislation Q&A requires high-precision structural legal parsing, vector similarity retrieval, transactional chat history, and streaming delivery without degrading or contaminating the OLAP data warehouse.

## Goals / Non-Goals

**Goals:**
- Implement an isolated, asynchronous document ingestion microservice (`rag-ingestion/`) with Google Gemini Flash OCR, LlamaIndex, and local Ollama `BAAI/bge-m3` embeddings.
- Deploy a dedicated Qdrant vector database (`vietnam_traffic_laws` collection) with 1024-dimension Cosine distance and metadata payload indexing.
- Establish an isolated OLTP PostgreSQL database with a dedicated Prisma client (`oltpPrisma`) in `apps/backend`.
- Build a universal RAG orchestrator in `apps/backend` using Vercel AI SDK (`ai`), supporting Google Gemini Flash (cloud) and Ollama Qwen 2.5 (local) with Server-Sent Events (SSE) streaming.
- Deliver an interactive commuter chat assistant in `apps/user-web` with real-time SSE token rendering, citation cards, and feedback mechanisms.

**Non-Goals:**
- Automated fine payment processing or driver license suspension execution.
- Ingesting general non-traffic legal codes (e.g. Civil Code, Penal Code).
- Modifying existing OLAP traffic telemetry tables (`dim_segment`, `fact_traffic_flow`).

## Decisions

### 1. Two-Stage Service Split: Python FastAPI vs Express Gateway
- **Decision**: Ingestion pipeline lives in `rag-ingestion/` (Python FastAPI + LlamaIndex), while real-time retrieval lives in `apps/backend` (Express.js + TypeScript). Inter-service communication for asynchronous document ingestion progress uses **Redis Pub/Sub** (`rag:ingestion:events`).
- **Toolchain & Packaging (`rag-ingestion/`)**:
  - Package & Project Manager: `uv` (fast Rust-based package manager and resolver).
  - Dependency Management: `pyproject.toml` with reproducible lockfile (`uv.lock`), including `redis` for asynchronous event publishing.
  - Static Analysis & Type Checking: `pyrefly` (configured in `pyproject.toml`).
  - Containerization: Multi-stage `Dockerfile` utilizing `ghcr.io/astral-sh/uv`.
- **Rationale**: Python provides superior document AI, OCR, and LlamaIndex AST parsing abstractions. `uv` ensures sub-second dependency installation and deterministic environments. Express acts as the single low-latency API gateway, handling authentication, rate limiting, and SSE streaming. Redis Pub/Sub completely decouples the long-running ingestion lifecycle from HTTP socket limits, allowing multi-instance backend scaling and eliminating reverse-proxy timeout risks during heavy OCR.
- **Alternatives Considered**:
  - *All-in-Node.js*: Heavy OCR and complex legal AST parsing in TypeScript is brittle and lacks rich Document AI libraries.
  - *All-in-Python*: Bypasses the unified Express API gateway and duplicates auth/session management.
  - *Direct HTTP Point-to-Point Streaming*: Vulnerable to proxy timeouts on large scanned documents and does not broadcast across multiple load-balanced Node.js instances.
  - *Legacy pip + requirements.txt*: Slower builds, lacks lockfile reproducibility, and does not enforce modern PEP 621 standards.

### 2. Dual Database Architecture & Multi-Prisma Configuration
- **Decision**: Physically separate the existing OLAP Data Warehouse (`traffic_ioc_dw`) from the operational RAG database (`traffic_ioc_oltp`). Configure `apps/backend` with two independent Prisma clients:
  - `prisma/oltp.prisma` generating `../src/generated/client-oltp` (`oltpPrisma`).
  - `prisma/dw.prisma` generating `../src/generated/client-dw` (`dwPrisma`).
- **Rationale**: Keeps the Kimball Star Schema clean from transactional chat records, prevents connection pool exhaustion, and avoids Prisma migration conflicts with partitioned DW tables.
- **DB Engine Query Path**:
  - *Prisma ORM (`oltpPrisma`)*: Used for all CRUD operations on `knowledge_base`, `knowledge_document`, `knowledge_chunk`, `chat_session`, and `chat_message`.
  - *Raw PostGIS Pool (`db.ts`)*: Retained for spatial corridor/segment queries on the OLAP DW.

### 3. Dedicated Vector Store: Qdrant
- **Decision**: Use Qdrant vector database (`qdrant/qdrant:latest`) for dense vector search instead of pgvector in the OLAP DB.
- **Rationale**: Sub-millisecond HNSW search, rich payload pre-filtering by `vehicle_types` and `violation_group`, and native support in both LlamaIndex (Python) and `@qdrant/js-client-rest` (Node.js).
- **Vector Spec**: 1024 dimensions (`BAAI/bge-m3`), Cosine distance.

### 4. Structural Legal AST Chunking with Breadcrumbs
- **Decision**: Custom LlamaIndex `LegalNodeParser` splits documents hierarchically (Chương ➔ Điều ➔ Khoản ➔ Điểm) and enriches every chunk with breadcrumb headers, fine brackets from parent clauses, and cross-linked license revocation penalties.
- **Rationale**: Vietnamese traffic decrees are deterministic. Statistical semantic chunking cuts fine amounts from violation clauses. AST chunking guarantees 100% self-contained chunks and exact legal citations.

### 5. Adaptive OCR Loader via Google Gemini Flash
- **Decision**: Scanned PDFs with no digital text layer are transcribed into structured Markdown using Google Gemini Flash before entering the AST parser.
- **Rationale**: Gemini Flash flawlessly transcribes Vietnamese diacritics, multi-column decree layouts, and tables even with red stamps and signatures.

### 6. Retrieval Orchestration via Vercel AI SDK
- **Decision**: Use Vercel AI SDK (`ai` + `@ai-sdk/google` / `ollama-ai-provider`) in `apps/backend` to orchestrate streaming responses (`streamText()`).
- **Rationale**: First-class streaming primitives for Express response piping (`pipeDataStreamToResponse`), unified adapter across Gemini Flash and Ollama Qwen 2.5, and type-safe Zod structured outputs.
- **Retrieval Pipeline Steps**:
  1. *Query Pre-processing*: Multi-turn context rewriting + Ollama `bge-m3` embedding.
  2. *Qdrant Vector Search*: Cosine similarity (Top-K = 4–5) with score threshold $\ge 0.60$ and payload filters.
  3. *OLTP Hydration*: Fetch full chunk text, decree code, and fine ranges from PostgreSQL by UUIDs.
  4. *Pluggable Reranker*: `RAG_RERANK_ENABLED=false` for MVP (can toggle `true` for cross-encoder).
  5. *Streaming Generation*: Vercel AI SDK streams citations badge event followed by token deltas.

### 7. Frontend State & Component Boundaries (`apps/user-web`)
- **Server vs. Client Components**:
  - `app/assistant/page.tsx`: Server Component for metadata and initial knowledge base catalogs.
  - `components/assistant/chat-box.tsx`: Client Component (`"use client"`) managing real-time SSE stream reading, citation drawer state, and chat input.
- **TanStack Query Key Factory**:
  - `assistantKeys.all`: `['assistant']`
  - `assistantKeys.sessions()`: `['assistant', 'sessions']`
  - `assistantKeys.session(id)`: `['assistant', 'session', id]`
- **Worker Offloading**: Complex Markdown/citation parsing offloaded if payload exceeds 100KB.

### 8. Admin Law Document Management & Redis Pub/Sub Event Streaming (`apps/admin-web`)
- **Portal Page**: `src/pages/LawDocumentsPage.tsx` mounted at `/law-documents` and guarded by `RoleGuard(requiredRole="admin")`.
- **UI Architecture (Ant Design + React 18)**:
  - `DocumentTable`: Tabular view of ingested legal documents showing code, title, file type, status tag (`PROCESSING`, `COMPLETED`, `FAILED`), chunk count, creation date, and row actions.
  - `DocumentUploadModal`: File drag-and-drop (`.docx`, digital `.pdf`, scanned `.pdf`) with metadata inputs and a live SSE Progress Stepper:
    - Step 1: `FILE_LOADED` / `FORMAT_DETECTED` (15%)
    - Step 2: `AST_PARSED` / `OCR_PROCESSING` (40%)
    - Step 3: `EMBEDDINGS_GENERATED` (Ollama BGE-M3) (70%)
    - Step 4: `STORAGE_SYNCED` (Qdrant & Postgres OLTP) (90%)
    - Step 5: `COMPLETED` (100%) with real-time log event stream.
  - `ChunkInspectorDrawer`: Slide-out drawer displaying chunk breadcrumb hierarchies (*Chương ➔ Điều ➔ Khoản ➔ Điểm*), fine brackets, vehicle tags, license penalties, and Qdrant point IDs.
  - `GlobalIngestionTracker`: Global floating status indicator mounted in `MainLayout.tsx` backed by `LawIngestionProvider` context and custom hook `useLawIngestion`.
  - `Delete & Reindex`: Delete cascades OLTP chunks and purges Qdrant vectors by `doc_code` filter; Reindex re-dispatches document parsing.
- **Backend Admin Gateway & Redis Event Bus (`apps/backend`)**:
  - `GET /api/v1/admin/rag/documents`: List documents with pagination and status.
  - `GET /api/v1/admin/rag/documents/:docId/chunks`: Fetch chunks for a document.
  - `POST /api/v1/admin/rag/documents/upload`: Multi-part upload handler triggering asynchronous ingestion.
  - `GET /api/v1/admin/rag/documents/stream`: Global Server-Sent Events stream fed by Redis Pub/Sub subscription on topic `rag:ingestion:events`.
  - `GET /api/v1/admin/rag/documents/jobs/:jobId/stream`: Job-specific Server-Sent Events stream.
  - `DELETE /api/v1/admin/rag/documents/:docId`: Atomic deletion across OLTP DB and Qdrant vectors.
  - `POST /api/v1/admin/rag/documents/:docId/reindex`: Re-trigger ingestion pipeline.
- **Messaging Contract (`rag:ingestion:events`)**:
  ```json
  {
    "jobId": "job-uuid",
    "docCode": "100/2019/ND-CP",
    "event": "progress | complete | error",
    "data": {
      "step": "AST_PARSED",
      "percent": 40,
      "message": "Đã phân tích 120 điều luật và trích xuất cấu trúc pháp lý",
      "chunks_count": 340,
      "error": null
    }
  }
  ```

---

## Data Models & Schema (`prisma/oltp.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/client-oltp"
}

datasource db {
  provider = "postgresql"
  url      = env("OLTP_DATABASE_URL")
}

model KnowledgeBase {
  id                String              @id @default(uuid()) @db.Uuid
  code              String              @unique @db.VarChar(50)
  name              String              @db.VarChar(255)
  qdrantCollection  String              @map("qdrant_collection") @db.VarChar(100)
  documents         KnowledgeDocument[]
  chatSessions      ChatSession[]
  createdAt         DateTime            @default(now()) @map("created_at")

  @@map("knowledge_base")
}

model KnowledgeDocument {
  id            String           @id @default(uuid()) @db.Uuid
  kbId          String           @map("kb_id") @db.Uuid
  code          String           @db.VarChar(100)
  title         String           @db.VarChar(500)
  sourceUrl     String?          @map("source_url") @db.Text
  fileName      String?          @map("file_name") @db.VarChar(255)
  status        String           @default("COMPLETED") @db.VarChar(30)
  chunkCount    Int              @default(0) @map("chunk_count")
  errorMessage  String?          @map("error_message") @db.Text
  metadata      Json?
  chunks        KnowledgeChunk[]
  knowledgeBase KnowledgeBase    @relation(fields: [kbId], references: [id], onDelete: Cascade)
  createdAt     DateTime         @default(now()) @map("created_at")
  updatedAt     DateTime         @default(now()) @updatedAt @map("updated_at")

  @@unique([kbId, code])
  @@map("knowledge_document")
}

model KnowledgeChunk {
  id            String            @id @default(uuid()) @db.Uuid
  documentId    String            @map("document_id") @db.Uuid
  chunkIndex    Int               @map("chunk_index")
  breadcrumb    String?           @db.VarChar(500)
  content       String            @db.Text
  qdrantPointId String            @unique @map("qdrant_point_id") @db.Uuid
  metadata      Json?
  document      KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  createdAt     DateTime          @default(now()) @map("created_at")

  @@index([documentId])
  @@map("knowledge_chunk")
}

model ChatSession {
  id            String         @id @default(uuid()) @db.Uuid
  kbId          String         @map("kb_id") @db.Uuid
  userId        String?        @map("user_id") @db.Uuid
  title         String         @default("Cuộc trò chuyện mới")
  messages      ChatMessage[]
  knowledgeBase KnowledgeBase  @relation(fields: [kbId], references: [id], onDelete: Cascade)
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @default(now()) @updatedAt @map("updated_at")

  @@map("chat_session")
}

model ChatMessage {
  id          String        @id @default(uuid()) @db.Uuid
  sessionId   String        @map("session_id") @db.Uuid
  role        String        @db.VarChar(20)
  content     String        @db.Text
  citations   Json?
  latencyMs   Int?          @map("latency_ms")
  tokensUsed  Int?          @map("tokens_used")
  feedback    ChatFeedback?
  session     ChatSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  createdAt   DateTime      @default(now()) @map("created_at")

  @@index([sessionId])
  @@map("chat_message")
}

model ChatFeedback {
  id        String      @id @default(uuid()) @db.Uuid
  messageId String      @unique @map("message_id") @db.Uuid
  rating    Int         @db.SmallInt
  comment   String?     @db.Text
  message   ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  createdAt DateTime    @default(now()) @map("created_at")

  @@map("chat_feedback")
}
```

---

## Risks / Trade-offs

- **[Risk: Local Ollama `bge-m3` latency on cold starts]** → *Mitigation*: Run Ollama service with `OLLAMA_KEEP_ALIVE=-1` in background to prevent model offloading from VRAM/RAM.
- **[Risk: Multi-Prisma client compilation overhead]** → *Mitigation*: Separate scripts in `package.json` (`prisma:gen:oltp`, `prisma:gen:dw`), emit to isolated generated folders outside `node_modules/@prisma/client`.
- **[Risk: Discrepancy between amended decrees (e.g. NĐ 123 amending NĐ 100)]** → *Mitigation*: Ingestion parser marks replaced clauses with `is_amended: true` and points to the updated clause in Nghị định 123.
- **[Risk: LLM hallucination on fine amounts]** → *Mitigation*: Strict system prompt instruction + fine summary cards extracted directly from hydrated SQL metadata rather than generated purely by LLM token prediction.
