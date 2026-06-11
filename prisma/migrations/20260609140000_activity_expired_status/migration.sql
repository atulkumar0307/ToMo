-- AlterEnum
ALTER TYPE "ActivityStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "expiredAt" TIMESTAMP(3);
