-- AlterTable
ALTER TABLE "Team" ADD COLUMN "factionId" TEXT;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
