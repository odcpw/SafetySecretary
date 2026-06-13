-- ssfw-92d: company-level cloud/local vision opt-in.
-- Privacy invariant: every existing and future tenant defaults vision OFF.

ALTER TABLE "shared"."tenants"
  ADD COLUMN IF NOT EXISTS "vision_enabled" boolean NOT NULL DEFAULT false;

UPDATE "shared"."tenants"
SET "vision_enabled" = false
WHERE "vision_enabled" IS NULL;

ALTER TABLE "shared"."tenants"
  ALTER COLUMN "vision_enabled" SET DEFAULT false,
  ALTER COLUMN "vision_enabled" SET NOT NULL;
