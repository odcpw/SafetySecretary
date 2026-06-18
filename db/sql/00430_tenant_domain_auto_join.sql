-- F1-domain-autojoin: opt-in company-domain auto-join.
-- Security invariant: same-domain users never gain membership implicitly.
-- Auto-join is allowed only for the tenant creator or when this flag is ON;
-- every other same-domain user must redeem an invitation. Default OFF for all
-- existing and future tenants to close the cross-tenant auto-join breach.

ALTER TABLE "shared"."tenants"
  ADD COLUMN IF NOT EXISTS "domain_auto_join_enabled" boolean NOT NULL DEFAULT false;

UPDATE "shared"."tenants"
SET "domain_auto_join_enabled" = false
WHERE "domain_auto_join_enabled" IS NULL;

ALTER TABLE "shared"."tenants"
  ALTER COLUMN "domain_auto_join_enabled" SET DEFAULT false,
  ALTER COLUMN "domain_auto_join_enabled" SET NOT NULL;
