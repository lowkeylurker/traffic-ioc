# Vietnam Traffic Legislation RAG Ingestion — Agent Guide

This microservice (`rag-ingestion/`) is a Python 3.11+ FastAPI service that parses, enriches, embeds, and indexes Vietnamese traffic legislation documents into Qdrant vector database and PostgreSQL OLTP.

---

## Agent Rules & Guidelines

### 1. Comprehensive Docstrings & Comments
> [!IMPORTANT]
> **Docstrings Rule**:
> Every class, function, and public method in `rag-ingestion/` **MUST** include comprehensive docstrings (Google/Sphinx style).
> - Specify the purpose, parameters (`Args:`), return values (`Returns:`), and potential errors (`Raises:`).
> - Explain non-obvious legal parsing rules, regex matching patterns, or inter-service architectural contexts.

### 2. Code Formatting & Linting with Ruff
> [!IMPORTANT]
> **Ruff Rule**:
> After creating or modifying any Python file in `rag-ingestion/`, you **MUST** format and lint the code:
> ```bash
> cd rag-ingestion
> uv run ruff format .
> uv run ruff check --fix .
> ```

### 3. Object Storage Reference (MinIO / S3)
> [!IMPORTANT]
> **Payload & Storage Rule**:
> - **Never** pass raw file binaries or base64 strings in JSON HTTP request bodies.
> - The API Gateway (`apps/backend`) uploads files to MinIO (`traffic-ioc-documents` bucket) and stores the `storageKey` in PostgreSQL OLTP.
> - `rag-ingestion` receives lightweight JSON trigger payloads (`storage_key` or `doc_id`) and streams binaries directly from MinIO using `minio_storage`.

### 4. Pure Asynchronous Jobs & Redis Pub/Sub Milestones
> [!IMPORTANT]
> **Asynchronous Execution Rule**:
> - Endpoints in `src/api/routes/ingest.py` MUST NEVER execute synchronous parsing.
> - Always schedule ingestion via FastAPI `BackgroundTasks` and return HTTP `202 Accepted` with a `jobId`.
> - The worker pipeline MUST publish real-time milestone events across Redis topic `rag:ingestion:events`:
>   `FILE_LOADED` (15%) $\to$ `FORMAT_DETECTED` (25%) $\to$ `OCR_PROCESSING` (35%) $\to$ `AST_PARSED` (50%) $\to$ `CHUNKS_ENRICHED` (65%) $\to$ `EMBEDDINGS_GENERATED` (80%) $\to$ `STORAGE_SYNCED` (95%) $\to$ `COMPLETED` (100%) or `FAILED`.

---

## Commands & Scripts

- **Dependency Management**: `uv sync` (or `uv add <pkg>`)
- **Format Code**: `uv run ruff format .` (or root `pnpm format:rag`)
- **Lint & Fix**: `uv run ruff check --fix .` (or root `pnpm lint:rag`)
- **Run Unit Tests**: `uv run pytest`
- **Start Dev Server**: `uv run uvicorn src.main:app --host 0.0.0.0 --port 8001 --reload`

---

## Layered Architecture Conventions

- **`src/schemas/`**: Pydantic DTOs (`IngestionRequest`, `JobAcceptedResponse`, `RetryProcessRequest`).
- **`src/api/routes/`**: Thin FastAPI route controllers dispatching background jobs.
- **`src/services/`**:
  - `ingestion_pipeline.py`: Main orchestrator (`IngestionPipeline`).
  - `minio_storage.py`: MinIO binary stream & download client.
  - `redis_publisher.py`: Asynchronous Redis Pub/Sub milestone event broadcaster.
  - `embedder.py`: Ollama 1024-dim dense vector embedding client (`BAAI/bge-m3`).
  - `qdrant_sync.py`: Qdrant collection upsertion with full metadata payload indexing.
  - `oltp_sync.py`: PostgreSQL OLTP metadata synchronization.
- **`src/parsers/`**: Modular document extractors:
  - `document_detector.py`: Detects format and text density threshold (< 100 chars/page).
  - `docx_parser.py`: Extracts structured headings from Word documents.
  - `pdf_digital_parser.py`: PyMuPDF / pdfplumber digital text extraction.
  - `ocr_vision_parser.py`: Google Gemini 1.5 Flash Vision OCR for scanned decree PDFs.
  - `legal_ast.py`: Hierarchical parser deconstructing into Chương > Mục > Điều > Khoản > Điểm.
- **`src/enrichers/`**:
  - `chunk_composer.py`: Injects hierarchical breadcrumbs, extracts fine ranges, classifies vehicle types, and cross-links license suspension penalties.
