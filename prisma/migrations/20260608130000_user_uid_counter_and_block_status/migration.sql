-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "uid" INTEGER,
ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false;

-- Backfill uid for existing users
WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
    FROM "User"
)
UPDATE "User" u
SET "uid" = n.rn
FROM numbered n
WHERE u."id" = n."id";

-- Seed counter from existing users
INSERT INTO "Counter" ("id", "value")
SELECT 'user_uid', COALESCE((SELECT MAX("uid") FROM "User"), 0);

-- Enforce uid constraints
ALTER TABLE "User" ALTER COLUMN "uid" SET NOT NULL;
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");
