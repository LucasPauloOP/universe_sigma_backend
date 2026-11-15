-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'W');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FULL_TIME', 'PART_TIME', 'LEGEND', 'FREE_AGENT', 'MANAGER', 'GM', 'CELEBRITY', 'VARIANT');

-- CreateEnum
CREATE TYPE "EditStatus" AS ENUM ('COMPLETE', 'NEEDED');

-- CreateEnum
CREATE TYPE "TeamKind" AS ENUM ('TAG_TEAM', 'FACTION');

-- CreateEnum
CREATE TYPE "ShowKind" AS ENUM ('WEEKLY', 'PLE', 'SPECIAL');

-- CreateEnum
CREATE TYPE "EpisodeStatus" AS ENUM ('PLANNED', 'DONE');

-- CreateEnum
CREATE TYPE "SegmentType" AS ENUM ('MATCH', 'PROMO', 'OTHER');

-- CreateEnum
CREATE TYPE "FinishType" AS ENUM ('PINFALL', 'SUBMISSION', 'COUNTOUT', 'DQ', 'OTHER');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SINGLE_ELIMINATION', 'ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('PLANNED', 'ONGOING', 'FINISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Universe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Universe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gm" TEXT,
    "color" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wrestler" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "alignmentId" TEXT,
    "divisionId" TEXT,
    "weightClassId" TEXT,
    "overall" INTEGER,
    "finisher" TEXT,
    "signature" TEXT,
    "hometown" TEXT,
    "isCustomCharacter" BOOLEAN NOT NULL DEFAULT false,
    "hasContract" BOOLEAN NOT NULL DEFAULT false,
    "isInjured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inTagDivision" BOOLEAN NOT NULL DEFAULT false,
    "editStatus" "EditStatus" NOT NULL DEFAULT 'COMPLETE',
    "imageUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wrestler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrestlerBrand" (
    "wrestlerId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "WrestlerBrand_pkey" PRIMARY KEY ("wrestlerId","brandId")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TeamKind" NOT NULL DEFAULT 'TAG_TEAM',
    "imageUrl" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "wrestlerId" TEXT NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","wrestlerId")
);

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "gender" "Gender",
    "isTag" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleReign" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "wonAtSegmentId" TEXT,

    CONSTRAINT "TitleReign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReignHolder" (
    "reignId" TEXT NOT NULL,
    "wrestlerId" TEXT,
    "teamId" TEXT,
    "id" TEXT NOT NULL,

    CONSTRAINT "ReignHolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "startDate" TIMESTAMP(3),

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Show" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "ShowKind" NOT NULL,
    "weekday" INTEGER,
    "ppvMonth" INTEGER,
    "imageUrl" TEXT,

    CONSTRAINT "Show_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "title" TEXT,
    "month" INTEGER NOT NULL,
    "week" INTEGER,
    "airDate" TIMESTAMP(3),
    "status" "EpisodeStatus" NOT NULL DEFAULT 'PLANNED',
    "imageUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchType" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MatchType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "SegmentType" NOT NULL,
    "matchTypeId" TEXT,
    "titleId" TEXT,
    "titleChanged" BOOLEAN NOT NULL DEFAULT false,
    "isMainEvent" BOOLEAN NOT NULL DEFAULT false,
    "finishType" "FinishType",
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentParticipant" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "wrestlerId" TEXT NOT NULL,
    "side" INTEGER NOT NULL DEFAULT 1,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SegmentParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "seasonId" TEXT,
    "name" TEXT NOT NULL,
    "format" "TournamentFormat" NOT NULL DEFAULT 'SINGLE_ELIMINATION',
    "size" INTEGER NOT NULL,
    "isTag" BOOLEAN NOT NULL DEFAULT false,
    "status" "TournamentStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "imageUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntrant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "seed" INTEGER,
    "wrestlerId" TEXT,
    "teamId" TEXT,

    CONSTRAINT "TournamentEntrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "groupName" TEXT,
    "entrantAId" TEXT,
    "entrantBId" TEXT,
    "winnerId" TEXT,
    "segmentId" TEXT,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alignment" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Alignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightClass" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WeightClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rivalry" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),

    CONSTRAINT "Rivalry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RivalryMember" (
    "rivalryId" TEXT NOT NULL,
    "wrestlerId" TEXT NOT NULL,

    CONSTRAINT "RivalryMember_pkey" PRIMARY KEY ("rivalryId","wrestlerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Universe_userId_idx" ON "Universe"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_universeId_name_key" ON "Brand"("universeId", "name");

-- CreateIndex
CREATE INDEX "Wrestler_universeId_isActive_idx" ON "Wrestler"("universeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Wrestler_universeId_name_key" ON "Wrestler"("universeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_universeId_name_key" ON "Team"("universeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Title_universeId_name_key" ON "Title"("universeId", "name");

-- CreateIndex
CREATE INDEX "TitleReign_titleId_startDate_idx" ON "TitleReign"("titleId", "startDate");

-- CreateIndex
CREATE INDEX "ReignHolder_reignId_idx" ON "ReignHolder"("reignId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_universeId_number_key" ON "Season"("universeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Show_universeId_name_key" ON "Show"("universeId", "name");

-- CreateIndex
CREATE INDEX "Episode_seasonId_month_week_idx" ON "Episode"("seasonId", "month", "week");

-- CreateIndex
CREATE INDEX "Episode_showId_idx" ON "Episode"("showId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchType_universeId_name_key" ON "MatchType"("universeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_episodeId_position_key" ON "Segment"("episodeId", "position");

-- CreateIndex
CREATE INDEX "SegmentParticipant_wrestlerId_idx" ON "SegmentParticipant"("wrestlerId");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentParticipant_segmentId_wrestlerId_key" ON "SegmentParticipant"("segmentId", "wrestlerId");

-- CreateIndex
CREATE INDEX "TournamentEntrant_tournamentId_idx" ON "TournamentEntrant"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMatch_segmentId_key" ON "TournamentMatch"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMatch_tournamentId_round_slot_key" ON "TournamentMatch"("tournamentId", "round", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "Alignment_universeId_name_key" ON "Alignment"("universeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Division_universeId_name_key" ON "Division"("universeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WeightClass_universeId_name_key" ON "WeightClass"("universeId", "name");

-- CreateIndex
CREATE INDEX "Rivalry_universeId_idx" ON "Rivalry"("universeId");

-- AddForeignKey
ALTER TABLE "Universe" ADD CONSTRAINT "Universe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wrestler" ADD CONSTRAINT "Wrestler_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wrestler" ADD CONSTRAINT "Wrestler_alignmentId_fkey" FOREIGN KEY ("alignmentId") REFERENCES "Alignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wrestler" ADD CONSTRAINT "Wrestler_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wrestler" ADD CONSTRAINT "Wrestler_weightClassId_fkey" FOREIGN KEY ("weightClassId") REFERENCES "WeightClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrestlerBrand" ADD CONSTRAINT "WrestlerBrand_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrestlerBrand" ADD CONSTRAINT "WrestlerBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Title" ADD CONSTRAINT "Title_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Title" ADD CONSTRAINT "Title_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleReign" ADD CONSTRAINT "TitleReign_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReignHolder" ADD CONSTRAINT "ReignHolder_reignId_fkey" FOREIGN KEY ("reignId") REFERENCES "TitleReign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReignHolder" ADD CONSTRAINT "ReignHolder_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReignHolder" ADD CONSTRAINT "ReignHolder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchType" ADD CONSTRAINT "MatchType_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_matchTypeId_fkey" FOREIGN KEY ("matchTypeId") REFERENCES "MatchType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentParticipant" ADD CONSTRAINT "SegmentParticipant_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentParticipant" ADD CONSTRAINT "SegmentParticipant_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntrant" ADD CONSTRAINT "TournamentEntrant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntrant" ADD CONSTRAINT "TournamentEntrant_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntrant" ADD CONSTRAINT "TournamentEntrant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_entrantAId_fkey" FOREIGN KEY ("entrantAId") REFERENCES "TournamentEntrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_entrantBId_fkey" FOREIGN KEY ("entrantBId") REFERENCES "TournamentEntrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "TournamentEntrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alignment" ADD CONSTRAINT "Alignment_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightClass" ADD CONSTRAINT "WeightClass_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RivalryMember" ADD CONSTRAINT "RivalryMember_rivalryId_fkey" FOREIGN KEY ("rivalryId") REFERENCES "Rivalry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RivalryMember" ADD CONSTRAINT "RivalryMember_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;
