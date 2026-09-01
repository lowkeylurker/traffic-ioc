/*
  Warnings:

  - You are about to drop the column `title` on the `knowledge_document` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "knowledge_document" DROP COLUMN "title",
ADD COLUMN     "storage_key" VARCHAR(500);
