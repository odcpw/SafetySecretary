CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bring older schemas in line with the current Prisma models before enforcing step-scoped hazards.

-- Ensure enum values expected by the current Prisma schema exist.
ALTER TYPE "RiskAssessmentPhase" ADD VALUE IF NOT EXISTS 'HAZARD_IDENTIFICATION';
ALTER TYPE "RiskAssessmentPhase" ADD VALUE IF NOT EXISTS 'CONTROL_DISCUSSION';

-- Proposed control hierarchy enum (used by HazardControl.hierarchy).
DO $$ BEGIN
  CREATE TYPE "ControlHierarchy" AS ENUM ('SUBSTITUTION', 'TECHNICAL', 'ORGANIZATIONAL', 'PPE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ProcessStep triad fields: title -> activity, plus equipment/substances arrays.
DO $$
BEGIN
  IF to_regclass('"ProcessStep"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'ProcessStep' AND column_name = 'title'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'ProcessStep' AND column_name = 'activity'
    ) THEN
      EXECUTE 'ALTER TABLE "ProcessStep" RENAME COLUMN "title" TO "activity"';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'ProcessStep' AND column_name = 'activity'
    ) THEN
      EXECUTE 'ALTER TABLE "ProcessStep" ADD COLUMN "activity" TEXT';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'ProcessStep' AND column_name = 'title'
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'ProcessStep' AND column_name = 'activity'
    ) THEN
      EXECUTE 'UPDATE "ProcessStep" SET "activity" = COALESCE("activity", "title")';
    END IF;

    EXECUTE 'UPDATE "ProcessStep" SET "activity" = COALESCE("activity", ''Unassigned step (auto)'') WHERE "activity" IS NULL';
    EXECUTE 'ALTER TABLE "ProcessStep" ALTER COLUMN "activity" SET NOT NULL';

    EXECUTE 'ALTER TABLE "ProcessStep" ADD COLUMN IF NOT EXISTS "equipment" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]';
    EXECUTE 'ALTER TABLE "ProcessStep" ADD COLUMN IF NOT EXISTS "substances" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]';
  END IF;
END $$;

-- Hazard fields expected by the current Prisma schema.
ALTER TABLE "Hazard" ADD COLUMN IF NOT EXISTS "categoryCode" TEXT;

DO $$
DECLARE existing_controls_udt TEXT;
BEGIN
  IF to_regclass('"Hazard"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'Hazard' AND column_name = 'existingControls'
    ) THEN
      BEGIN
        SELECT udt_name
        INTO existing_controls_udt
        FROM information_schema.columns
        WHERE table_name = 'Hazard' AND column_name = 'existingControls';

        IF existing_controls_udt = '_text' THEN
          EXECUTE 'ALTER TABLE "Hazard" ALTER COLUMN "existingControls" SET DEFAULT ARRAY[]::TEXT[]';
          EXECUTE 'UPDATE "Hazard" SET "existingControls" = ARRAY[]::TEXT[] WHERE "existingControls" IS NULL';
          EXECUTE 'ALTER TABLE "Hazard" ALTER COLUMN "existingControls" SET NOT NULL';
        ELSE
          EXECUTE '
            ALTER TABLE "Hazard"
              ALTER COLUMN "existingControls" TYPE TEXT[] USING (
                CASE
                  WHEN "existingControls" IS NULL THEN ARRAY[]::TEXT[]
                  WHEN "existingControls"::text = '''' THEN ARRAY[]::TEXT[]
                  ELSE ARRAY["existingControls"::text]
                END
              )';
          EXECUTE 'ALTER TABLE "Hazard" ALTER COLUMN "existingControls" SET DEFAULT ARRAY[]::TEXT[]';
          EXECUTE 'UPDATE "Hazard" SET "existingControls" = ARRAY[]::TEXT[] WHERE "existingControls" IS NULL';
          EXECUTE 'ALTER TABLE "Hazard" ALTER COLUMN "existingControls" SET NOT NULL';
        END IF;
      EXCEPTION
        WHEN others THEN
          EXECUTE 'ALTER TABLE "Hazard" DROP COLUMN "existingControls"';
          EXECUTE 'ALTER TABLE "Hazard" ADD COLUMN "existingControls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]';
      END;
    ELSE
      EXECUTE 'ALTER TABLE "Hazard" ADD COLUMN "existingControls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]';
    END IF;
  END IF;
END $$;

-- Align HazardControl to current Prisma schema (multiple rows per hazard, optional hierarchy).
DO $$
BEGIN
  IF to_regclass('"HazardControl"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "HazardControl" ADD COLUMN IF NOT EXISTS "hierarchy" "ControlHierarchy"';
    EXECUTE 'DROP INDEX IF EXISTS "HazardControl_hazardId_type_key"';
    EXECUTE 'DROP INDEX IF EXISTS "HazardControl_hazard_type_key"';
    EXECUTE 'ALTER TABLE "HazardControl" DROP COLUMN IF EXISTS "type"';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "HazardControl_hazardId_idx" ON "HazardControl"("hazardId")';
  END IF;
END $$;

DROP TYPE IF EXISTS "HazardControlType";

-- Step-scoped hazards (each hazard row belongs to exactly one ProcessStep)
ALTER TABLE "Hazard" ADD COLUMN IF NOT EXISTS "stepId" TEXT;
ALTER TABLE "Hazard" ADD COLUMN IF NOT EXISTS "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- If the legacy HazardStep join exists, split multi-step hazards into per-step hazard rows.
DO $$
BEGIN
  IF to_regclass('"HazardStep"') IS NOT NULL THEN
    -- Assign each existing hazard a primary step (lowest orderIndex) from HazardStep.
    WITH first_step AS (
      SELECT DISTINCT ON ("hazardId") "hazardId", "stepId", "orderIndex"
      FROM "HazardStep"
      ORDER BY "hazardId", "orderIndex" ASC
    )
    UPDATE "Hazard" h
    SET "stepId" = fs."stepId",
        "orderIndex" = fs."orderIndex"
    FROM first_step fs
    WHERE h."id" = fs."hazardId"
      AND h."stepId" IS NULL;

    -- Build a mapping of additional step links that should become duplicated hazards.
    CREATE TEMP TABLE "HazardSplitMap" (
      "oldHazardId" TEXT NOT NULL,
      "newHazardId" TEXT NOT NULL,
      "stepId" TEXT NOT NULL,
      "orderIndex" INTEGER NOT NULL
    ) ON COMMIT DROP;

    WITH ranked AS (
      SELECT
        hs."hazardId" AS "oldHazardId",
        hs."stepId",
        hs."orderIndex",
        ROW_NUMBER() OVER (PARTITION BY hs."hazardId" ORDER BY hs."orderIndex" ASC) AS rn
      FROM "HazardStep" hs
    )
    INSERT INTO "HazardSplitMap" ("oldHazardId", "newHazardId", "stepId", "orderIndex")
    SELECT
      r."oldHazardId",
      uuid_generate_v4()::text,
      r."stepId",
      r."orderIndex"
    FROM ranked r
    WHERE r.rn > 1;

    -- Duplicate Hazard rows for additional step links.
    INSERT INTO "Hazard" (
      "id",
      "createdAt",
      "updatedAt",
      "caseId",
      "stepId",
      "orderIndex",
      "label",
      "description",
      "categoryCode",
      "existingControls"
    )
    SELECT
      m."newHazardId",
      h."createdAt",
      h."updatedAt",
      h."caseId",
      m."stepId",
      m."orderIndex",
      h."label",
      h."description",
      h."categoryCode",
      h."existingControls"
    FROM "HazardSplitMap" m
    JOIN "Hazard" h ON h."id" = m."oldHazardId";

    -- Duplicate assessments to the new hazard rows.
    IF to_regclass('"HazardAssessment"') IS NOT NULL THEN
      INSERT INTO "HazardAssessment" (
        "id",
        "createdAt",
        "updatedAt",
        "hazardId",
        "type",
        "severity",
        "likelihood",
        "riskRating"
      )
      SELECT
        uuid_generate_v4()::text,
        ha."createdAt",
        ha."updatedAt",
        m."newHazardId",
        ha."type",
        ha."severity",
        ha."likelihood",
        ha."riskRating"
      FROM "HazardAssessment" ha
      JOIN "HazardSplitMap" m ON m."oldHazardId" = ha."hazardId";
    END IF;

    -- Duplicate proposed controls to the new hazard rows.
    IF to_regclass('"HazardControl"') IS NOT NULL THEN
      INSERT INTO "HazardControl" (
        "id",
        "createdAt",
        "updatedAt",
        "hazardId",
        "description",
        "hierarchy"
      )
      SELECT
        uuid_generate_v4()::text,
        hc."createdAt",
        hc."updatedAt",
        m."newHazardId",
        hc."description",
        hc."hierarchy"
      FROM "HazardControl" hc
      JOIN "HazardSplitMap" m ON m."oldHazardId" = hc."hazardId";
    END IF;

    -- Duplicate attachments where they are unscoped or match the target step.
    IF to_regclass('"Attachment"') IS NOT NULL THEN
      INSERT INTO "Attachment" (
        "id",
        "createdAt",
        "updatedAt",
        "caseId",
        "stepId",
        "hazardId",
        "orderIndex",
        "originalName",
        "mimeType",
        "byteSize",
        "storageKey"
      )
      SELECT
        uuid_generate_v4()::text,
        a."createdAt",
        a."updatedAt",
        a."caseId",
        COALESCE(a."stepId", m."stepId"),
        m."newHazardId",
        a."orderIndex",
        a."originalName",
        a."mimeType",
        a."byteSize",
        a."storageKey"
      FROM "Attachment" a
      JOIN "HazardSplitMap" m ON m."oldHazardId" = a."hazardId"
      WHERE a."stepId" IS NULL OR a."stepId" = m."stepId";
    END IF;

    -- Duplicate actions linked to multi-step hazards so each resulting hazard row keeps the same action plan items.
    IF to_regclass('"CorrectiveAction"') IS NOT NULL THEN
      INSERT INTO "CorrectiveAction" (
        "id",
        "createdAt",
        "updatedAt",
        "caseId",
        "hazardId",
        "description",
        "owner",
        "dueDate",
        "status"
      )
      SELECT
        uuid_generate_v4()::text,
        ca."createdAt",
        ca."updatedAt",
        ca."caseId",
        m."newHazardId",
        ca."description",
        ca."owner",
        ca."dueDate",
        ca."status"
      FROM "CorrectiveAction" ca
      JOIN "HazardSplitMap" m ON m."oldHazardId" = ca."hazardId";
    END IF;

    -- Drop the legacy join table.
    DROP TABLE "HazardStep";
  END IF;
END $$;

-- Ensure any hazards without a step land on the case's first step (or create a placeholder step if needed).
WITH first_case_step AS (
  SELECT DISTINCT ON ("caseId") "caseId", "id" AS "stepId"
  FROM "ProcessStep"
  ORDER BY "caseId", "orderIndex" ASC
)
UPDATE "Hazard" h
SET "stepId" = fcs."stepId",
    "orderIndex" = 0
FROM first_case_step fcs
WHERE h."stepId" IS NULL
  AND h."caseId" = fcs."caseId";

WITH cases_missing_steps AS (
  SELECT DISTINCT h."caseId"
  FROM "Hazard" h
  WHERE h."stepId" IS NULL
),
inserted_steps AS (
  INSERT INTO "ProcessStep" (
    "id",
    "createdAt",
    "updatedAt",
    "caseId",
    "orderIndex",
    "activity",
    "equipment",
    "substances",
    "description"
  )
  SELECT
    uuid_generate_v4()::text,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    c."caseId",
    0,
    'Unassigned step (auto)',
    ARRAY[]::text[],
    ARRAY[]::text[],
    NULL
  FROM cases_missing_steps c
  RETURNING "caseId", "id"
)
UPDATE "Hazard" h
SET "stepId" = s."id",
    "orderIndex" = 0
FROM inserted_steps s
WHERE h."stepId" IS NULL
  AND h."caseId" = s."caseId";

-- Enforce hazard belongs to one step.
ALTER TABLE "Hazard" ALTER COLUMN "stepId" SET NOT NULL;
ALTER TABLE "Hazard"
  ADD CONSTRAINT "Hazard_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Hazard_stepId_orderIndex_idx" ON "Hazard"("stepId", "orderIndex");
