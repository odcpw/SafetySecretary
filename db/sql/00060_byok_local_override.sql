-- ssfw-duz: BYOK ciphertext and local OpenAI-compatible override config.
-- Secrets live only in byok_provider_config_ciphertext; local_override_config is
-- a non-secret operator setting and may include placeholder API tokens.

ALTER TABLE "shared"."tenants"
  ADD COLUMN IF NOT EXISTS "byok_provider_config_ciphertext" bytea NULL,
  ADD COLUMN IF NOT EXISTS "byok_provider_config_masked_indicator" text NULL,
  ADD COLUMN IF NOT EXISTS "local_override_config" jsonb NULL;

COMMENT ON COLUMN "shared"."tenants"."byok_provider_config_ciphertext" IS
  'AES-256-GCM ciphertext produced with MASTER_ENCRYPTION_KEY; stores per-company BYOK provider config.';

COMMENT ON COLUMN "shared"."tenants"."byok_provider_config_masked_indicator" IS
  'Non-secret masked BYOK indicator computed at save time, e.g. OpenAI key configured: sk-...abc4.';

COMMENT ON COLUMN "shared"."tenants"."local_override_config" IS
  'Non-secret OpenAI-compatible local override JSON: baseUrl, apiKey optional, textModel, visionModel.';
