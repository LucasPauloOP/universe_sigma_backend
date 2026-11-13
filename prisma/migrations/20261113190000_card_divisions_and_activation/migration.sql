-- CreateEnum
CREATE TYPE "SegmentStakes" AS ENUM ('NONE', 'RANKING', 'CONTENDER');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Show" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ppvWeek" INTEGER;

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "cardDivisionId" TEXT,
ADD COLUMN     "rankingApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stakes" "SegmentStakes" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "CardDivision" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "brandId" TEXT,
    "titleId" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CardDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardDivisionEntry" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wrestlerId" TEXT,
    "teamId" TEXT,

    CONSTRAINT "CardDivisionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardDivision_universeId_brandId_idx" ON "CardDivision"("universeId", "brandId");

-- CreateIndex
CREATE INDEX "CardDivisionEntry_divisionId_position_idx" ON "CardDivisionEntry"("divisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CardDivisionEntry_divisionId_wrestlerId_key" ON "CardDivisionEntry"("divisionId", "wrestlerId");

-- CreateIndex
CREATE UNIQUE INDEX "CardDivisionEntry_divisionId_teamId_key" ON "CardDivisionEntry"("divisionId", "teamId");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_cardDivisionId_fkey" FOREIGN KEY ("cardDivisionId") REFERENCES "CardDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDivision" ADD CONSTRAINT "CardDivision_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDivision" ADD CONSTRAINT "CardDivision_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDivision" ADD CONSTRAINT "CardDivision_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDivisionEntry" ADD CONSTRAINT "CardDivisionEntry_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CardDivision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDivisionEntry" ADD CONSTRAINT "CardDivisionEntry_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDivisionEntry" ADD CONSTRAINT "CardDivisionEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

