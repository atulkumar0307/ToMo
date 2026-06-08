/*
  Warnings:

  - You are about to drop the column `purpose` on the `Otp` table. All the data in the column will be lost.
  - Added the required column `action` to the `Otp` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OtpAction" AS ENUM ('LOGIN');

-- DropIndex
DROP INDEX "Otp_mobile_isUsed_expiresAt_idx";

-- AlterTable
ALTER TABLE "Otp" DROP COLUMN "purpose",
ADD COLUMN     "action" "OtpAction" NOT NULL;

-- DropEnum
DROP TYPE "OtpPurpose";

-- CreateIndex
CREATE INDEX "Otp_mobile_action_isUsed_expiresAt_idx" ON "Otp"("mobile", "action", "isUsed", "expiresAt");
