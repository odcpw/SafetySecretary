CREATE EXTENSION IF NOT EXISTS "citext";

CREATE SCHEMA IF NOT EXISTS "shared";

CREATE TYPE "shared"."language_code" AS ENUM ('de', 'en', 'fr', 'it');

CREATE TABLE "shared"."tenants" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "default_language" "shared"."language_code" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shared"."users" (
  "id" UUID NOT NULL,
  "email" CITEXT NOT NULL,
  "ui_locale" "shared"."language_code",
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shared"."tenant_memberships" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shared"."invitations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "recipient_email" CITEXT NOT NULL,
  "token_hash" BYTEA NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_by" UUID NOT NULL,

  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shared"."magic_link_tokens" (
  "id" UUID NOT NULL,
  "email" CITEXT NOT NULL,
  "token_hash" BYTEA NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + interval '15 minutes'),
  "consumed_at" TIMESTAMPTZ(6),

  CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shared"."sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "device_hint" TEXT,

  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "shared"."users"("email");
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key" ON "shared"."tenant_memberships"("tenant_id", "user_id");
CREATE INDEX "tenant_memberships_user_id_idx" ON "shared"."tenant_memberships"("user_id");
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "shared"."invitations"("token_hash");
CREATE INDEX "invitations_created_by_idx" ON "shared"."invitations"("created_by");
CREATE INDEX "invitations_tenant_id_idx" ON "shared"."invitations"("tenant_id");
CREATE UNIQUE INDEX "magic_link_tokens_token_hash_key" ON "shared"."magic_link_tokens"("token_hash");
CREATE INDEX "sessions_tenant_id_idx" ON "shared"."sessions"("tenant_id");
CREATE INDEX "sessions_user_id_idx" ON "shared"."sessions"("user_id");

ALTER TABLE "shared"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "shared"."tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shared"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "shared"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shared"."invitations"
  ADD CONSTRAINT "invitations_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "shared"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shared"."invitations"
  ADD CONSTRAINT "invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "shared"."tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shared"."sessions"
  ADD CONSTRAINT "sessions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "shared"."tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shared"."sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "shared"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "shared"."prevent_session_tenant_id_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN
    RAISE EXCEPTION 'sessions.tenant_id is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sessions_tenant_id_immutable"
BEFORE UPDATE OF "tenant_id" ON "shared"."sessions"
FOR EACH ROW
EXECUTE FUNCTION "shared"."prevent_session_tenant_id_update"();
