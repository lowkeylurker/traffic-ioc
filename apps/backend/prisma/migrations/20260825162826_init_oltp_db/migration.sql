-- CreateTable
CREATE TABLE "knowledge_base" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "qdrant_collection" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document" (
    "id" UUID NOT NULL,
    "kb_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "source_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunk" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "breadcrumb" VARCHAR(500),
    "content" TEXT NOT NULL,
    "qdrant_point_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_session" (
    "id" UUID NOT NULL,
    "kb_id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "latency_ms" INTEGER,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_feedback" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_base_code_key" ON "knowledge_base"("code");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_document_kb_id_code_key" ON "knowledge_document"("kb_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunk_qdrant_point_id_key" ON "knowledge_chunk"("qdrant_point_id");

-- CreateIndex
CREATE INDEX "knowledge_chunk_document_id_idx" ON "knowledge_chunk"("document_id");

-- CreateIndex
CREATE INDEX "chat_message_session_id_idx" ON "chat_message"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_feedback_message_id_key" ON "chat_feedback"("message_id");

-- AddForeignKey
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
