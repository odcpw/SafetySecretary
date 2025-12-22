ALTER TABLE "IncidentCase"
  ADD COLUMN IF NOT EXISTS "workflowStage" TEXT NOT NULL DEFAULT 'facts';

ALTER TABLE "IncidentPerson"
  ADD COLUMN IF NOT EXISTS "otherInfo" TEXT;

ALTER TABLE "IncidentPersonalEvent"
  ADD COLUMN IF NOT EXISTS "eventAt" TIMESTAMP(3);

ALTER TABLE "IncidentTimelineEvent"
  ADD COLUMN IF NOT EXISTS "eventAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "IncidentCauseNode" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "parentId" TEXT,
  "timelineEventId" TEXT,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "statement" TEXT NOT NULL,
  "question" TEXT,
  "isRootCause" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "IncidentCauseNode_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "IncidentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentCauseNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "IncidentCauseNode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentCauseNode_timelineEventId_fkey" FOREIGN KEY ("timelineEventId") REFERENCES "IncidentTimelineEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentCauseAction" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "causeNodeId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL,
  "ownerRole" TEXT,
  "dueDate" TIMESTAMP(3),
  "actionType" "IncidentActionType",
  CONSTRAINT "IncidentCauseAction_causeNodeId_fkey" FOREIGN KEY ("causeNodeId") REFERENCES "IncidentCauseNode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "IncidentCauseNode_caseId_idx" ON "IncidentCauseNode"("caseId");
CREATE INDEX IF NOT EXISTS "IncidentCauseNode_parentId_idx" ON "IncidentCauseNode"("parentId");
CREATE INDEX IF NOT EXISTS "IncidentCauseNode_timelineEventId_idx" ON "IncidentCauseNode"("timelineEventId");
CREATE INDEX IF NOT EXISTS "IncidentCauseAction_causeNodeId_idx" ON "IncidentCauseAction"("causeNodeId");
