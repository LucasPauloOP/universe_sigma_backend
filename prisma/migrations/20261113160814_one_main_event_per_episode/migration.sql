-- Garante no banco que cada episódio (show ou PLE) tenha no máximo UM main event.
-- Índice único parcial (o Prisma não o declara no schema; fica só aqui).
CREATE UNIQUE INDEX "Segment_one_main_event_per_episode"
  ON "Segment" ("episodeId")
  WHERE "isMainEvent" = true;
