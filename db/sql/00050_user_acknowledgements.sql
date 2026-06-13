CREATE TABLE IF NOT EXISTS "shared"."user_acknowledgements" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "disclaimer_version" TEXT NOT NULL,
  "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_acknowledgements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_acknowledgements_user_id_disclaimer_version_key"
  ON "shared"."user_acknowledgements"("user_id", "disclaimer_version");

CREATE INDEX IF NOT EXISTS "user_acknowledgements_user_id_idx"
  ON "shared"."user_acknowledgements"("user_id");

ALTER TABLE "shared"."user_acknowledgements"
  DROP CONSTRAINT IF EXISTS "user_acknowledgements_user_id_fkey";

ALTER TABLE "shared"."user_acknowledgements"
  ADD CONSTRAINT "user_acknowledgements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "shared"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
