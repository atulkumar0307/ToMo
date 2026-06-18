-- CreateEnum
CREATE TYPE "HighlightStatus" AS ENUM ('PUBLISHED', 'DRAFT', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "HighlightStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HighlightMediaItem" (
    "id" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HighlightMediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Highlight_activityId_idx" ON "Highlight"("activityId");

-- CreateIndex
CREATE INDEX "Highlight_activityId_status_idx" ON "Highlight"("activityId", "status");

-- CreateIndex
CREATE INDEX "Highlight_userId_idx" ON "Highlight"("userId");

-- CreateIndex
CREATE INDEX "Highlight_userId_status_idx" ON "Highlight"("userId", "status");

-- CreateIndex
CREATE INDEX "Highlight_status_idx" ON "Highlight"("status");

-- CreateIndex
CREATE INDEX "HighlightMediaItem_highlightId_idx" ON "HighlightMediaItem"("highlightId");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlightMediaItem" ADD CONSTRAINT "HighlightMediaItem_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "Highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
