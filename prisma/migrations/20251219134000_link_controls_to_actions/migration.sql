-- Add link from CorrectiveAction -> HazardControl so proposed controls can populate the action plan.

ALTER TABLE "CorrectiveAction" ADD COLUMN "controlId" TEXT;

CREATE UNIQUE INDEX "CorrectiveAction_controlId_key" ON "CorrectiveAction"("controlId");
CREATE INDEX "CorrectiveAction_controlId_idx" ON "CorrectiveAction"("controlId");

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_controlId_fkey"
  FOREIGN KEY ("controlId") REFERENCES "HazardControl"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

