-- ADR-0001 tenant schema/role provisioning. This file is intentionally
-- idempotent: it creates per-tenant schemas and roles without adding tables.

CREATE SCHEMA IF NOT EXISTS "shared";

CREATE OR REPLACE FUNCTION "shared"."tenant_identifier_suffix"(tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  tenant_suffix text := replace(lower(tenant_id::text), '-', '_');
BEGIN
  IF tenant_suffix !~ '^[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant identifier suffix: %', tenant_suffix
      USING ERRCODE = '22023';
  END IF;

  RETURN tenant_suffix;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."tenant_schema_name"(tenant_id uuid)
RETURNS name
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  tenant_schema text := 'tenant_' || "shared"."tenant_identifier_suffix"(tenant_id);
BEGIN
  IF tenant_schema !~ '^tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant schema name: %', tenant_schema
      USING ERRCODE = '22023';
  END IF;

  RETURN tenant_schema::name;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."tenant_role_name"(tenant_id uuid)
RETURNS name
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  tenant_role text := 'role_tenant_' || "shared"."tenant_identifier_suffix"(tenant_id);
BEGIN
  IF tenant_role !~ '^role_tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant role name: %', tenant_role
      USING ERRCODE = '22023';
  END IF;

  RETURN tenant_role::name;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."grant_tenant_role_to_current_user"(tenant_role name)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF tenant_role::text = current_user THEN
    RETURN;
  END IF;

  IF current_setting('server_version_num')::integer >= 160000 THEN
    EXECUTE format('GRANT %I TO CURRENT_USER WITH INHERIT FALSE, SET TRUE', tenant_role);
  ELSE
    EXECUTE format('GRANT %I TO CURRENT_USER', tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."validate_app_login_role"(app_login_role name)
RETURNS name
LANGUAGE plpgsql
STABLE
STRICT
AS $$
DECLARE
  role_can_login boolean;
BEGIN
  IF app_login_role::text !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'Invalid app login role name: %', app_login_role
      USING ERRCODE = '22023';
  END IF;

  SELECT rolcanlogin
  FROM pg_catalog.pg_roles
  WHERE rolname = app_login_role::text
  INTO role_can_login;

  IF role_can_login IS NULL THEN
    RAISE EXCEPTION 'App login role does not exist: %', app_login_role
      USING ERRCODE = '42704';
  END IF;

  IF NOT role_can_login THEN
    RAISE EXCEPTION 'App login role must have LOGIN: %', app_login_role
      USING ERRCODE = '22023';
  END IF;

  RETURN app_login_role;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."grant_tenant_role_to_app_login"(
  tenant_role name,
  app_login_role name
)
RETURNS void
LANGUAGE plpgsql
STRICT
AS $$
DECLARE
  validated_app_login_role name := "shared"."validate_app_login_role"(app_login_role);
BEGIN
  IF validated_app_login_role = tenant_role THEN
    RAISE EXCEPTION 'App login role must be separate from tenant role: %', app_login_role
      USING ERRCODE = '22023';
  END IF;

  IF current_setting('server_version_num')::integer >= 160000 THEN
    EXECUTE format(
      'GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
      tenant_role,
      validated_app_login_role
    );
  ELSE
    EXECUTE format('GRANT %I TO %I', tenant_role, validated_app_login_role);
  END IF;

  EXECUTE format('GRANT USAGE ON SCHEMA "shared" TO %I', validated_app_login_role);
END
$$;

CREATE OR REPLACE FUNCTION "shared"."ensure_vector_extension"()
RETURNS name
LANGUAGE plpgsql
AS $$
DECLARE
  extension_schema name;
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA "shared";

  SELECT namespace.nspname::name
  FROM pg_catalog.pg_extension extension
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'vector'
  INTO extension_schema;

  IF extension_schema IS NULL THEN
    RAISE EXCEPTION 'vector extension was not created'
      USING ERRCODE = '55000';
  END IF;

  IF extension_schema <> 'shared'::name THEN
    ALTER EXTENSION vector SET SCHEMA "shared";
    extension_schema := 'shared'::name;
  END IF;

  RETURN extension_schema;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."provision_tenant_schema"(tenant_id uuid)
RETURNS TABLE(schema_name name, role_name name)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT provisioned.schema_name, provisioned.role_name
  FROM "shared"."provision_tenant_schema"(tenant_id, NULL::name) AS provisioned;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."provision_tenant_schema"(
  tenant_id uuid,
  app_login_role name
)
RETURNS TABLE(schema_name name, role_name name)
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_schema name := "shared"."tenant_schema_name"(tenant_id);
  tenant_role name := "shared"."tenant_role_name"(tenant_id);
  has_migration_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format(
      'CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      tenant_role
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      tenant_role
    );
  END IF;

  PERFORM "shared"."grant_tenant_role_to_current_user"(tenant_role);
  IF app_login_role IS NOT NULL THEN
    PERFORM "shared"."grant_tenant_role_to_app_login"(tenant_role, app_login_role);
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', tenant_schema, tenant_role);
  EXECUTE format('ALTER SCHEMA %I OWNER TO %I', tenant_schema, tenant_role);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', tenant_schema, tenant_role);
  EXECUTE format('GRANT USAGE ON SCHEMA "shared" TO %I', tenant_role);

  IF has_migration_role THEN
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO migration_role', tenant_schema);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      tenant_schema,
      tenant_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
      tenant_schema,
      tenant_role
    );
  END IF;

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    tenant_schema,
    tenant_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
    tenant_schema,
    tenant_role
  );

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
    tenant_schema,
    tenant_role
  );
  EXECUTE format(
    'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO %I',
    tenant_schema,
    tenant_role
  );

  IF has_migration_role THEN
    EXECUTE format(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I FROM migration_role',
      tenant_schema
    );
    EXECUTE format(
      'REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I FROM migration_role',
      tenant_schema
    );
  END IF;

  PERFORM "shared"."ensure_vector_extension"();

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."drop_tenant_schema"(tenant_id uuid)
RETURNS TABLE(schema_name name, role_name name)
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_schema name := "shared"."tenant_schema_name"(tenant_id);
  tenant_role name := "shared"."tenant_role_name"(tenant_id);
  has_schema boolean;
  has_role boolean;
  has_migration_role boolean;
  role_member name;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace
    WHERE nspname = tenant_schema::text
  )
  INTO has_schema;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  )
  INTO has_role;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  IF has_schema AND has_role THEN
    IF has_migration_role THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA %I REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM %I',
        tenant_schema,
        tenant_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA %I REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM %I',
        tenant_schema,
        tenant_role
      );
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM migration_role', tenant_schema);
    END IF;

    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM %I',
      tenant_schema,
      tenant_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM %I',
      tenant_schema,
      tenant_role
    );
    EXECUTE format(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I FROM %I',
      tenant_schema,
      tenant_role
    );
    EXECUTE format(
      'REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I FROM %I',
      tenant_schema,
      tenant_role
    );
    EXECUTE format('DROP SCHEMA %I CASCADE', tenant_schema);
  ELSIF has_schema THEN
    EXECUTE format('DROP SCHEMA %I CASCADE', tenant_schema);
  END IF;

  IF has_role THEN
    FOR role_member IN
      SELECT member_role.rolname::name
      FROM pg_catalog.pg_auth_members auth_member
      JOIN pg_catalog.pg_roles granted_role
        ON granted_role.oid = auth_member.roleid
      JOIN pg_catalog.pg_roles member_role
        ON member_role.oid = auth_member.member
      WHERE granted_role.rolname = tenant_role::text
    LOOP
      EXECUTE format('REVOKE %I FROM %I', tenant_role, role_member);
    END LOOP;

    EXECUTE format('DROP OWNED BY %I', tenant_role);
    EXECUTE format('DROP ROLE %I', tenant_role);
  END IF;

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;
