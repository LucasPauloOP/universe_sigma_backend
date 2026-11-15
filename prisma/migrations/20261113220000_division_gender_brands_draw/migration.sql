-- Divisões passam a ter gênero (M, W ou nulo = inter-gênero) e a pertencer a VÁRIAS brands;
-- lutas ganham a marca de empate. Os vínculos antigos (CardDivision.brandId) são COPIADOS
-- para a nova tabela antes de a coluna ser removida.

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "isDraw" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CardDivision" ADD COLUMN     "gender" "Gender";

-- CreateTable
CREATE TABLE "CardDivisionBrand" (
    "divisionId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "CardDivisionBrand_pkey" PRIMARY KEY ("divisionId","brandId")
);

-- Copia o vínculo antigo (uma brand por divisão) para a nova tabela
INSERT INTO "CardDivisionBrand" ("divisionId", "brandId")
SELECT "id", "brandId" FROM "CardDivision" WHERE "brandId" IS NOT NULL;

-- Gênero das divisões padrão que já existiam (pelo nome)
UPDATE "CardDivision" SET "gender" = 'W' WHERE "name" ILIKE 'women%';
UPDATE "CardDivision" SET "gender" = 'M' WHERE "name" IN ('Main Card', 'Mid Card', 'Tags');

-- DropForeignKey
ALTER TABLE "CardDivision" DROP CONSTRAINT "CardDivision_brandId_fkey";

-- DropIndex
DROP INDEX "CardDivision_universeId_brandId_idx";

-- AlterTable
ALTER TABLE "CardDivision" DROP COLUMN "brandId";

-- CreateIndex
CREATE INDEX "CardDivision_universeId_idx" ON "CardDivision"("universeId");

-- AddForeignKey
ALTER TABLE "CardDivisionBrand" ADD CONSTRAINT "CardDivisionBrand_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CardDivision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardDivisionBrand" ADD CONSTRAINT "CardDivisionBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
