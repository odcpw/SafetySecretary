-- Add orderIndex to CorrectiveAction for stable manual ordering within hazards.

ALTER TABLE "CorrectiveAction" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "CorrectiveAction_caseId_hazardId_orderIndex_idx"
  ON "CorrectiveAction"("caseId", "hazardId", "orderIndex", "createdAt");

