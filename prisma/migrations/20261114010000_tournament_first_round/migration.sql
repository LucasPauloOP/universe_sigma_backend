-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "firstRoundMatches" INTEGER,
ADD COLUMN "firstRoundPerMatch" INTEGER;

-- AlterTable
ALTER TABLE "TournamentEntrant" ADD COLUMN "startRound" INTEGER NOT NULL DEFAULT 1;
