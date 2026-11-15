-- CreateTable
CREATE TABLE "TitleBaseline" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "wrestlerId" TEXT,
    "teamId" TEXT,
    "reigns" INTEGER NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "TitleBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TitleBaseline_titleId_idx" ON "TitleBaseline"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "TitleBaseline_titleId_wrestlerId_key" ON "TitleBaseline"("titleId", "wrestlerId");

-- CreateIndex
CREATE UNIQUE INDEX "TitleBaseline_titleId_teamId_key" ON "TitleBaseline"("titleId", "teamId");

-- AddForeignKey
ALTER TABLE "TitleBaseline" ADD CONSTRAINT "TitleBaseline_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleBaseline" ADD CONSTRAINT "TitleBaseline_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleBaseline" ADD CONSTRAINT "TitleBaseline_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

