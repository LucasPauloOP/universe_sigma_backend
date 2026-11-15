-- AlterTable
ALTER TABLE "TournamentMatch" ADD COLUMN     "matchTypeId" TEXT;

-- CreateTable
CREATE TABLE "TournamentMatchEntrant" (
    "matchId" TEXT NOT NULL,
    "entrantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TournamentMatchEntrant_pkey" PRIMARY KEY ("matchId","entrantId")
);

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_matchTypeId_fkey" FOREIGN KEY ("matchTypeId") REFERENCES "MatchType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatchEntrant" ADD CONSTRAINT "TournamentMatchEntrant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatchEntrant" ADD CONSTRAINT "TournamentMatchEntrant_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "TournamentEntrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

