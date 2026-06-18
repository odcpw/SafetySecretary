-- F4-db-privilege-split: least-privilege application login role.
--
-- Blast-radius reduction for ADR-0001 tenancy. Today the application connects
-- with a privileged base role (the DATABASE_URL login) that can run DDL, CREATE
-- ROLE, and DROP SCHEMA directly. This file introduces the *intended* privilege
-- split so ops can move request-time traffic onto a least-privilege login while
-- DDL / role management stays on a separate admin connection (ADMIN_DATABASE_URL,
-- read in src/lib/db).
--
-- This migration is intentionally conservative and idempotent: it creates the
-- app login role if it does not already exist and documents (in comments) the
-- grants ops must apply. It does NOT revoke anything from the existing base role
-- and does NOT alter request-time connection behavior on its own — running this
-- file plus setting ADMIN_DATABASE_URL plus granting the role is an ops rollout
-- step. Re-applying this file is safe.
--
-- Configure the login role name via SAFETY_SECRETARY_APP_LOGIN_ROLE /
-- DATABASE_APP_LOGIN_ROLE (see configuredAppLoginRole in src/lib/db/tenancy.ts);
-- the default name below matches that contract.

DO $$
DECLARE
  app_login_role name := 'safety_secretary_app';
BEGIN
  -- Validate the role name with the same rule the application enforces
  -- (shared.validate_app_login_role / appLoginRolePattern) before any DDL.
  IF app_login_role::text !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'Invalid app login role name: %', app_login_role
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = app_login_role::text
  ) THEN
    -- LOGIN so the application can connect; deliberately powerless otherwise:
    -- no INHERIT (it must SET ROLE into tenant roles explicitly), and no
    -- CREATEDB / CREATEROLE / SUPERUSER / REPLICATION. A password is set out of
    -- band by ops; this migration only establishes the role shape.
    EXECUTE format(
      'CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      app_login_role
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      app_login_role
    );
  END IF;

  -- The app role may read/use the shared schema (user accounts, tenant
  -- registry, invitations) since session/membership validation runs there.
  EXECUTE format('GRANT USAGE ON SCHEMA "shared" TO %I', app_login_role);

  -- Intended grants (applied as tenants are provisioned, NOT here):
  --   * shared.provision_tenant_schema(tenant_id, app_login_role) already
  --     GRANTs each tenant role TO the app role WITH SET TRUE, INHERIT FALSE
  --     (see db/sql/00020_tenant_provisioning.sql). That lets the app SET ROLE
  --     into a tenant role at connection checkout (withTenantConnection) without
  --     inheriting any tenant DML by default.
  --   * The app role must have NO direct SELECT/INSERT/UPDATE/DELETE on any
  --     tenant_* schema — all tenant DML must flow through SET ROLE so a stolen
  --     app connection cannot read across tenants. provision_tenant_schema only
  --     grants tenant DML to the tenant role, never to the app login role.
  --   * DDL on tenant schemas (CREATE/ALTER) stays with migration_role; schema
  --     and role lifecycle (CREATE ROLE / DROP SCHEMA / DROP ROLE) stays with
  --     the admin connection (ADMIN_DATABASE_URL). The app login role gets none
  --     of these.
END
$$;

COMMENT ON ROLE safety_secretary_app IS
  'Least-privilege application login (F4-db-privilege-split): may read shared.* and SET ROLE into tenant roles, but holds no direct DML on tenant schemas and no DDL / role-management rights. Request-time traffic should use this role once ADMIN_DATABASE_URL is configured for provisioning DDL.';
