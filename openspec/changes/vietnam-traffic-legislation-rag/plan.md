# Vietnam Traffic Legislation Multi-RAG Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a production-ready, verified Vietnamese Traffic Legislation Multi-RAG platform with Python FastAPI ingestion (LlamaIndex + Gemini Flash OCR + Ollama bge-m3), Qdrant vector storage, dual Prisma clients in Express backend, Vercel AI SDK SSE streaming, and Next.js 16 citizen chat interface.

**Architecture:** A decoupled two-stage architecture where `rag-ingestion/` (Python) parses and indexes structured decrees into Qdrant and an operational PostgreSQL DB, while `apps/backend` (Express) serves low-latency hybrid retrieval and Server-Sent Events (SSE) streaming to `apps/user-web` (Next.js).

**Tech Stack:**
- Python 3.10+, FastAPI, LlamaIndex, `google-generativeai`, `qdrant-client`, `ollama`, `sqlalchemy`, `asyncpg`
- Node.js / TypeScript, Express.js, Prisma ORM, `@qdrant/js-client-rest`, Vercel AI SDK (`ai`, `@ai-sdk/google`, `ollama-ai-provider`)
- Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, TanStack Query
- Qdrant Vector Database, Dual PostgreSQL instances (OLAP DW + OLTP DB)

---

## Task 1: Infrastructure & Shared Contracts

### Task 1.1: Configure Qdrant & OLTP DB in `docker-compose.yml`
- [ ] **Step 1:** Add `qdrant` service (`image: qdrant/qdrant:latest`, ports `6333:6333`, volume `qdrant_data:/qdrant/storage`) to `docker-compose.yml`.
- [ ] **Step 2:** Add secondary PostgreSQL database service `postgres_oltp` (or setup distinct database `traffic_ioc_oltp` on port `5433` or standard port) in `docker-compose.yml`.
- [ ] **Step 3:** Start containers via `docker-compose up -d qdrant` and verify Qdrant health check at `http://localhost:6333/healthz`.
- [ ] **Step 4:** Commit point: `[INFRA] Add: Qdrant and OLTP PostgreSQL services to docker-compose`.

### Task 1.2: Define Shared Schemas in `packages/shared`
- [ ] **Step 1:** Create `packages/shared/src/schemas/rag.ts` exporting Zod schemas and TypeScript types for:
  - `RagChatRequestSchema` (`message`, `sessionId`, `vehicleFilter`)
  - `LegalCitationSchema` (`docCode`, `articleNumber`, `clauseNumber`, `pointCode`, `breadcrumb`, `fineMin`, `fineMax`, `suspensionMonths`)
  - `RagFeedbackSchema` (`messageId`, `rating`, `comment`)
- [ ] **Step 2:** Export all schemas and types from `packages/shared/src/index.ts`.
- [ ] **Step 3:** Run `pnpm --filter=@traffic-ioc/shared build` and verify TypeScript compilation passes.
- [ ] **Step 4:** Commit point: `[SHARED] Add: RAG chat request, citation, and feedback Zod schemas`.

---

## Task 2: Document Ingestion Service (`rag-ingestion/`)

### Task 2.1: Microservice Scaffolding with uv & pyrefly
- [ ] **Step 1:** Initialize `rag-ingestion/` using `uv init --app --python 3.11`, configure `pyproject.toml` with dependencies (FastAPI, LlamaIndex, `google-generativeai`, `qdrant-client`, `ollama`, `sqlalchemy`, `asyncpg`, `pdfplumber`, `python-docx`) and `[tool.pyrefly]` configuration.
- [ ] **Step 2:** Create `rag-ingestion/src/config.py` using Pydantic `BaseSettings` for database URLs, Qdrant host, Ollama URL (`http://localhost:11434`), and Gemini API Key.
- [ ] **Step 3:** Create `rag-ingestion/src/main.py` initializing FastAPI app with CORS middleware and healthcheck endpoint (`GET /health`).
- [ ] **Step 4:** Create `Dockerfile` utilizing `ghcr.io/astral-sh/uv:python3.11-bookworm-slim` for multi-stage cached builds.
- [ ] **Step 5:** Verify static types and service boot with `uv run pyrefly check` and `uv run uvicorn src.main:app --port 8001`.
- [ ] **Step 6:** Commit point: `[PIPELINE] Scaffold: Python FastAPI rag-ingestion microservice with uv and pyrefly`.

### Task 2.2: Adaptive Loader & Gemini Flash OCR
- [ ] **Step 1:** Implement `src/parsers/document_detector.py` using `pymupdf` to calculate text density and determine if a file is a digital document or scanned image.
- [ ] **Step 2:** Implement `src/parsers/ocr_vision_parser.py` using `google-generativeai` to transcribe multi-page scanned legal PDFs into structured Markdown with legal headings (`# CHƯƠNG`, `## ĐIỀU`, `### Khoản`, `- Điểm`).
- [ ] **Step 3:** Implement `src/parsers/docx_parser.py` and `src/parsers/pdf_digital_parser.py` for direct digital document reading.
- [ ] **Step 4:** Write unit tests in `tests/test_parsers.py` verifying detection and transcription.
- [ ] **Step 5:** Commit point: `[PIPELINE] Add: Adaptive document loader with Gemini Flash OCR transcriber`.

### Task 2.3: Hierarchical Legal AST Parser & Breadcrumb Enricher
- [ ] **Step 1:** Implement `src/parsers/legal_ast.py` subclassing LlamaIndex `NodeParser` to split legal Markdown into structural tree nodes: Chương > Điều > Khoản > Điểm.
- [ ] **Step 2:** Implement `src/enrichers/chunk_composer.py` to extract fine ranges (`min_fine`, `max_fine`), vehicle tags (`motorbike`, `car`, `truck`), and cross-link supplementary penalties (e.g. license suspension in later clauses) into self-contained text nodes.
- [ ] **Step 3:** Verify with test input from *Nghị định 100/2019/NĐ-CP (Điều 6)* to confirm breadcrumbs and fine ranges are properly injected.
- [ ] **Step 4:** Commit point: `[PIPELINE] Add: LlamaIndex LegalNodeParser and context breadcrumb enricher`.

### Task 2.4: Embedding & Dual-Store Sync
- [ ] **Step 1:** Implement `src/services/embedder.py` wrapping Ollama client to generate 1024-dimension `BAAI/bge-m3` vectors.
- [ ] **Step 2:** Implement `src/services/oltp_sync.py` with SQLAlchemy async session to upsert records into `knowledge_document` and `knowledge_chunk` tables.
- [ ] **Step 3:** Implement `src/services/qdrant_sync.py` to initialize Qdrant collection `vietnam_traffic_laws` (1024-dim, Cosine distance) and upsert point payloads matching the chunk UUIDs.
- [ ] **Step 4:** Commit point: `[PIPELINE] Add: Ollama bge-m3 embedder and dual-store sync for Postgres and Qdrant`.

### Task 2.5: Ingestion API Endpoints
- [ ] **Step 1:** Create `src/api/routes/ingest.py` implementing `POST /api/v1/ingest/traffic-law/process` (upload + index) and `GET /api/v1/documents`.
- [ ] **Step 2:** Add seed script `src/scripts/seed_traffic_laws.py` to ingest sample decree files.
- [ ] **Step 3:** Execute seed script and verify points exist in Qdrant collection via `curl http://localhost:6333/collections/vietnam_traffic_laws`.
- [ ] **Step 4:** Commit point: `[PIPELINE] Add: Ingestion API endpoints and decree seed script`.

---

## Task 3: Backend Multi-Prisma & RAG Gateway (`apps/backend`)

### Task 3.1: Dual Prisma Setup
- [ ] **Step 1:** Create `apps/backend/prisma/oltp.prisma` with `output = "../src/generated/client-oltp"` containing `knowledge_base`, `knowledge_document`, `knowledge_chunk`, `chat_session`, `chat_message`, and `chat_feedback`.
- [ ] **Step 2:** Rename/move existing DW schema to `apps/backend/prisma/dw.prisma` with `output = "../src/generated/client-dw"`.
- [ ] **Step 3:** Update `apps/backend/package.json` with scripts:
  - `"prisma:gen": "prisma generate --schema=prisma/oltp.prisma && prisma generate --schema=prisma/dw.prisma"`
  - `"prisma:migrate:oltp": "prisma migrate dev --schema=prisma/oltp.prisma"`
- [ ] **Step 4:** Run `pnpm --filter=@traffic-ioc/backend prisma:gen` and verify both clients compile without errors.
- [ ] **Step 5:** Commit point: `[BE] Configure: Dual Prisma clients for OLTP app DB and OLAP data warehouse`.

### Task 3.2: Database & Qdrant Singletons
- [ ] **Step 1:** Create `src/config/oltp-prisma.ts` exporting singleton `oltpPrisma`.
- [ ] **Step 2:** Create `src/config/dw-prisma.ts` exporting singleton `dwPrisma`.
- [ ] **Step 3:** Create `src/rag/core/qdrant.client.ts` initializing `@qdrant/js-client-rest` with `process.env.QDRANT_URL`.
- [ ] **Step 4:** Commit point: `[BE] Add: Prisma and Qdrant client singletons`.

### Task 3.3: LLM Gateway & Vercel AI SDK
- [ ] **Step 1:** Install `ai`, `@ai-sdk/google`, and `ollama-ai-provider` in `apps/backend`.
- [ ] **Step 2:** Create `src/rag/core/llm-gateway.ts` providing unified streaming factory for Google Gemini Flash and Ollama Qwen 2.5.
- [ ] **Step 3:** Create `src/rag/core/embedder.service.ts` connecting to local Ollama `bge-m3` endpoint.
- [ ] **Step 4:** Commit point: `[BE] Add: Vercel AI SDK LLM gateway and query embedding service`.

### Task 3.4: RAG Orchestrator & Traffic Law Strategy
- [ ] **Step 1:** Create `src/rag/strategies/traffic-law.strategy.ts` defining traffic law system prompt, citation extraction, and negative grounding constraints.
- [ ] **Step 2:** Create `src/rag/core/rag-orchestrator.ts` implementing the 5-step retrieval pipeline: query rewrite -> Ollama embedding -> Qdrant search (score $\ge 0.60$) -> OLTP hydration -> Vercel AI SDK stream.
- [ ] **Step 3:** Commit point: `[BE] Add: RAG orchestrator and traffic law prompt strategy`.

### Task 3.5: RAG Controller & SSE Streaming Routes
- [ ] **Step 1:** Create `src/controllers/rag.controller.ts` with `streamChat` and `submitFeedback` handlers.
- [ ] **Step 2:** Create `src/routes/rag.routes.ts` mounting `POST /api/v1/rag/traffic-law/chat` and `POST /api/v1/rag/feedback`.
- [ ] **Step 3:** Mount RAG router in `src/app.ts` under `/api/v1/rag`.
- [ ] **Step 4:** Test endpoint with `curl -N -X POST http://localhost:5000/api/v1/rag/traffic-law/chat -H "Content-Type: application/json" -d '{"message": "Vượt đèn đỏ xe máy phạt bao nhiêu?"}'` and verify SSE streaming.
- [ ] **Step 5:** Commit point: `[BE] Add: RAG chat SSE streaming controller and feedback route`.

---

## Task 4: Citizen Legal Assistant Portal (`apps/user-web`)

### Task 4.1: Assistant Page & Query Keys
- [ ] **Step 1:** Create `src/lib/query-keys/assistant.keys.ts` with TanStack Query key factory.
- [ ] **Step 2:** Create `src/app/assistant/page.tsx` as Server Component rendering page shell, title, and initial disclaimer.
- [ ] **Step 3:** Commit point: `[FE] Add: Assistant page shell and query key factory`.

### Task 4.2: Interactive Chat UI & SSE Stream Reader
- [ ] **Step 1:** Create `src/components/assistant/chat-box.tsx` with `"use client"`.
- [ ] **Step 2:** Implement custom hook `src/hooks/use-rag-chat.ts` parsing incoming SSE events (`event: citations`, `event: token`, `event: done`).
- [ ] **Step 3:** Build `src/components/assistant/message-list.tsx` and `src/components/assistant/prompt-input.tsx` with suggested prompt pills.
- [ ] **Step 4:** Commit point: `[FE] Add: Chat window and real-time SSE stream reader hook`.

### Task 4.3: Citation Drawer & Fine Summary Cards
- [ ] **Step 1:** Create `src/components/assistant/citation-card.tsx` rendering clickable legal citation badges.
- [ ] **Step 2:** Build `src/components/assistant/citation-drawer.tsx` displaying full article excerpt, clause, decree code, and official source link.
- [ ] **Step 3:** Build `src/components/assistant/fine-card.tsx` displaying clear visual penalty ranges (VND) and license suspension duration.
- [ ] **Step 4:** Commit point: `[FE] Add: Citation badges, citation detail drawer, and fine summary cards`.

### Task 4.4: Feedback Actions & Frontend Build Check
- [ ] **Step 1:** Create `src/components/assistant/feedback-action.tsx` with thumbs up / thumbs down mutation.
- [ ] **Step 2:** Run `pnpm --filter=@traffic-ioc/user-web build:check` and verify zero TypeScript errors.
- [ ] **Step 3:** Commit point: `[FE] Add: Message feedback action and verify user-web build`.

---

## Task 5: End-to-End Verification

### Task 5.1: Monorepo Typecheck & Lint
- [ ] **Step 1:** Run `pnpm build:check` across all packages and apps.
- [ ] **Step 2:** Run `pnpm lint` and fix any linting warnings.
- [ ] **Step 3:** Commit point: `[DOCS] Update: Verification logs for monorepo typecheck`.

### Task 5.2: End-to-End Ingestion & Retrieval Validation
- [ ] **Step 1:** Ingest *Nghị định 100/2019/NĐ-CP* and *Nghị định 123/2021/NĐ-CP* via `rag-ingestion/`.
- [ ] **Step 2:** Send query *"Đi xe máy không đội mũ bảo hiểm phạt bao nhiêu tiền?"* from `apps/user-web`.
- [ ] **Step 3:** Verify UI renders streamed text, fine range card (400.000đ - 600.000đ), and citation badge (Điều 6 Khoản 2 Điểm b NĐ 100).
- [ ] **Step 4:** Commit point: `[DOCS] Complete: End-to-end Vietnamese traffic legislation RAG verification`.

---

## Task 6: Admin Law Document Management & SSE Streaming

### Task 6.1: Update OLTP Schema with PascalCase Models
- [ ] **Step 1:** Update `apps/backend/prisma/oltp.prisma` with PascalCase model names (`KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk`, `ChatSession`, `ChatMessage`, `ChatFeedback`) and `@map`/`@@map` database mappings.
- [ ] **Step 2:** Run `pnpm --filter=@traffic-ioc/backend prisma:gen` to generate updated `client-oltp` and update existing backend imports if needed.
- [ ] **Step 3:** Commit point: `[BE] Refactor: Update OLTP Prisma schema to PascalCase models`.

### Task 6.2: Streaming Ingestion Endpoint in `rag-ingestion/`
- [ ] **Step 1:** Add `POST /api/v1/ingest/traffic-law/process-stream` in `rag-ingestion/src/api/routes/ingest.py` utilizing Python `StreamingResponse` with `text/event-stream`.
- [ ] **Step 2:** Emit progress events at milestones: `15% - FILE_LOADED`, `40% - AST_PARSED`, `70% - EMBEDDINGS_GENERATED`, `90% - STORAGE_SYNCED`, `100% - COMPLETED`.
- [ ] **Step 3:** Commit point: `[PIPELINE] Add: Real-time SSE streaming ingestion endpoint in rag-ingestion`.

### Task 6.3: Admin Document Gateway Controller & SSE Proxy (`apps/backend`)
- [ ] **Step 1:** Create `src/controllers/admin-rag.controller.ts` with handlers for `listDocuments`, `getDocumentChunks`, `uploadDocument`, `streamJobProgress`, `deleteDocument`, and `reindexDocument`.
- [ ] **Step 2:** Implement Qdrant vector deletion by `doc_code` payload filter upon document deletion.
- [ ] **Step 3:** Create `src/routes/admin-rag.routes.ts` and mount under `/api/v1/admin/rag/documents`.
- [ ] **Step 4:** Commit point: `[BE] Add: Admin law document management gateway and SSE streaming proxy`.

### Task 6.4: Admin Web Navigation & LawDocumentsPage (`apps/admin-web`)
- [ ] **Step 1:** Add `/law-documents` route in `apps/admin-web/src/App.tsx` and sidebar navigation item with `<FileTextOutlined />` in `apps/admin-web/src/layouts/MainLayout.tsx`.
- [ ] **Step 2:** Create `apps/admin-web/src/pages/LawDocumentsPage.tsx` with Ant Design table displaying document code, title, file type, status tags, chunk count, and action buttons.
- [ ] **Step 3:** Commit point: `[FE] Add: LawDocumentsPage and sidebar navigation in admin-web`.

### Task 6.5: Document Upload Modal with Live SSE Stepper (`apps/admin-web`)
- [ ] **Step 1:** Build `apps/admin-web/src/components/admin-rag/DocumentUploadModal.tsx` with Ant Design `Upload.Dragger`, metadata form inputs, and Force OCR toggle.
- [ ] **Step 2:** Implement live SSE connection to `/api/v1/admin/rag/documents/jobs/:jobId/stream` rendering real-time stepper progress (`Progress` / `Steps`) and event log console.
- [ ] **Step 3:** Commit point: `[FE] Add: Document upload modal with live SSE progress stepper in admin-web`.

### Task 6.6: Chunk Inspector Drawer & Actions (`apps/admin-web`)
- [ ] **Step 1:** Build `apps/admin-web/src/components/admin-rag/ChunkInspectorDrawer.tsx` displaying chunk breadcrumbs, fine ranges, vehicle tags, and full clause text.
- [ ] **Step 2:** Integrate delete confirmation modal (purging OLTP records & Qdrant vectors) and re-indexing mutation.
- [ ] **Step 3:** Commit point: `[FE] Add: Chunk inspector drawer and deletion/re-indexing actions in admin-web`.

### Task 6.7: Full Monorepo Typecheck & Build Verification
- [ ] **Step 1:** Run `pnpm build:check` across all packages and apps.
- [ ] **Step 2:** Verify `apps/admin-web`, `apps/backend`, `apps/user-web`, and `rag-ingestion`.
- [ ] **Step 3:** Commit point: `[DOCS] Complete: Admin law document management implementation and verification`.

---

## Task 7: Redis Pub/Sub Architecture Migration

### Task 7.1: Redis Event Publisher in `rag-ingestion`
- [ ] **Step 1:** Add `redis>=5.0.0` to `rag-ingestion/pyproject.toml` dependencies.
- [ ] **Step 2:** Implement `src/services/redis_publisher.py` with singleton Redis client broadcasting JSON payloads to `rag:ingestion:events`.
- [ ] **Step 3:** Update `src/pipeline.py` / `src/api/routes/ingest.py` to trigger asynchronous background task and publish progress at each milestone (`FILE_LOADED`, `FORMAT_DETECTED`, `OCR_PROCESSING`, `AST_PARSED`, `CHUNKS_ENRICHED`, `EMBEDDINGS_GENERATED`, `STORAGE_SYNCED`, `COMPLETED`, `ERROR`).
- [ ] **Step 4:** Commit point: `[PIPELINE] Add: Redis Pub/Sub progress event publisher in rag-ingestion`.

### Task 7.2: Redis Event Subscriber Service in `apps/backend`
- [ ] **Step 1:** Implement `src/services/rag-ingestion-events.service.ts` connecting to Redis with a dedicated subscriber client.
- [ ] **Step 2:** Subscribe to `rag:ingestion:events` on server start, parse incoming JSON messages, update `KnowledgeDocument` in OLTP database on completion/failure, and broadcast to `globalEmitter`.
- [ ] **Step 3:** Hook service startup and graceful teardown in `src/server.ts`.
- [ ] **Step 4:** Commit point: `[BE] Add: Redis Pub/Sub ingestion event subscriber service`.

### Task 7.3: Async Upload & Reindex Controller Refactoring
- [ ] **Step 1:** Update `uploadDocument` and `reindexDocument` in `src/controllers/admin-rag.controller.ts` to dispatch async requests to FastAPI and return `202 Accepted` with `jobId`.
- [ ] **Step 2:** Keep SSE endpoints (`/stream` and `/jobs/:jobId/stream`) piping directly from the Redis event bus.
- [ ] **Step 3:** Commit point: `[BE] Refactor: Asynchronous RAG ingestion endpoints backed by Redis Pub/Sub`.

### Task 7.4: Verification & Monorepo Build Check
- [ ] **Step 1:** Run backend unit tests (`pnpm --filter=@traffic-ioc/backend test`).
- [ ] **Step 2:** Run monorepo typecheck (`pnpm build:check`).
- [ ] **Step 3:** Validate OpenSpec change via `npx openspec validate vietnam-traffic-legislation-rag --type change`.
- [ ] **Step 4:** Commit point: `[DOCS] Complete: Redis Pub/Sub ingestion migration verification`.


