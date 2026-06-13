-- II beta workspace resolution: company domains share a tenant, while
-- public-email users get personal workspaces. This is shared auth metadata
-- only; tenant schemas are provisioned after magic-link verification.

ALTER TABLE "shared"."tenants"
  ADD COLUMN IF NOT EXISTS "workspace_kind" text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid NULL;

UPDATE "shared"."tenants"
SET "workspace_kind" = 'company'
WHERE "workspace_kind" IS NULL;

ALTER TABLE "shared"."tenants"
  ALTER COLUMN "workspace_kind" SET DEFAULT 'company',
  ALTER COLUMN "workspace_kind" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "shared"."tenants"
    ADD CONSTRAINT "tenants_workspace_kind_check"
    CHECK ("workspace_kind" IN ('company', 'personal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "shared"."tenants"
    ADD CONSTRAINT "tenants_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "shared"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "shared"."tenant_domains" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "domain" citext NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_domains_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "shared"."tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_domains_domain_key"
  ON "shared"."tenant_domains"("domain");

CREATE INDEX IF NOT EXISTS "tenant_domains_tenant_id_idx"
  ON "shared"."tenant_domains"("tenant_id");

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_personal_created_by_user_key"
  ON "shared"."tenants"("created_by_user_id")
  WHERE "workspace_kind" = 'personal'
    AND "created_by_user_id" IS NOT NULL;

COMMENT ON COLUMN "shared"."tenants"."workspace_kind" IS
  'II beta workspace mode: company tenants auto-join by email domain; personal tenants are exact-email public-domain workspaces.';

COMMENT ON COLUMN "shared"."tenants"."created_by_user_id" IS
  'User that first created this workspace through verified magic-link workspace resolution.';

COMMENT ON TABLE "shared"."tenant_domains" IS
  'Company-domain to tenant mapping for verified magic-link auto-join.';
