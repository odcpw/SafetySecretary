-- ssfw-enj3: chemical_control storage contract for every provisioned tenant schema.
-- Controls are scoped by tenant schema and belong to chemical_profile rows.

CREATE OR REPLACE FUNCTION "shared"."enforce_chemical_control_storage_path"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_tenant_id uuid;
  storage_path_prefix text;
BEGIN
  IF NEW.source_storage_path IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format(
    'SELECT tenant_id FROM %I.chemical_profile WHERE id = $1',
    TG_TABLE_SCHEMA
  )
  INTO profile_tenant_id
  USING NEW.chemical_profile_id;

  IF profile_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  storage_path_prefix := 'tenants/' || profile_tenant_id::text || '/';

  IF NEW.source_storage_path NOT LIKE (storage_path_prefix || '%')
     OR length(NEW.source_storage_path) <= length(storage_path_prefix) THEN
    RAISE EXCEPTION 'source_storage_path must belong to the chemical profile tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_chemical_control_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
  chemical_profile_oid oid;
  chemical_control_oid oid;
  has_migration_role boolean;
BEGIN
  IF tenant_schema::text !~ '^tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant schema name: %', tenant_schema
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  SELECT class.oid
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = tenant_schema::text
    AND class.relname = 'chemical_profile'
    AND class.relkind = 'r'
  INTO chemical_profile_oid;

  IF chemical_profile_oid IS NULL THEN
    RAISE EXCEPTION 'chemical_profile must exist before chemical_control in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'chemical_control_type'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.chemical_control_type AS ENUM (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
      tenant_schema,
      'use_control',
      'ppe',
      'glove_type',
      'eye_protection',
      'respiratory',
      'environmental',
      'storage',
      'handling',
      'first_aid',
      'fire_fighting',
      'spill_response'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'chemical_control_source_provenance'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.chemical_control_source_provenance AS ENUM (%L, %L)',
      tenant_schema,
      'manual',
      'sds_extraction'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'chemical_control_review_status'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.chemical_control_review_status AS ENUM (%L, %L, %L)',
      tenant_schema,
      'pending',
      'approved',
      'rejected'
    );
  END IF;

  IF has_migration_role THEN
    EXECUTE format('GRANT REFERENCES ON TABLE %I.chemical_profile TO migration_role', tenant_schema);
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.chemical_control (
        id uuid PRIMARY KEY,
        chemical_profile_id uuid NOT NULL,
        control_type %I.chemical_control_type NOT NULL,
        control_text text NOT NULL,
        source_provenance %I.chemical_control_source_provenance NOT NULL DEFAULT 'manual',
        review_status %I.chemical_control_review_status NOT NULL DEFAULT 'pending',
        reviewed_by_user_id uuid,
        reviewed_at timestamptz,
        sort_order integer NOT NULL DEFAULT 0,
        sds_section text,
        source_excerpt text,
        page_line_ref text,
        source_filename text,
        source_storage_path text,
        extraction_model_marker text,
        extraction_confidence double precision,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chemical_control_profile_id_fkey
          FOREIGN KEY (chemical_profile_id) REFERENCES %I.chemical_profile(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT chemical_control_reviewed_by_user_id_fkey
          FOREIGN KEY (reviewed_by_user_id) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chemical_control_text_not_blank
          CHECK (btrim(control_text) <> ''),
        CONSTRAINT chemical_control_sort_order_non_negative
          CHECK (sort_order >= 0),
        CONSTRAINT chemical_control_review_pair_check
          CHECK (
            (review_status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
            OR (review_status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
          ),
        CONSTRAINT chemical_control_extraction_confidence_check
          CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
        CONSTRAINT chemical_control_sds_extraction_provenance_check
          CHECK (
            source_provenance = 'manual'
            OR (
              sds_section IS NOT NULL
              AND source_excerpt IS NOT NULL
              AND source_filename IS NOT NULL
              AND source_storage_path IS NOT NULL
              AND extraction_model_marker IS NOT NULL
            )
          ),
        CONSTRAINT chemical_control_sds_section_not_blank
          CHECK (sds_section IS NULL OR btrim(sds_section) <> ''),
        CONSTRAINT chemical_control_source_excerpt_not_blank
          CHECK (source_excerpt IS NULL OR btrim(source_excerpt) <> ''),
        CONSTRAINT chemical_control_page_line_ref_not_blank
          CHECK (page_line_ref IS NULL OR btrim(page_line_ref) <> ''),
        CONSTRAINT chemical_control_source_filename_not_blank
          CHECK (source_filename IS NULL OR btrim(source_filename) <> ''),
        CONSTRAINT chemical_control_source_storage_path_not_blank
          CHECK (source_storage_path IS NULL OR btrim(source_storage_path) <> ''),
        CONSTRAINT chemical_control_extraction_model_marker_not_blank
          CHECK (extraction_model_marker IS NULL OR btrim(extraction_model_marker) <> '')
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  SELECT class.oid
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = tenant_schema::text
    AND class.relname = 'chemical_control'
    AND class.relkind = 'r'
  INTO chemical_control_oid;

  EXECUTE format('CREATE INDEX IF NOT EXISTS chemical_control_profile_id_idx ON %I.chemical_control(chemical_profile_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS chemical_control_type_idx ON %I.chemical_control(control_type)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS chemical_control_source_provenance_idx ON %I.chemical_control(source_provenance)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS chemical_control_review_status_idx ON %I.chemical_control(review_status)', tenant_schema);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = chemical_control_oid
      AND tgname = 'chemical_control_storage_path_tenant_trigger'
  ) THEN
    EXECUTE format(
      $sql$
        CREATE TRIGGER chemical_control_storage_path_tenant_trigger
        BEFORE INSERT OR UPDATE OF chemical_profile_id, source_storage_path
        ON %I.chemical_control
        FOR EACH ROW
        EXECUTE FUNCTION shared.enforce_chemical_control_storage_path()
      $sql$,
      tenant_schema
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.chemical_control TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_chemical_control_schema_to_all_tenants"()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_schema name;
BEGIN
  FOR tenant_schema IN
    SELECT nspname::name
    FROM pg_catalog.pg_namespace
    WHERE nspname ~ '^tenant_[0-9a-f_]{36}$'
    ORDER BY nspname
  LOOP
    PERFORM "shared"."apply_chemical_profile_schema"(tenant_schema);
    PERFORM "shared"."apply_chemical_control_schema"(tenant_schema);
  END LOOP;
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
  PERFORM "shared"."apply_approval_snapshot_schema"(tenant_schema);
  PERFORM "shared"."apply_generated_artifact_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_case_schema"(tenant_schema);
  PERFORM "shared"."apply_snapshot_artifact_ii_fks"(tenant_schema);
  PERFORM "shared"."apply_chemical_profile_schema"(tenant_schema);
  PERFORM "shared"."apply_chemical_control_schema"(tenant_schema);

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  ) THEN
    GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;
  END IF;
END
$$;

SELECT "shared"."apply_chemical_control_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.chemical_control;
-- 2. DROP TYPE <tenant>.chemical_control_review_status;
-- 3. DROP TYPE <tenant>.chemical_control_source_provenance;
-- 4. DROP TYPE <tenant>.chemical_control_type;
-- 5. Re-apply db/sql/00230_chemical_profile.sql to restore the prior provisioning hook.
-- 6. DROP FUNCTION shared.apply_chemical_control_schema_to_all_tenants();
-- 7. DROP FUNCTION shared.apply_chemical_control_schema(name);
-- 8. DROP FUNCTION shared.enforce_chemical_control_storage_path();
