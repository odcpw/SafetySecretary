-- Stable provider identity bindings for OAuth sign-in. Email remains the
-- workspace key, but provider+subject prevents silent rebinding when a provider
-- account changes or presents a different address.

CREATE TABLE IF NOT EXISTS "shared"."oauth_identities" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_subject" text NOT NULL,
  "issuer" text NULL,
  "email" citext NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "shared"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "oauth_identities_provider_check"
    CHECK ("provider" IN ('google', 'microsoft'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_identities_provider_subject_key"
  ON "shared"."oauth_identities"("provider", "provider_subject");

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_identities_provider_user_key"
  ON "shared"."oauth_identities"("provider", "user_id");

CREATE INDEX IF NOT EXISTS "oauth_identities_user_id_idx"
  ON "shared"."oauth_identities"("user_id");

COMMENT ON TABLE "shared"."oauth_identities" IS
  'OAuth provider subjects linked to Safety Secretary users after verified provider sign-in.';
