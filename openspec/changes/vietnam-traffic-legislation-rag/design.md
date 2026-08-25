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
- **Decision**: Ingestion pipeline lives in `rag-ingestion/` (Python FastAPI + LlamaIndex), while real-time retrieval lives in `apps/backend` (Express.js + TypeScript).
- **Toolchain & Packaging (`rag-ingestion/`)**:
  - Package & Project Manager: `uv` (fast Rust-based package manager and resolver).
  - Dependency Management: `pyproject.toml` with reproducible lockfile (`uv.lock`).
  - Static Analysis & Type Checking: `pyrefly` (configured in `pyproject.toml`).
  - Containerization: Multi-stage `Dockerfile` utilizing `ghcr.io/astral-sh/uv`.
- **Rationale**: Python provides superior document AI, OCR, and LlamaIndex AST parsing abstractions. `uv` ensures sub-second dependency installation and deterministic environments. Express acts as the single low-latency API gateway, handling authentication, rate limiting, and SSE streaming.
- **Alternatives Considered**:
  - *All-in-Node.js*: Heavy OCR and complex legal AST parsing in TypeScript is brittle and lacks rich Document AI libraries.
  - *All-in-Python*: Bypasses the unified Express API gateway and duplicates auth/session management.
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

---

## Data Models & Schema (`prisma/oltp.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/client-oltp"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model knowledge_base {
  id                String               @id @default(uuid()) @db.Uuid
  code              String               @unique @db.VarChar(50)
  name              String               @db.VarChar(255)
  qdrant_collection String               @db.VarChar(100)
  documents         knowledge_document[]
  chat_sessions     chat_session[]
  created_at        DateTime             @default(now())
}

model knowledge_document {
  id                String               @id @default(uuid()) @db.Uuid
  kb_id             String               @db.Uuid
  code              String               @db.VarChar(100)
  title             String               @db.VarChar(500)
  source_url        String?              @db.Text
  metadata          Json?
  chunks            knowledge_chunk[]
  knowledge_base    knowledge_base       @relation(fields: [kb_id], references: [id], onDelete: Cascade)
  created_at        DateTime             @default(now())

  @@unique([kb_id, code])
}

model knowledge_chunk {
  id                String               @id @default(uuid()) @db.Uuid
  document_id       String               @db.Uuid
  chunk_index       Int
  breadcrumb        String?              @db.VarChar(500)
  content           String               @db.Text
  qdrant_point_id   String               @unique @db.Uuid
  metadata          Json?
  document          knowledge_document   @relation(fields: [document_id], references: [id], onDelete: Cascade)
  created_at        DateTime             @default(now())

  @@index([document_id])
}

model chat_session {
  id                String               @id @default(uuid()) @db.Uuid
  kb_id             String               @db.Uuid
  user_id           String?              @db.Uuid
  title             String               @default("Cuộc trò chuyện mới")
  messages          chat_message[]
  knowledge_base    knowledge_base       @relation(fields: [kb_id], references: [id], onDelete: Cascade)
  created_at        DateTime             @default(now())
  updated_at        DateTime             @default(now()) @updatedAt
}

model chat_message {
  id                String               @id @default(uuid()) @db.Uuid
  session_id        String               @db.Uuid
  role              String               @db.VarChar(20)
  content           String               @db.Text
  citations         Json?
  latency_ms        Int?
  tokens_used       Int?
  feedback          chat_feedback?
  session           chat_session         @relation(fields: [session_id], references: [id], onDelete: Cascade)
  created_at        DateTime             @default(now())

  @@index([session_id])
}

model chat_feedback {
  id                String               @id @default(uuid()) @db.Uuid
  message_id        String               @unique @db.Uuid
  rating            Int                  @db.SmallInt
  comment           String?              @db.Text
  message           chat_message         @relation(fields: [message_id], references: [id], onDelete: Cascade)
  created_at        DateTime             @default(now())
}
```

---

## Risks / Trade-offs

- **[Risk: Local Ollama `bge-m3` latency on cold starts]** → *Mitigation*: Run Ollama service with `OLLAMA_KEEP_ALIVE=-1` in background to prevent model offloading from VRAM/RAM.
- **[Risk: Multi-Prisma client compilation overhead]** → *Mitigation*: Separate scripts in `package.json` (`prisma:gen:oltp`, `prisma:gen:dw`), emit to isolated generated folders outside `node_modules/@prisma/client`.
- **[Risk: Discrepancy between amended decrees (e.g. NĐ 123 amending NĐ 100)]** → *Mitigation*: Ingestion parser marks replaced clauses with `is_amended: true` and points to the updated clause in Nghị định 123.
- **[Risk: LLM hallucination on fine amounts]** → *Mitigation*: Strict system prompt instruction + fine summary cards extracted directly from hydrated SQL metadata rather than generated purely by LLM token prediction.
