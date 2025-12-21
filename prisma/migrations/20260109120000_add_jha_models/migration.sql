CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "JhaCase" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "jobTitle" TEXT NOT NULL,
  "site" TEXT,
  "supervisor" TEXT,
  "workersInvolved" TEXT,
  "jobDate" TIMESTAMP(3),
  "revision" TEXT,
  "preparedBy" TEXT,
  "reviewedBy" TEXT,
  "approvedBy" TEXT,
  "signoffDate" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "JhaStep" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  CONSTRAINT "JhaStep_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "JhaCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "JhaHazard" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "hazard" TEXT NOT NULL,
  "consequence" TEXT,
  "controls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "JhaHazard_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "JhaCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JhaHazard_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "JhaStep"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "JhaAttachment" (
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
  CONSTRAINT "JhaAttachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "JhaCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JhaAttachment_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "JhaStep"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JhaAttachment_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "JhaHazard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "JhaStep_caseId_idx" ON "JhaStep"("caseId");
CREATE INDEX IF NOT EXISTS "JhaHazard_caseId_idx" ON "JhaHazard"("caseId");
CREATE INDEX IF NOT EXISTS "JhaHazard_stepId_orderIndex_idx" ON "JhaHazard"("stepId", "orderIndex");
CREATE INDEX IF NOT EXISTS "JhaAttachment_caseId_idx" ON "JhaAttachment"("caseId");
CREATE INDEX IF NOT EXISTS "JhaAttachment_stepId_idx" ON "JhaAttachment"("stepId");
CREATE INDEX IF NOT EXISTS "JhaAttachment_hazardId_idx" ON "JhaAttachment"("hazardId");
