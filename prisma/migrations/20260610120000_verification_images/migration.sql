-- DropTable
DROP TABLE "VerificationVideo";

-- CreateTable
CREATE TABLE "VerificationSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationImage" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationSubmission_userId_idx" ON "VerificationSubmission"("userId");

-- CreateIndex
CREATE INDEX "VerificationSubmission_userId_status_idx" ON "VerificationSubmission"("userId", "status");

-- CreateIndex
CREATE INDEX "VerificationSubmission_status_idx" ON "VerificationSubmission"("status");

-- CreateIndex
CREATE INDEX "VerificationImage_submissionId_idx" ON "VerificationImage"("submissionId");

-- AddForeignKey
ALTER TABLE "VerificationSubmission" ADD CONSTRAINT "VerificationSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationImage" ADD CONSTRAINT "VerificationImage_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "VerificationSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
