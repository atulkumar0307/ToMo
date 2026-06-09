-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "verifiedNameDobUpdatedAt";
ALTER TABLE "User" ADD COLUMN "fullNameUpdatedAt" TIMESTAMP(3),
ADD COLUMN "dateOfBirthUpdatedAt" TIMESTAMP(3);
