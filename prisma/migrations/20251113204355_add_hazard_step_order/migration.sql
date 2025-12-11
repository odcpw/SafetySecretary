-- AlterTable
ALTER TABLE "HazardAssessment" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "HazardControl" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "HazardStep" ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "HazardStep_stepId_orderIndex_idx" ON "HazardStep"("stepId", "orderIndex");

-- RenameIndex
ALTER INDEX "HazardAssessment_hazard_type_key" RENAME TO "HazardAssessment_hazardId_type_key";

-- RenameIndex
ALTER INDEX "HazardControl_hazard_type_key" RENAME TO "HazardControl_hazardId_type_key";
