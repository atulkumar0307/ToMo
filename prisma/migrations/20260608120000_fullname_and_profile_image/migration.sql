-- AlterTable
ALTER TABLE "User" DROP COLUMN "firstName",
DROP COLUMN "lastName",
ADD COLUMN "fullName" TEXT,
ADD COLUMN "profileImagePath" TEXT;
