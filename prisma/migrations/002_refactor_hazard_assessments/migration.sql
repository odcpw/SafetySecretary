-- Add new enums
DO $$ BEGIN
  CREATE TYPE "HazardAssessmentType" AS ENUM ('BASELINE', 'RESIDUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "HazardControlType" AS ENUM ('EXISTING');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Drop legacy columns from Hazard
ALTER TABLE "Hazard"
  DROP COLUMN IF EXISTS "severity",
  DROP COLUMN IF EXISTS "likelihood",
  DROP COLUMN IF EXISTS "riskRating",
  DROP COLUMN IF EXISTS "existingControls",
  DROP COLUMN IF EXISTS "residualSeverity",
  DROP COLUMN IF EXISTS "residualLikelihood",
  DROP COLUMN IF EXISTS "residualRiskRating";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create HazardAssessment table
CREATE TABLE IF NOT EXISTS "HazardAssessment" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hazardId" TEXT NOT NULL,
  "type" "HazardAssessmentType" NOT NULL,
  "severity" TEXT NOT NULL,
  "likelihood" TEXT NOT NULL,
  "riskRating" TEXT NOT NULL,
  CONSTRAINT "HazardAssessment_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "Hazard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "HazardAssessment_hazard_type_key" ON "HazardAssessment"("hazardId", "type");

-- Create HazardControl table
CREATE TABLE IF NOT EXISTS "HazardControl" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hazardId" TEXT NOT NULL,
  "type" "HazardControlType" NOT NULL DEFAULT 'EXISTING',
  "description" TEXT NOT NULL,
  CONSTRAINT "HazardControl_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "Hazard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "HazardControl_hazard_type_key" ON "HazardControl"("hazardId", "type");
CREATE INDEX IF NOT EXISTS "HazardControl_hazardId_idx" ON "HazardControl"("hazardId");
