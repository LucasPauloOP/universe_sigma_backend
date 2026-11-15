-- AlterEnum
-- (em migration própria: o Postgres não deixa usar o valor novo na mesma transação)
ALTER TYPE "EpisodeStatus" ADD VALUE IF NOT EXISTS 'UNPLANNED' BEFORE 'PLANNED';
