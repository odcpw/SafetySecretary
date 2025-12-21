CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "IncidentType" AS ENUM ('NEAR_MISS', 'FIRST_AID', 'LOST_TIME', 'PROPERTY_DAMAGE');
CREATE TYPE "IncidentTimelineConfidence" AS ENUM ('CONFIRMED', 'LIKELY', 'UNCLEAR');
CREATE TYPE "IncidentActionType" AS ENUM ('ENGINEERING', 'ORGANISATIONAL', 'PPE', 'TRAINING');

CREATE TABLE IF NOT EXISTS "IncidentCase" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "title" TEXT NOT NULL,
  "incidentAt" TIMESTAMP(3),
  "incidentTimeNote" TEXT,
  "location" TEXT,
  "incidentType" "IncidentType" NOT NULL,
  "coordinatorRole" TEXT NOT NULL,
  "coordinatorName" TEXT
);

CREATE TABLE IF NOT EXISTS "IncidentPerson" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "name" TEXT,
  CONSTRAINT "IncidentPerson_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "IncidentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentAccount" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "rawStatement" TEXT,
  CONSTRAINT "IncidentAccount_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "IncidentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentAccount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "IncidentPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentFact" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  CONSTRAINT "IncidentFact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "IncidentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentPersonalEvent" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "timeLabel" TEXT,
  "text" TEXT NOT NULL,
  CONSTRAINT "IncidentPersonalEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "IncidentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentTimelineEvent" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "timeLabel" TEXT,
  "text" TEXT NOT NULL,
  "confidence" "IncidentTimelineConfidence" NOT NULL DEFAULT 'LIKELY',
  CONSTRAINT "IncidentTimelineEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "IncidentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentTimelineSource" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timelineEventId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "factId" TEXT,
  "personalEventId" TEXT,
  CONSTRAINT "IncidentTimelineSource_timelineEventId_fkey" FOREIGN KEY ("timelineEventId") REFERENCES "IncidentTimelineEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentTimelineSource_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "IncidentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentTimelineSource_factId_fkey" FOREIGN KEY ("factId") REFERENCES "IncidentFact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "IncidentTimelineSource_personalEventId_fkey" FOREIGN KEY ("personalEventId") REFERENCES "IncidentPersonalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentDeviation" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "timelineEventId" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "expected" TEXT,
  "actual" TEXT,
  "changeObserved" TEXT,
  CONSTRAINT "IncidentDeviation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "IncidentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentDeviation_timelineEventId_fkey" FOREIGN KEY ("timelineEventId") REFERENCES "IncidentTimelineEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentCause" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deviationId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "statement" TEXT NOT NULL,
  CONSTRAINT "IncidentCause_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "IncidentDeviation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentAction" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "causeId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "ownerRole" TEXT,
  "dueDate" TIMESTAMP(3),
  "actionType" "IncidentActionType",
  CONSTRAINT "IncidentAction_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "IncidentCause"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IncidentAttachment" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "caseId" TEXT NOT NULL,
  "timelineEventId" TEXT,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  CONSTRAINT "IncidentAttachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "IncidentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IncidentAttachment_timelineEventId_fkey" FOREIGN KEY ("timelineEventId") REFERENCES "IncidentTimelineEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "IncidentPerson_caseId_idx" ON "IncidentPerson"("caseId");
CREATE INDEX IF NOT EXISTS "IncidentAccount_caseId_idx" ON "IncidentAccount"("caseId");
CREATE INDEX IF NOT EXISTS "IncidentAccount_personId_idx" ON "IncidentAccount"("personId");
CREATE INDEX IF NOT EXISTS "IncidentFact_accountId_idx" ON "IncidentFact"("accountId");
CREATE INDEX IF NOT EXISTS "IncidentPersonalEvent_accountId_idx" ON "IncidentPersonalEvent"("accountId");
CREATE INDEX IF NOT EXISTS "IncidentTimelineEvent_caseId_idx" ON "IncidentTimelineEvent"("caseId");
CREATE INDEX IF NOT EXISTS "IncidentTimelineSource_timelineEventId_idx" ON "IncidentTimelineSource"("timelineEventId");
CREATE INDEX IF NOT EXISTS "IncidentTimelineSource_accountId_idx" ON "IncidentTimelineSource"("accountId");
CREATE INDEX IF NOT EXISTS "IncidentTimelineSource_factId_idx" ON "IncidentTimelineSource"("factId");
CREATE INDEX IF NOT EXISTS "IncidentTimelineSource_personalEventId_idx" ON "IncidentTimelineSource"("personalEventId");
CREATE INDEX IF NOT EXISTS "IncidentDeviation_caseId_idx" ON "IncidentDeviation"("caseId");
CREATE INDEX IF NOT EXISTS "IncidentDeviation_timelineEventId_idx" ON "IncidentDeviation"("timelineEventId");
CREATE INDEX IF NOT EXISTS "IncidentCause_deviationId_idx" ON "IncidentCause"("deviationId");
CREATE INDEX IF NOT EXISTS "IncidentAction_causeId_idx" ON "IncidentAction"("causeId");
CREATE INDEX IF NOT EXISTS "IncidentAttachment_caseId_idx" ON "IncidentAttachment"("caseId");
CREATE INDEX IF NOT EXISTS "IncidentAttachment_timelineEventId_idx" ON "IncidentAttachment"("timelineEventId");
