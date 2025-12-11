-- Add new phase to enum
ALTER TYPE "RiskAssessmentPhase" ADD VALUE IF NOT EXISTS 'RESIDUAL_RISK';

-- Add controls and residual risk columns
ALTER TABLE "Hazard"
  ADD COLUMN IF NOT EXISTS "existingControls" TEXT,
  ADD COLUMN IF NOT EXISTS "residualSeverity" TEXT,
  ADD COLUMN IF NOT EXISTS "residualLikelihood" TEXT,
  ADD COLUMN IF NOT EXISTS "residualRiskRating" TEXT;
