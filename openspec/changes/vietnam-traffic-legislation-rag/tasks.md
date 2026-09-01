## 1. Infrastructure & Shared Contracts

- [x] 1.1 Add Qdrant (`qdrant/qdrant:latest`) service and secondary OLTP PostgreSQL configuration to `docker-compose.yml` and verify container health via `docker-compose ps`
- [x] 1.2 Define shared Zod schemas and TypeScript interfaces for RAG chat requests, citation payloads, SSE stream event structures, and feedback in `packages/shared/src/schemas/rag.ts` and verify with `pnpm --filter=@traffic-ioc/shared build`

## 2. Document Ingestion Service (`rag-ingestion/`)

- [x] 2.1 Scaffold `rag-ingestion/` microservice using `uv` (`uv init`), `pyproject.toml`, `pyrefly` config, and `uv`-based `Dockerfile`, and verify startup via `uv run uvicorn`
- [x] 2.2 Implement adaptive document loader in `src/parsers/document_detector.py` and Google Gemini Flash OCR transcriber in `src/parsers/ocr_vision_parser.py` for scanned decree PDFs
- [x] 2.3 Implement custom LlamaIndex hierarchical `LegalNodeParser` in `src/parsers/legal_ast.py` and context breadcrumb enricher in `src/enrichers/chunk_composer.py` to extract fine ranges and cross-linked penalties
- [x] 2.4 Implement Ollama `bge-m3` embedding generator in `src/services/embedder.py`, OLTP PostgreSQL sync in `src/services/oltp_sync.py`, and Qdrant upsertion in `src/services/qdrant_sync.py`
- [x] 2.5 Implement FastAPI ingestion endpoints (`POST /api/v1/ingest/traffic-law/process`, `GET /api/v1/documents`) in `src/api/routes/ingest.py` and verify by indexing a test decree

## 3. Backend Multi-Prisma & RAG Gateway (`apps/backend`)

- [x] 3.1 Split Prisma configuration into `prisma/oltp.prisma` (generating `../src/generated/client-oltp`) and `prisma/dw.prisma` (generating `../src/generated/client-dw`), update `package.json` scripts, and verify typecheck via `pnpm --filter=@traffic-ioc/backend build:check`
- [x] 3.2 Implement singleton Prisma instances in `src/config/oltp-prisma.ts` and `src/config/dw-prisma.ts`, and initialize Qdrant client in `src/rag/core/qdrant.client.ts`
- [x] 3.3 Install Vercel AI SDK (`ai`, `@ai-sdk/google`, `ollama-ai-provider`), and build `src/rag/core/llm-gateway.ts` supporting Google Gemini Flash and Ollama Qwen 2.5
- [x] 3.4 Implement RAG orchestrator in `src/rag/core/rag-orchestrator.ts` and traffic legislation strategy in `src/rag/strategies/traffic-law.strategy.ts`
- [x] 3.5 Implement RAG controller and routes in `src/controllers/rag.controller.ts` and `src/routes/rag.routes.ts` (`POST /api/v1/rag/traffic-law/chat` SSE stream and `POST /api/v1/rag/feedback`), mount in `src/app.ts`, and verify via `curl`

## 4. Citizen Legal Assistant Portal (`apps/user-web`)

- [x] 4.1 Create Assistant page at `src/app/assistant/page.tsx` and query key factory in `src/lib/query-keys/assistant.keys.ts`
- [x] 4.2 Build interactive chat interface components (`ChatWindow`, `MessageList`, `PromptInput`) supporting real-time SSE token rendering in `src/components/assistant/`
- [x] 4.3 Build citation drawer and fine summary cards in `src/components/assistant/citation-card.tsx` to display verified decree articles and fine brackets
- [x] 4.4 Add message feedback action mutation (thumbs up / thumbs down) in `src/components/assistant/feedback-action.tsx` and verify with `pnpm --filter=@traffic-ioc/user-web build:check`

## 5. End-to-End Verification

- [x] 5.1 Run full monorepo typecheck and lint verification via `pnpm build:check && pnpm lint`
- [x] 5.2 Ingest a complete sample Vietnamese traffic regulation, submit a test chat query from the web UI, and verify citation cards and SSE streaming

## 6. Admin Law Document Management & SSE Streaming

- [x] 6.1 Update `prisma/oltp.prisma` with PascalCase models (`KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk`, `ChatSession`, `ChatMessage`, `ChatFeedback`), map to snake_case tables, and regenerate client via `pnpm --filter=@traffic-ioc/backend prisma:gen`
- [x] 6.2 Implement `rag-ingestion` streaming ingestion endpoint (`POST /api/v1/ingest/traffic-law/process-stream`) emitting SSE progress events (`FILE_LOADED`, `AST_PARSED`, `EMBEDDINGS_GENERATED`, `STORAGE_SYNCED`, `COMPLETED`)
- [x] 6.3 Implement Admin document management controller and routes in `apps/backend` (`src/controllers/admin-rag.controller.ts`, `src/routes/admin-rag.routes.ts`) for document CRUD, chunk fetching, upload proxy, SSE streaming (`/jobs/:jobId/stream`), and Qdrant vector deletion
- [x] 6.4 Build `LawDocumentsPage` in `apps/admin-web/src/pages/LawDocumentsPage.tsx` with Ant Design table, status tags, search/filters, and mount into React Router & sidebar navigation
- [x] 6.5 Build document upload modal with drag-and-drop and live SSE Progress Stepper + event log in `apps/admin-web/src/components/admin-rag/DocumentUploadModal.tsx`
- [x] 6.6 Build chunk inspector drawer (`apps/admin-web/src/components/admin-rag/ChunkInspectorDrawer.tsx`) and deletion/re-indexing actions
- [x] 6.7 Verify end-to-end admin document upload, SSE progress streaming, chunk inspection, and vector synchronization across monorepo

## 7. Redis Pub/Sub Architecture Migration

- [x] 7.1 Add `redis` dependency to `rag-ingestion/pyproject.toml`, implement `src/services/redis_publisher.py` for broadcasting progress events over `rag:ingestion:events`, and update ingestion worker to publish milestones asynchronously
- [x] 7.2 Implement Redis subscriber service in `apps/backend/src/services/rag-ingestion-events.service.ts` that subscribes to `rag:ingestion:events`, updates OLTP document database status, and pipes events to backend SSE emitters
- [x] 7.3 Refactor `apps/backend/src/controllers/admin-rag.controller.ts` upload and reindex handlers to return 202 Accepted immediately and rely on Redis Pub/Sub for progress tracking
- [x] 7.4 Verify end-to-end asynchronous ingestion, Redis event propagation, and Admin Web global tracker via unit tests and monorepo build check





