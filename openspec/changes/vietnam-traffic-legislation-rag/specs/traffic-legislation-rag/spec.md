## ADDED Requirements

### Requirement: Legal Document Ingestion and Hierarchical Structuring
The system SHALL ingest Vietnamese legal traffic documents (.docx, digital .pdf, and scanned image .pdf), transcribe scanned documents via Google Gemini Flash OCR, parse the content into a structural AST (Chương > Điều > Khoản > Điểm), enrich chunks with context breadcrumbs and fine brackets, generate 1024-dimension embeddings via local Ollama `BAAI/bge-m3`, and atomically persist records into both the OLTP PostgreSQL database and the Qdrant vector database.

#### Scenario: Ingesting digital decree document
- **GIVEN** an authorized System Admin uploads a valid decree file `Nghị định 100/2019/NĐ-CP.docx` via `POST /api/v1/ingest/traffic-law/process`
- **WHEN** the ingestion service parses the document into structural nodes
- **THEN** it generates self-contained chunks containing breadcrumbs, fine ranges, and vehicle tags, writes relational records to OLTP PostgreSQL `knowledge_document` and `knowledge_chunk`, and upserts 1024-dim dense vectors to the Qdrant collection `vietnam_traffic_laws` with matching UUIDs.

#### Scenario: Ingesting scanned decree document with OCR
- **GIVEN** an authorized System Admin uploads a scanned PDF decree `Nghị định 123/2021/NĐ-CP_scan.pdf` with no native text layer
- **WHEN** the ingestion service detects low text density
- **THEN** it invokes Google Gemini Flash OCR to transcribe pages into structured Markdown with legal headings, which is then parsed by the legal AST parser into standard relational chunks and Qdrant vectors.

#### Scenario: Toolchain build and typecheck with uv and pyrefly
- **GIVEN** the `rag-ingestion/` Python service repository
- **WHEN** the developer executes project setup, dependency resolution, or static analysis
- **THEN** the system SHALL resolve dependencies via `uv` using `pyproject.toml`, maintain a reproducible `uv.lock`, pass static type verification via `pyrefly`, and boot the service via `uv run`.

---

### Requirement: Conversational Legal Retrieval and SSE Streaming
The system SHALL provide an authenticated or anonymous endpoint `POST /api/v1/rag/traffic-law/chat` that accepts a commuter question and optional session ID, performs hybrid vector retrieval against Qdrant, hydrates chunk context from OLTP PostgreSQL, and streams verified responses with citation metadata using Server-Sent Events (SSE).

#### Scenario: Commuter queries penalty for running red light
- **GIVEN** a Commuter sends a payload `{"message": "Vượt đèn đỏ xe máy bị phạt bao nhiêu tiền?"}` to `POST /api/v1/rag/traffic-law/chat`
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
- **THEN** the backend contextualizes the query into an independent search query for car speed violations, retrieves car-specific chunks (Điều 5), and persists both turns in `chat_messages`.

#### Scenario: Commuter submits feedback on legal answer
- **GIVEN** an existing assistant message with `messageId`
- **WHEN** the Commuter sends `POST /api/v1/rag/feedback` with payload `{"messageId": "...", "rating": 1, "comment": "Rất chính xác"}`
- **THEN** the system persists the feedback record in `chat_feedback` linked to the message and returns `{ "success": true }`.

---

### Requirement: Commuter Web Assistant Interface
The web client (`apps/user-web`) SHALL provide a dedicated interactive chat interface and modal drawer with real-time SSE token rendering, interactive citation cards, penalty summary badges, and copy/feedback buttons.

#### Scenario: Viewing citation details in UI
- **GIVEN** a completed response with citation badges rendered in `apps/user-web`
- **WHEN** the Commuter clicks on the citation badge `[Nghị định 100 - Điều 6 Khoản 4 Điểm a]`
- **THEN** a drawer or popover opens displaying the full legal excerpt, effective date, and source link.
