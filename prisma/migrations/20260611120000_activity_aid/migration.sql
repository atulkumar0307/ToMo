-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "aid" INTEGER;

-- Backfill existing activities
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Activity"
)
UPDATE "Activity" AS a
SET "aid" = n.rn
FROM numbered AS n
WHERE a.id = n.id;

-- Enforce uniqueness and not null
ALTER TABLE "Activity" ALTER COLUMN "aid" SET NOT NULL;
CREATE UNIQUE INDEX "Activity_aid_key" ON "Activity"("aid");

-- CreateIndex
CREATE INDEX "Activity_aid_idx" ON "Activity"("aid");

-- Seed counter from max aid
INSERT INTO "Counter" ("id", "value")
SELECT 'activity_aid', COALESCE(MAX("aid"), 0)
FROM "Activity"
ON CONFLICT ("id") DO UPDATE SET "value" = EXCLUDED."value";
