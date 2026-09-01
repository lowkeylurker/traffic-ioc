## ADDED Requirements

### Requirement: Legal Document Ingestion and Hierarchical Structuring
The system SHALL ingest Vietnamese legal traffic documents (.docx, digital .pdf, and scanned image .pdf), transcribe scanned documents via Google Gemini Flash OCR, parse the content into a structural AST (Chương > Điều > Khoản > Điểm), enrich chunks with context breadcrumbs and fine brackets, generate 1024-dimension embeddings via an extensible `EmbedderFactory` (OpenAI SDK supporting any compatible backend such as Ollama, OpenAI, or vLLM), and atomically persist records into both the OLTP PostgreSQL database and the Qdrant vector database via asynchronous background jobs publishing progress events over Redis Pub/Sub.

#### Scenario: Ingesting digital decree document via asynchronous job
- **GIVEN** an authorized System Admin uploads a valid decree file `Nghị định 100/2019/NĐ-CP.docx` via `POST /api/v1/admin/documents/upload` which dispatches `POST /api/v1/ingest/traffic-law/process-async`
- **WHEN** the ingestion service accepts the job and parses the document into structural nodes in a background worker
- **THEN** it publishes milestone progress events (`FILE_LOADED`, `FORMAT_DETECTED`, `AST_PARSED`, `CHUNKS_ENRICHED`, `EMBEDDINGS_GENERATED`, `STORAGE_SYNCED`, `COMPLETED`) to Redis channel `rag:ingestion:events`, generates self-contained chunks containing breadcrumbs, fine ranges, and vehicle tags, writes relational records to OLTP PostgreSQL `KnowledgeDocument` and `KnowledgeChunk`, and upserts 1024-dim dense vectors to the Qdrant collection `vietnam_traffic_laws` with matching UUIDs.

#### Scenario: Ingesting scanned decree document with OCR
- **GIVEN** an authorized System Admin uploads a scanned PDF decree `Nghị định 123/2021/NĐ-CP_scan.pdf` with no native text layer
- **WHEN** the ingestion service detects low text density
- **THEN** it invokes Google Gemini Flash OCR to transcribe pages into structured Markdown with legal headings, which is then parsed by the legal AST parser into standard relational chunks and Qdrant vectors.

#### Scenario: Toolchain build, layered architecture, and typecheck with uv
- **GIVEN** the `rag-ingestion/` Python service repository
- **WHEN** the developer executes project setup, dependency resolution, or service startup
- **THEN** the system SHALL resolve dependencies via `uv` using `pyproject.toml`, follow a clean layered architecture separating HTTP controllers (`api/routes/ingest.py`), DTO schemas (`schemas/ingest.py`), and background pipeline orchestrator (`services/ingestion_pipeline.py`), maintain a reproducible `uv.lock`, and boot the service via standard CLI `uv run uvicorn src.main:app --host 0.0.0.0 --port 8001 --reload` using modern lifespan context manager.

#### Scenario: Dual-Database Schema Separation (OLTP vs DW)
- **GIVEN** the multi-schema architecture in `apps/backend`
- **WHEN** the backend initializes database connections and executes schema synchronization
- **THEN** the system SHALL connect the OLTP schema via `OLTP_DATABASE_URL` with Prisma migrations enabled, and connect the DW schema and raw PostGIS pool via `DW_DATABASE_URL` with SQL-first introspection (`prisma db pull`).

---

### Requirement: Conversational Legal Retrieval and SSE Streaming
The system SHALL provide an authenticated or anonymous endpoint `POST /api/v1/traffic-law/chat` that accepts a commuter question and optional session ID, performs hybrid vector retrieval against Qdrant, hydrates chunk context from OLTP PostgreSQL, and streams verified responses with citation metadata using Server-Sent Events (SSE).

#### Scenario: Commuter queries penalty for running red light
- **GIVEN** a Commuter sends a payload `{"message": "Vượt đèn đỏ xe máy bị phạt bao nhiêu tiền?"}` to `POST /api/v1/traffic-law/chat`
- **WHEN** the backend receives the query
- **THEN** it generates a 1024-dim embedding via Ollama `bge-m3`, queries Qdrant collection `vietnam_traffic_laws` for top-5 chunks, hydrates metadata from OLTP database, and streams SSE events starting with `event: citations` (citing Điều 6 Khoản 4 Điểm a Nghị định 100) followed by `event: token` streaming the explanation, and closes with `event: done`.

#### Scenario: Query outside legal domain scope
- **GIVEN** a Commuter sends a query unrelated to traffic laws (e.g., "Thuế thu nhập cá nhân tính sao?")
- **WHEN** Qdrant vector similarity scores for all candidate chunks fall below the 0.60 threshold
- **THEN** the system SHALL return a polite refusal stating the question is outside Vietnamese traffic legislation without making up or hallucinating answers.

---

### Requirement: Strict Legal Grounding and Citation Verification
The assistant SHALL strictly ground all generated answers within the retrieved legal context chunks and SHALL format every specific sanction with explicit decree, article, clause, and point citations.

#### Scenario: Generating structured fine summary and citations
- **GIVEN** relevant context chunks for illegal u-turn on a bridge are retrieved from the database
- **WHEN** the LLM generates the response stream
- **THEN** the response payload MUST contain structured citation objects `{ "docCode": "100/2019/NĐ-CP", "articleNumber": 6, "clauseNumber": 3, "pointCode": "d", "fineMin": 400000, "fineMax": 600000 }` and display the exact fine range in Vietnamese Dong.

---

### Requirement: Multi-Turn Conversation and Feedback Management
The system SHALL track conversational context across multiple turns within a chat session and allow commuters to submit feedback on answer accuracy.

#### Scenario: Commuter asks follow-up question
- **GIVEN** an ongoing chat session where the user previously asked about motorbike speed violations
- **WHEN** the Commuter sends `{"sessionId": "...", "message": "Còn đối với ô tô thì sao?"}`
- **THEN** the backend contextualizes the query into an independent search query for car speed violations, retrieves car-specific chunks (Điều 5), and persists both turns in `ChatMessage`.

#### Scenario: Commuter submits feedback on legal answer
- **GIVEN** an existing assistant message with `messageId`
- **WHEN** the Commuter sends `POST /api/v1/traffic-law/feedback` with payload `{"messageId": "...", "rating": 1, "comment": "Rất chính xác"}`
- **THEN** the system persists the feedback record in `ChatFeedback` linked to the message and returns `{ "success": true }`.

---

### Requirement: Commuter Web Assistant Interface
The web client (`apps/user-web`) SHALL provide a dedicated interactive chat interface and modal drawer with real-time SSE token rendering, interactive citation cards, penalty summary badges, and copy/feedback buttons.

#### Scenario: Viewing citation details in UI
- **GIVEN** a completed response with citation badges rendered in `apps/user-web`
- **WHEN** the Commuter clicks on the citation badge `[Nghị định 100 - Điều 6 Khoản 4 Điểm a]`
- **THEN** a drawer or popover opens displaying the full legal excerpt, effective date, and source link.

---

### Requirement: Admin Law Document Management and Ingestion Streaming
The system SHALL provide an administrative management console in `apps/admin-web` and gateway endpoints in `apps/backend` allowing authenticated administrators to upload traffic decrees, monitor asynchronous parsing and vectorization in real-time via Server-Sent Events (SSE) backed by a decoupled Redis Pub/Sub message broker (`rag:ingestion:events`), inspect generated AST chunks, delete documents with vector cleanup, and trigger re-indexing.

#### Scenario: Admin uploads decree document with real-time Redis Pub/Sub to SSE progress
- **GIVEN** an authenticated Admin accesses `/law-documents` and submits a decree file (`.docx` or `.pdf`) with document metadata
- **WHEN** the upload request is accepted by `POST /api/v1/admin/documents/upload`
- **THEN** the backend issues an asynchronous ingestion task with `jobId`, FastAPI `rag-ingestion` service processes the document and publishes milestone progress events (`FILE_LOADED` 15% $\to$ `FORMAT_DETECTED` 25% $\to$ `AST_PARSED` 50% $\to$ `CHUNKS_ENRICHED` 65% $\to$ `EMBEDDINGS_GENERATED` 80% $\to$ `STORAGE_SYNCED` 95% $\to$ `COMPLETED` 100%) to Redis topic `rag:ingestion:events`, and the backend forwards the events in real-time via `GET /api/v1/admin/documents/stream` to the Admin Web progress tracker.

#### Scenario: Admin inspects extracted chunks in drawer
- **GIVEN** an ingested document in the administrative document catalog
- **WHEN** the Admin clicks "Xem Chunks" for the document
- **THEN** the UI opens a slide-out drawer rendering the list of chunks, breadcrumb hierarchies (*Chương ➔ Điều ➔ Khoản ➔ Điểm*), fine brackets, vehicle tags, license penalties, and Qdrant point IDs.

#### Scenario: Admin deletes legal document and purges vectors
- **GIVEN** an existing legal document in `KnowledgeDocument`
- **WHEN** the Admin issues `DELETE /api/v1/admin/documents/:docId`
- **THEN** the backend cascades deletion in PostgreSQL OLTP and removes all matching point vectors from the Qdrant `vietnam_traffic_laws` collection.

#### Scenario: Admin re-indexes an existing document
- **GIVEN** an existing document requiring vector recalculation or re-parsing
- **WHEN** the Admin clicks "Đánh chỉ mục lại" (`POST /api/v1/admin/documents/:docId/reindex`)
- **THEN** the backend invokes `POST /api/v1/ingest/traffic-law/retry`, re-running AST extraction and embeddings in the background, publishing progress events over Redis Pub/Sub and updating existing chunk records and vector points while streaming progress via SSE.
