-- Rivalidade automática: lado vencedor, envolvidos por lado (lutador OU dupla/facção)
-- e vínculo das lutas que começam/encerram a rivalidade.

ALTER TABLE "Rivalry" ADD COLUMN "winnerSide" INTEGER;

-- RivalryMember: a chave primária passa a ser um id (o membro pode ser lutador OU time).
-- As linhas atuais (só lutadores) ficam todas no lado 1.
ALTER TABLE "RivalryMember" DROP CONSTRAINT "RivalryMember_pkey";
ALTER TABLE "RivalryMember" ADD COLUMN "id" TEXT;
ALTER TABLE "RivalryMember" ADD COLUMN "teamId" TEXT;
ALTER TABLE "RivalryMember" ADD COLUMN "side" INTEGER NOT NULL DEFAULT 1;
UPDATE "RivalryMember" SET "id" = gen_random_uuid()::text;
ALTER TABLE "RivalryMember" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "RivalryMember" ALTER COLUMN "wrestlerId" DROP NOT NULL;
ALTER TABLE "RivalryMember" ADD CONSTRAINT "RivalryMember_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "RivalryMember_rivalryId_wrestlerId_key" ON "RivalryMember"("rivalryId", "wrestlerId");
CREATE UNIQUE INDEX "RivalryMember_rivalryId_teamId_key" ON "RivalryMember"("rivalryId", "teamId");
CREATE INDEX "RivalryMember_rivalryId_idx" ON "RivalryMember"("rivalryId");
ALTER TABLE "RivalryMember" ADD CONSTRAINT "RivalryMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segment: rivalidade que a luta começa ou encerra
ALTER TABLE "Segment" ADD COLUMN "rivalryId" TEXT;
ALTER TABLE "Segment" ADD COLUMN "startsRivalry" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Segment" ADD COLUMN "endsRivalry" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Segment" ADD COLUMN "rivalryApplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_rivalryId_fkey" FOREIGN KEY ("rivalryId") REFERENCES "Rivalry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
