-- ssfw-5kej: per-tenant capability/provider gating matrix.
-- The JSONB stores capability metadata plus opaque credential/endpoint refs only.
-- This migration adds the JSONB object slot and default only; runtime storage
-- materializes the concrete per-capability shape when settings are saved.

ALTER TABLE "shared"."tenants"
  ADD COLUMN IF NOT EXISTS "capabilities" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "shared"."tenants"
SET "capabilities" = '{}'::jsonb
WHERE "capabilities" IS NULL;

ALTER TABLE "shared"."tenants"
  ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "capabilities" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "shared"."tenants"
    ADD CONSTRAINT "tenants_capabilities_is_object"
    CHECK (jsonb_typeof("capabilities") = 'object');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "shared"."tenants"
    ADD CONSTRAINT "tenants_capabilities_no_raw_provider_material"
    CHECK (
      "capabilities"::text !~* '("(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|authorization|password|endpoint[_-]?url|base[_-]?url|url|uri)"[[:space:]]*:|sk-[a-z0-9_-]{8,}|xox[baprs]-[a-z0-9-]{8,}|gh[pousr]_[a-z0-9_]{8,}|AIza[0-9a-z_-]{10,}|bearer[[:space:]]+[a-z0-9._~+/-]{12,}|https?://)'
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN "shared"."tenants"."capabilities" IS
  'Per-capability JSONB metadata for ssfw-5kej: enabled, provider_mode, credential_ref, endpoint_ref, configured_at, configured_by_user_id, data_handling_note_ref. Raw provider keys/tokens/URLs are forbidden; migration defaults to an empty object and runtime storage writes concrete capability entries.';
