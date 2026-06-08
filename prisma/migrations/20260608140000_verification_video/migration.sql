-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "VerificationVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoPath" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationVideo_userId_idx" ON "VerificationVideo"("userId");

-- CreateIndex
CREATE INDEX "VerificationVideo_userId_status_idx" ON "VerificationVideo"("userId", "status");

-- CreateIndex
CREATE INDEX "VerificationVideo_status_idx" ON "VerificationVideo"("status");

-- AddForeignKey
ALTER TABLE "VerificationVideo" ADD CONSTRAINT "VerificationVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
