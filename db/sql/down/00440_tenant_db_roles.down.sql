-- Reverse of 00440_tenant_db_roles.sql (F4-db-privilege-split).
-- Idempotent: revokes the app login role's memberships and grants, then drops
-- the role if it exists. Safe to re-apply.

DO $$
DECLARE
  app_login_role name := 'safety_secretary_app';
  granted_role name;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = app_login_role::text
  ) THEN
    RETURN;
  END IF;

  -- Drop any tenant-role memberships granted TO the app login role so the role
  -- can be removed cleanly.
  FOR granted_role IN
    SELECT granted.rolname::name
    FROM pg_catalog.pg_auth_members auth_member
    JOIN pg_catalog.pg_roles granted
      ON granted.oid = auth_member.roleid
    JOIN pg_catalog.pg_roles member
      ON member.oid = auth_member.member
    WHERE member.rolname = app_login_role::text
  LOOP
    EXECUTE format('REVOKE %I FROM %I', granted_role, app_login_role);
  END LOOP;

  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA "shared" FROM %I', app_login_role);
  EXECUTE format('DROP OWNED BY %I', app_login_role);
  EXECUTE format('DROP ROLE %I', app_login_role);
END
$$;
