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

- [ ] 3.1 Split Prisma configuration into `prisma/oltp.prisma` (generating `../src/generated/client-oltp`) and `prisma/dw.prisma` (generating `../src/generated/client-dw`), update `package.json` scripts, and verify typecheck via `pnpm --filter=@traffic-ioc/backend build:check`
- [ ] 3.2 Implement singleton Prisma instances in `src/config/oltp-prisma.ts` and `src/config/dw-prisma.ts`, and initialize Qdrant client in `src/rag/core/qdrant.client.ts`
- [ ] 3.3 Install Vercel AI SDK (`ai`, `@ai-sdk/google`, `ollama-ai-provider`), and build `src/rag/core/llm-gateway.ts` supporting Google Gemini Flash and Ollama Qwen 2.5
- [ ] 3.4 Implement RAG orchestrator in `src/rag/core/rag-orchestrator.ts` and traffic legislation strategy in `src/rag/strategies/traffic-law.strategy.ts`
- [ ] 3.5 Implement RAG controller and routes in `src/controllers/rag.controller.ts` and `src/routes/rag.routes.ts` (`POST /api/v1/rag/traffic-law/chat` SSE stream and `POST /api/v1/rag/feedback`), mount in `src/app.ts`, and verify via `curl`

## 4. Citizen Legal Assistant Portal (`apps/user-web`)

- [ ] 4.1 Create Assistant page at `src/app/assistant/page.tsx` and query key factory in `src/lib/query-keys/assistant.keys.ts`
- [ ] 4.2 Build interactive chat interface components (`ChatWindow`, `MessageList`, `PromptInput`) supporting real-time SSE token rendering in `src/components/assistant/`
- [ ] 4.3 Build citation drawer and fine summary cards in `src/components/assistant/citation-card.tsx` to display verified decree articles and fine brackets
- [ ] 4.4 Add message feedback action mutation (thumbs up / thumbs down) in `src/components/assistant/feedback-action.tsx` and verify with `pnpm --filter=@traffic-ioc/user-web build:check`

## 5. End-to-End Verification

- [ ] 5.1 Run full monorepo typecheck and lint verification via `pnpm build:check && pnpm lint`
- [ ] 5.2 Ingest a complete sample Vietnamese traffic regulation, submit a test chat query from the web UI, and verify citation cards and SSE streaming
