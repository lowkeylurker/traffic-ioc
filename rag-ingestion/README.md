# Vietnam Traffic Legislation Ingestion Microservice

`rag-ingestion` is an asynchronous document processing service that extracts, structures, and indexes Vietnamese traffic legal documents (Nghị định 100/2019/NĐ-CP, Nghị định 123/2021/NĐ-CP, Thông tư, Luật TTATGTĐB) into Qdrant vector database and an operational PostgreSQL OLTP store.

## Features
- **Adaptive Document Loader**: Scanned PDF OCR via Google Gemini Flash (`gemini-1.5-flash`) and direct PDF/DOCX digital text extraction.
- **Hierarchical Legal AST Parser**: Splits legal code into Chapter > Article > Clause > Point AST trees.
- **Context Breadcrumb Enricher**: Synthesizes parent legal context, fine amounts (VND min/max), vehicle classification tags, and supplementary penalties into self-contained text chunks.
- **Dual-Store Sync**:
  - Dense vector embeddings via local Ollama `BAAI/bge-m3` (1024 dimensions) upserted to Qdrant collection `vietnam_traffic_laws`.
  - Structured document metadata, chapters, and enriched chunks synced into PostgreSQL (`knowledge_document` & `knowledge_chunk`).
- **FastAPI Endpoints**: Batch processing, file uploads, document catalog querying, and health check.

## Getting Started

### 1. Install Dependencies
```bash
cd rag-ingestion
uv sync
```

### 2. Run the FastAPI Server
Using the FastAPI CLI:
```bash
uv run fastapi dev src/main.py --port 8001
```
Or in production mode:
```bash
uv run fastapi run src/main.py --port 8001
```
Or with Uvicorn:
```bash
uv run uvicorn src.main:app --reload --port 8001
```

### 3. Run Tests
```bash
uv run pytest
```

