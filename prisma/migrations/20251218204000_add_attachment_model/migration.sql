CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "Attachment" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "stepId" TEXT,
  "hazardId" TEXT,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  CONSTRAINT "Attachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RiskAssessmentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Attachment_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Attachment_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "Hazard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Attachment_caseId_idx" ON "Attachment"("caseId");
CREATE INDEX IF NOT EXISTS "Attachment_stepId_idx" ON "Attachment"("stepId");
CREATE INDEX IF NOT EXISTS "Attachment_hazardId_idx" ON "Attachment"("hazardId");

