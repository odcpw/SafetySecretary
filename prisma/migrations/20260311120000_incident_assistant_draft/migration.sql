ALTER TABLE "IncidentCase"
ADD COLUMN IF NOT EXISTS "assistantNarrative" TEXT,
ADD COLUMN IF NOT EXISTS "assistantDraft" JSONB,
ADD COLUMN IF NOT EXISTS "assistantDraftUpdatedAt" TIMESTAMP(3);
