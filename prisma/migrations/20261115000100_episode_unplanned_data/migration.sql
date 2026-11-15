-- Novos episódios nascem sem planejamento.
ALTER TABLE "Episode" ALTER COLUMN "status" SET DEFAULT 'UNPLANNED';

-- Planejado, mas sem nenhuma luta/segmento no card => sem planejamento.
-- Os com card e os já realizados (DONE) ficam como estão.
UPDATE "Episode" e
SET "status" = 'UNPLANNED'
WHERE e."status" = 'PLANNED'
  AND NOT EXISTS (SELECT 1 FROM "Segment" s WHERE s."episodeId" = e."id");
