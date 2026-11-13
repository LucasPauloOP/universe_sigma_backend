-- AlterTable
ALTER TABLE "Show" ADD COLUMN     "nights" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "night" INTEGER;

