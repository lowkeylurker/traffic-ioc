## Why

Citizens and traffic operators in Ho Chi Minh City face frequent ambiguity regarding traffic laws, fines, penalty brackets (Nghị định 100/2019/NĐ-CP, Nghị định 123/2021/NĐ-CP), and road signage (QCVN 41:2019/BGTVT). Providing a verified Retrieval-Augmented Generation (RAG) assistant with exact legal citations empowers commuters with immediate, accurate legal knowledge, improves voluntary compliance, and lays the foundation for a general-purpose Multi-RAG platform across Smart Traffic IOC.

## What Changes

- **Document Ingestion Service (`rag-ingestion/`)**: A dedicated Python FastAPI service built and managed with `uv` (`pyproject.toml`, `uv.lock`, and `pyrefly` type checking), utilizing LlamaIndex, Google Gemini Flash OCR for scanned decrees, local Ollama `BAAI/bge-m3` (1024-dim) embeddings to parse and index Vietnamese traffic legislation into Qdrant and OLTP PostgreSQL, and Redis Pub/Sub (`rag:ingestion:events`) to broadcast real-time milestone events.
- **Dual Database Architecture & Multi-Prisma Setup**: Split relational workloads into an OLAP Data Warehouse (existing PostgreSQL `dw.prisma`) and an OLTP Operational Database (`oltp.prisma`) with two isolated Prisma clients (`oltpPrisma` and `dwPrisma`).
- **Vector Search & Qdrant Infrastructure**: Deploy Qdrant vector database (`vietnam_traffic_laws` collection) with 1024-dimension embeddings and payload pre-filtering by vehicle types and violation categories.
- **Backend RAG Gateway (`apps/backend`)**: Universal RAG orchestrator using Vercel AI SDK (`ai`), supporting Google Gemini Flash and local Ollama Qwen 2.5, streaming citations and answers via Server-Sent Events (SSE), and subscribing to Redis Pub/Sub events to bridge ingestion progress to admin clients.
- **Citizen Legal Assistant Portal (`apps/user-web`)**: Next.js 16 interactive legal assistant chat with real-time SSE streaming, citation badges, fine range summary cards, and user feedback actions.
- **Admin Law Document Management Portal (`apps/admin-web`)**: Ant Design & React 18 dashboard for traffic IOC administrators to upload decrees, track real-time parsing & vector indexing progress via Server-Sent Events (SSE), inspect generated AST chunks, and manage document catalogs.

### Non-Goals
- Real-time automated traffic fine processing or payment gateway integration.
- General non-traffic Vietnamese civil or penal law question answering.
- Modifying existing OLAP traffic telemetry tables (`dim_segment`, `fact_traffic_flow`).

## Capabilities

### New Capabilities
- `traffic-legislation-rag`: Interactive conversational legal assistant providing grounded traffic regulation answers, penalty brackets, fine lookup, road sign explanations, decree citations, and an administrative law document management console with live ingestion progress streaming backed by decoupled Redis Pub/Sub event broadcasting.

### Modified Capabilities
<!-- None. Existing capabilities are untouched. -->

## Impact

- **Impacted Monorepo Subsystems**:
  - `rag-ingestion/`: Python FastAPI microservice managed with `uv` and `pyproject.toml` (LlamaIndex, `google-generativeai`, `qdrant-client`, `ollama`, `sqlalchemy`, `redis`, `pdfplumber`, `python-docx`, `pyrefly`), providing chunking, OCR, embeddings, and Redis Pub/Sub progress event publishing (`rag:ingestion:events`).
  - `apps/backend`: Express.js backend with dual Prisma clients (`prisma/oltp.prisma`, `prisma/dw.prisma`), Vercel AI SDK (`ai`), conversational legal chat endpoints under `/api/v1/traffic-law/*`, and Admin document management with Redis subscriber event listener bridging to SSE streaming endpoints under `/api/v1/admin/documents/*`.
  - `apps/admin-web`: React 18 & Ant Design admin portal adding `/law-documents` page, live SSE progress modal, chunk inspector drawer, and deletion/re-indexing mutations.
  - `apps/user-web`: Next.js 16 frontend adding `/assistant` page, chat UI components, citation modals, and feedback mutations.
  - `packages/shared`: Shared Zod validation schemas, TypeScript interfaces for RAG requests, citations, SSE/PubSub events, and admin document management payloads.
  - `data-pipeline/` & `ai-core/`: Unchanged.
- **Infrastructure Dependencies**:
  - Qdrant Vector Database (`qdrant/qdrant:latest` container in `docker-compose.yml`).
  - Redis 7 (channel `rag:ingestion:events` for decoupled event broadcasting).
  - Secondary PostgreSQL database instance/schema for OLTP operations.
  - Local Ollama instance serving `bge-m3` embedding model.
