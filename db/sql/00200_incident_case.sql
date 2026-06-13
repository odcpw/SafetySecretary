-- ssfw-t54: II data model for every provisioned tenant schema.
-- This migration is intentionally idempotent so it can be applied after
-- tenant provisioning in ephemeral validation and deployment flows.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_case_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
BEGIN
  IF tenant_schema::text !~ '^tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant schema name: %', tenant_schema
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace
    WHERE nspname = tenant_schema::text
  ) THEN
    RAISE EXCEPTION 'Tenant schema does not exist: %', tenant_schema
      USING ERRCODE = '3F000';
  END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_type'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.incident_type AS ENUM (%L, %L, %L)',
      tenant_schema,
      'NEAR_MISS',
      'ACCIDENT',
      'PROPERTY_DAMAGE'
    );
  END IF;
  EXECUTE format(
    'ALTER TYPE %I.incident_type ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'ACCIDENT'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_actual_injury_outcome'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.incident_actual_injury_outcome AS ENUM (%L, %L, %L, %L, %L, %L, %L)',
      tenant_schema,
      'UNKNOWN',
      'NO_INJURY',
      'FIRST_AID',
      'MEDICAL_TREATMENT',
      'LOST_TIME',
      'IRREVERSIBLE_INJURY',
      'FATALITY'
    );
  END IF;
  EXECUTE format(
    'ALTER TYPE %I.incident_actual_injury_outcome ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'UNKNOWN'
  );
  EXECUTE format(
    'ALTER TYPE %I.incident_actual_injury_outcome ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'NO_INJURY'
  );
  EXECUTE format(
    'ALTER TYPE %I.incident_actual_injury_outcome ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'MEDICAL_TREATMENT'
  );
  EXECUTE format(
    'ALTER TYPE %I.incident_actual_injury_outcome ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'IRREVERSIBLE_INJURY'
  );
  EXECUTE format(
    'ALTER TYPE %I.incident_actual_injury_outcome ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'FATALITY'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_action_status'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.incident_action_status AS ENUM (%L, %L, %L)',
      tenant_schema,
      'OPEN',
      'IN_PROGRESS',
      'COMPLETE'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_workflow_stage'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.incident_workflow_stage AS ENUM (%L, %L, %L, %L, %L, %L)',
      tenant_schema,
      'FACTS',
      'TIMELINE',
      'CAUSES',
      'ACTIONS',
      'REVIEW',
      'APPROVED'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_timeline_confidence'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.incident_timeline_confidence AS ENUM (%L, %L, %L)',
      tenant_schema,
      'CONFIRMED',
      'LIKELY',
      'UNCLEAR'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_action_type'
    ) THEN
      EXECUTE format(
        'CREATE TYPE %I.incident_action_type AS ENUM (%L, %L, %L, %L, %L, %L, %L)',
        tenant_schema,
        'SUBSTITUTION',
        'TECHNICAL',
        'ORGANIZATIONAL',
        'PPE',
        'ENGINEERING',
        'ORGANISATIONAL',
        'TRAINING'
      );
    ELSE
      EXECUTE format('ALTER TYPE %I.incident_action_type ADD VALUE IF NOT EXISTS %L', tenant_schema, 'SUBSTITUTION');
      EXECUTE format('ALTER TYPE %I.incident_action_type ADD VALUE IF NOT EXISTS %L', tenant_schema, 'TECHNICAL');
      EXECUTE format('ALTER TYPE %I.incident_action_type ADD VALUE IF NOT EXISTS %L', tenant_schema, 'ORGANIZATIONAL');
    END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_vision_consent'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.incident_vision_consent AS ENUM (%L, %L, %L)',
      tenant_schema,
      'ASK',
      'ALWAYS',
      'NEVER'
    );
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_case (
          id uuid PRIMARY KEY,
          case_number text,
          suva_case_number text,
          title text NOT NULL,
          incident_at timestamptz,
          incident_time_note text,
          location text,
          incident_type %I.incident_type NOT NULL,
          actual_injury_outcome %I.incident_actual_injury_outcome,
          actual_severity_code text,
          actual_severity_reason text,
          potential_outcome_text text,
          potential_severity_code text,
          potential_likelihood_code text,
          potential_risk_band text,
          hazard_category_code text,
          department_text text,
          area_text text,
          shift_text text,
          work_activity text,
          work_type text,
          event_type text,
          process_involved text,
          ppe_required text[] NOT NULL DEFAULT ARRAY[]::text[],
          ppe_worn text[] NOT NULL DEFAULT ARRAY[]::text[],
          injury_nature text,
          body_part text,
          lost_days integer,
          contractor_flag boolean,
          time_in_role_band text,
          reportable_uvg boolean,
          control_failure text,
          immediate_cause text,
          contributing_causes text[] NOT NULL DEFAULT ARRAY[]::text[],
          closed_at timestamptz,
          coordinator_role text NOT NULL,
          coordinator_name text,
        workflow_stage %I.incident_workflow_stage NOT NULL DEFAULT 'FACTS',
        cause_method text NOT NULL DEFAULT 'FIVE_WHYS',
        content_language shared.language_code NOT NULL,
        vision_consent %I.incident_vision_consent NOT NULL DEFAULT 'ASK',
        hira_followup_needed boolean NOT NULL DEFAULT false,
        hira_followup_text text,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT incident_case_content_language_check
            CHECK (content_language::text IN ('de', 'en', 'fr', 'it')),
          CONSTRAINT incident_case_actual_severity_code_check
            CHECK (actual_severity_code IS NULL OR actual_severity_code IN ('A', 'B', 'C', 'D', 'E')),
          CONSTRAINT incident_case_potential_severity_code_check
            CHECK (potential_severity_code IS NULL OR potential_severity_code IN ('A', 'B', 'C', 'D', 'E')),
        CONSTRAINT incident_case_potential_likelihood_code_check
          CHECK (potential_likelihood_code IS NULL OR potential_likelihood_code IN ('1', '2', '3', '4', '5')),
        CONSTRAINT incident_case_potential_risk_band_check
          CHECK (potential_risk_band IS NULL OR potential_risk_band IN ('HIGH', 'MEDIUM', 'LOW')),
        CONSTRAINT incident_case_hazard_category_code_check
          CHECK (
            hazard_category_code IS NULL OR hazard_category_code IN (
              'MECHANICAL',
              'FALLS',
              'ELECTRICAL',
              'HAZARDOUS_SUBSTANCES',
              'FIRE_EXPLOSION',
              'THERMAL',
              'PHYSICAL_AGENTS',
              'ENVIRONMENTAL',
              'MUSCULOSKELETAL',
              'PSYCHOSOCIAL',
              'UNEXPECTED_ACTIONS',
              'WORK_ORGANISATION'
            )
          ),
          CONSTRAINT incident_case_lost_days_check
            CHECK (lost_days IS NULL OR lost_days >= 0),
          CONSTRAINT incident_case_time_in_role_band_check
            CHECK (time_in_role_band IS NULL OR time_in_role_band IN ('<3M', '3-12M', '1-3Y', '>3Y', 'unknown')),
          CONSTRAINT incident_case_control_failure_check
            CHECK (control_failure IS NULL OR control_failure IN ('MISSING', 'INADEQUATE', 'BYPASSED', 'NOT_USED', 'UNKNOWN')),
          CONSTRAINT incident_case_event_type_check
            CHECK (event_type IS NULL OR event_type IN ('SLIP_TRIP_FALL', 'FALL_FROM_HEIGHT', 'STRUCK_BY', 'CAUGHT_IN_BETWEEN', 'CUT_PUNCTURE', 'MANUAL_HANDLING', 'CONTACT_HOT_COLD', 'CONTACT_WITH_CHEMICAL', 'ELECTRICITY', 'VEHICLE_TRAFFIC', 'FIRE_EXPLOSION', 'HARMFUL_EXPOSURE', 'PROPERTY_DAMAGE', 'OTHER')),
          CONSTRAINT incident_case_work_type_check
            CHECK (work_type IS NULL OR work_type IN ('MAINTENANCE', 'OPERATIONS', 'CLEANING', 'LOGISTICS', 'CONSTRUCTION', 'OFFICE', 'OTHER')),
          CONSTRAINT incident_case_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS actual_injury_outcome %I.incident_actual_injury_outcome',
      tenant_schema,
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS case_number text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS suva_case_number text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS actual_severity_code text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS actual_severity_reason text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS potential_outcome_text text',
      tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS potential_severity_code text',
    tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS potential_likelihood_code text',
    tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS potential_risk_band text',
    tenant_schema
  );
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = tenant_schema::text
      AND table_name = 'incident_case'
      AND column_name = 'injury_severity'
  ) THEN
    EXECUTE format(
      $sql$
        UPDATE %I.incident_case
        SET actual_injury_outcome = injury_severity::text::%I.incident_actual_injury_outcome
        WHERE actual_injury_outcome IS NULL
          AND injury_severity IS NOT NULL
          AND injury_severity::text IN ('FIRST_AID', 'LOST_TIME')
      $sql$,
      tenant_schema,
      tenant_schema
    );
  END IF;
  EXECUTE format(
    $sql$
      UPDATE %I.incident_case
      SET actual_injury_outcome = (
        CASE
          WHEN incident_type::text = 'FIRST_AID' THEN 'FIRST_AID'
          WHEN incident_type::text = 'LOST_TIME' THEN 'LOST_TIME'
          WHEN incident_type::text IN ('NEAR_MISS', 'PROPERTY_DAMAGE') THEN 'NO_INJURY'
          ELSE 'UNKNOWN'
        END
      )::%I.incident_actual_injury_outcome
      WHERE actual_injury_outcome IS NULL
    $sql$,
    tenant_schema,
    tenant_schema
  );
  EXECUTE format(
    $sql$
      UPDATE %I.incident_case
      SET actual_injury_outcome = 'NO_INJURY'::%I.incident_actual_injury_outcome
      WHERE actual_injury_outcome::text = 'NONE'
    $sql$,
    tenant_schema,
    tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS hazard_category_code text',
    tenant_schema
  );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS department_text text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS area_text text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS shift_text text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS work_activity text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS work_type text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS event_type text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS process_involved text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS ppe_required text[] NOT NULL DEFAULT ARRAY[]::text[]',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ALTER COLUMN ppe_required SET DEFAULT ARRAY[]::text[]',
      tenant_schema
    );
    EXECUTE format(
      'UPDATE %I.incident_case SET ppe_required = ARRAY[]::text[] WHERE ppe_required IS NULL',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ALTER COLUMN ppe_required SET NOT NULL',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS ppe_worn text[] NOT NULL DEFAULT ARRAY[]::text[]',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ALTER COLUMN ppe_worn SET DEFAULT ARRAY[]::text[]',
      tenant_schema
    );
    EXECUTE format(
      'UPDATE %I.incident_case SET ppe_worn = ARRAY[]::text[] WHERE ppe_worn IS NULL',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ALTER COLUMN ppe_worn SET NOT NULL',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS injury_nature text',
      tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS body_part text',
    tenant_schema
  );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS lost_days integer',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS contractor_flag boolean',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS time_in_role_band text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS reportable_uvg boolean',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS control_failure text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS immediate_cause text',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS contributing_causes text[] NOT NULL DEFAULT ARRAY[]::text[]',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ALTER COLUMN contributing_causes SET DEFAULT ARRAY[]::text[]',
      tenant_schema
    );
    EXECUTE format(
      'UPDATE %I.incident_case SET contributing_causes = ARRAY[]::text[] WHERE contributing_causes IS NULL',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ALTER COLUMN contributing_causes SET NOT NULL',
      tenant_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS closed_at timestamptz',
      tenant_schema
    );
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class class_record
      ON class_record.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace_record
      ON namespace_record.oid = class_record.relnamespace
    WHERE namespace_record.nspname = tenant_schema::text
      AND class_record.relname = 'incident_case'
      AND constraint_record.conname = 'incident_case_lost_days_check'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_lost_days_check CHECK (lost_days IS NULL OR lost_days >= 0)',
        tenant_schema
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
      JOIN pg_catalog.pg_class class_record
        ON class_record.oid = constraint_record.conrelid
      JOIN pg_catalog.pg_namespace namespace_record
        ON namespace_record.oid = class_record.relnamespace
      WHERE namespace_record.nspname = tenant_schema::text
        AND class_record.relname = 'incident_case'
        AND constraint_record.conname = 'incident_case_actual_severity_code_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_actual_severity_code_check CHECK (actual_severity_code IS NULL OR actual_severity_code IN (''A'', ''B'', ''C'', ''D'', ''E''))',
        tenant_schema
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class class_record
      ON class_record.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace_record
      ON namespace_record.oid = class_record.relnamespace
    WHERE namespace_record.nspname = tenant_schema::text
      AND class_record.relname = 'incident_case'
      AND constraint_record.conname = 'incident_case_hazard_category_code_check'
  ) THEN
    EXECUTE format(
      $sql$
        ALTER TABLE %I.incident_case
        ADD CONSTRAINT incident_case_hazard_category_code_check
        CHECK (
          hazard_category_code IS NULL OR hazard_category_code IN (
            'MECHANICAL',
            'FALLS',
            'ELECTRICAL',
            'HAZARDOUS_SUBSTANCES',
            'FIRE_EXPLOSION',
            'THERMAL',
            'PHYSICAL_AGENTS',
            'ENVIRONMENTAL',
            'MUSCULOSKELETAL',
            'PSYCHOSOCIAL',
            'UNEXPECTED_ACTIONS',
            'WORK_ORGANISATION'
          )
        )
      $sql$,
      tenant_schema
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class class_record
      ON class_record.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace_record
      ON namespace_record.oid = class_record.relnamespace
    WHERE namespace_record.nspname = tenant_schema::text
      AND class_record.relname = 'incident_case'
      AND constraint_record.conname = 'incident_case_potential_severity_code_check'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_potential_severity_code_check CHECK (potential_severity_code IS NULL OR potential_severity_code IN (''A'', ''B'', ''C'', ''D'', ''E''))',
      tenant_schema
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class class_record
      ON class_record.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace_record
      ON namespace_record.oid = class_record.relnamespace
    WHERE namespace_record.nspname = tenant_schema::text
      AND class_record.relname = 'incident_case'
      AND constraint_record.conname = 'incident_case_potential_likelihood_code_check'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_potential_likelihood_code_check CHECK (potential_likelihood_code IS NULL OR potential_likelihood_code IN (''1'', ''2'', ''3'', ''4'', ''5''))',
      tenant_schema
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class class_record
      ON class_record.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace_record
      ON namespace_record.oid = class_record.relnamespace
    WHERE namespace_record.nspname = tenant_schema::text
      AND class_record.relname = 'incident_case'
      AND constraint_record.conname = 'incident_case_potential_risk_band_check'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_potential_risk_band_check CHECK (potential_risk_band IS NULL OR potential_risk_band IN (''HIGH'', ''MEDIUM'', ''LOW''))',
        tenant_schema
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
      JOIN pg_catalog.pg_class class_record
        ON class_record.oid = constraint_record.conrelid
      JOIN pg_catalog.pg_namespace namespace_record
        ON namespace_record.oid = class_record.relnamespace
      WHERE namespace_record.nspname = tenant_schema::text
        AND class_record.relname = 'incident_case'
        AND constraint_record.conname = 'incident_case_time_in_role_band_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_time_in_role_band_check CHECK (time_in_role_band IS NULL OR time_in_role_band IN (''<3M'', ''3-12M'', ''1-3Y'', ''>3Y'', ''unknown''))',
        tenant_schema
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
      JOIN pg_catalog.pg_class class_record
        ON class_record.oid = constraint_record.conrelid
      JOIN pg_catalog.pg_namespace namespace_record
        ON namespace_record.oid = class_record.relnamespace
      WHERE namespace_record.nspname = tenant_schema::text
        AND class_record.relname = 'incident_case'
        AND constraint_record.conname = 'incident_case_control_failure_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_control_failure_check CHECK (control_failure IS NULL OR control_failure IN (''MISSING'', ''INADEQUATE'', ''BYPASSED'', ''NOT_USED'', ''UNKNOWN''))',
        tenant_schema
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
      JOIN pg_catalog.pg_class class_record
        ON class_record.oid = constraint_record.conrelid
      JOIN pg_catalog.pg_namespace namespace_record
        ON namespace_record.oid = class_record.relnamespace
      WHERE namespace_record.nspname = tenant_schema::text
        AND class_record.relname = 'incident_case'
        AND constraint_record.conname = 'incident_case_event_type_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_event_type_check CHECK (event_type IS NULL OR event_type IN (''SLIP_TRIP_FALL'', ''FALL_FROM_HEIGHT'', ''STRUCK_BY'', ''CAUGHT_IN_BETWEEN'', ''CUT_PUNCTURE'', ''MANUAL_HANDLING'', ''CONTACT_HOT_COLD'', ''CONTACT_WITH_CHEMICAL'', ''ELECTRICITY'', ''VEHICLE_TRAFFIC'', ''FIRE_EXPLOSION'', ''HARMFUL_EXPOSURE'', ''PROPERTY_DAMAGE'', ''OTHER''))',
        tenant_schema
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
      JOIN pg_catalog.pg_class class_record
        ON class_record.oid = constraint_record.conrelid
      JOIN pg_catalog.pg_namespace namespace_record
        ON namespace_record.oid = class_record.relnamespace
      WHERE namespace_record.nspname = tenant_schema::text
        AND class_record.relname = 'incident_case'
        AND constraint_record.conname = 'incident_case_work_type_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_work_type_check CHECK (work_type IS NULL OR work_type IN (''MAINTENANCE'', ''OPERATIONS'', ''CLEANING'', ''LOGISTICS'', ''CONSTRUCTION'', ''OFFICE'', ''OTHER''))',
        tenant_schema
      );
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS vision_consent %I.incident_vision_consent NOT NULL DEFAULT %L',
    tenant_schema,
    tenant_schema,
    'ASK'
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ALTER COLUMN vision_consent SET DEFAULT %L',
    tenant_schema,
    'ASK'
  );
  EXECUTE format(
    'UPDATE %I.incident_case SET vision_consent = %L WHERE vision_consent IS NULL',
    tenant_schema,
    'ASK'
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ALTER COLUMN vision_consent SET NOT NULL',
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_person (
        id uuid PRIMARY KEY,
        case_id uuid NOT NULL,
        role text NOT NULL,
        name text,
        other_info text,
        years_with_company integer,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_person_years_with_company_check
          CHECK (years_with_company IS NULL OR years_with_company >= 0),
        CONSTRAINT incident_person_case_id_fkey
          FOREIGN KEY (case_id) REFERENCES %I.incident_case(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_account (
        id uuid PRIMARY KEY,
        case_id uuid NOT NULL,
        person_id uuid NOT NULL,
        raw_statement text,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_account_case_id_fkey
          FOREIGN KEY (case_id) REFERENCES %I.incident_case(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_account_person_id_fkey
          FOREIGN KEY (person_id) REFERENCES %I.incident_person(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_account_person_id_key UNIQUE (person_id)
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    'ALTER TABLE %I.incident_person ADD COLUMN IF NOT EXISTS years_with_company integer',
    tenant_schema
  );
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class class_record
      ON class_record.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace_record
      ON namespace_record.oid = class_record.relnamespace
    WHERE namespace_record.nspname = tenant_schema::text
      AND class_record.relname = 'incident_person'
      AND constraint_record.conname = 'incident_person_years_with_company_check'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.incident_person ADD CONSTRAINT incident_person_years_with_company_check CHECK (years_with_company IS NULL OR years_with_company >= 0)',
      tenant_schema
    );
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_fact (
        id uuid PRIMARY KEY,
        case_id uuid,
        account_id uuid,
        order_index integer NOT NULL DEFAULT 0,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_fact_case_id_fkey
          FOREIGN KEY (case_id) REFERENCES %I.incident_case(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_fact_account_id_fkey
          FOREIGN KEY (account_id) REFERENCES %I.incident_account(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_personal_event (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL,
        order_index integer NOT NULL DEFAULT 0,
        event_at timestamptz,
        time_label text,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_personal_event_account_id_fkey
          FOREIGN KEY (account_id) REFERENCES %I.incident_account(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_timeline_event (
        id uuid PRIMARY KEY,
        case_id uuid NOT NULL,
        order_index integer NOT NULL DEFAULT 0,
        event_at timestamptz,
        time_label text,
        text text NOT NULL,
        confidence %I.incident_timeline_confidence NOT NULL DEFAULT 'LIKELY',
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_timeline_event_case_id_fkey
          FOREIGN KEY (case_id) REFERENCES %I.incident_case(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_timeline_source (
        id uuid PRIMARY KEY,
        timeline_event_id uuid NOT NULL,
        account_id uuid NOT NULL,
        fact_id uuid,
        personal_event_id uuid,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_timeline_source_event_id_fkey
          FOREIGN KEY (timeline_event_id) REFERENCES %I.incident_timeline_event(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_timeline_source_account_id_fkey
          FOREIGN KEY (account_id) REFERENCES %I.incident_account(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_timeline_source_fact_id_fkey
          FOREIGN KEY (fact_id) REFERENCES %I.incident_fact(id)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT incident_timeline_source_personal_event_id_fkey
          FOREIGN KEY (personal_event_id) REFERENCES %I.incident_personal_event(id)
          ON DELETE SET NULL ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_deviation (
        id uuid PRIMARY KEY,
        event_id uuid NOT NULL,
        order_index integer NOT NULL DEFAULT 0,
        expected text,
        actual text,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_deviation_event_id_fkey
          FOREIGN KEY (event_id) REFERENCES %I.incident_timeline_event(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_cause_node (
        id uuid PRIMARY KEY,
        case_id uuid NOT NULL,
        parent_id uuid,
        timeline_event_id uuid,
        order_index integer NOT NULL DEFAULT 0,
        statement text NOT NULL,
        question text,
        is_root_cause boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_cause_node_case_id_fkey
          FOREIGN KEY (case_id) REFERENCES %I.incident_case(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_cause_node_parent_id_fkey
          FOREIGN KEY (parent_id) REFERENCES %I.incident_cause_node(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_cause_node_timeline_event_id_fkey
          FOREIGN KEY (timeline_event_id) REFERENCES %I.incident_timeline_event(id)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT incident_cause_node_not_own_parent_check
          CHECK (parent_id IS NULL OR parent_id <> id)
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.incident_cause_action (
        id uuid PRIMARY KEY,
        cause_node_id uuid NOT NULL,
        order_index integer NOT NULL DEFAULT 0,
        description text NOT NULL,
        owner_role text,
        due_date date,
        action_type %I.incident_action_type,
        status %I.incident_action_status NOT NULL DEFAULT 'OPEN',
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT incident_cause_action_cause_node_id_fkey
          FOREIGN KEY (cause_node_id) REFERENCES %I.incident_cause_node(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    'ALTER TABLE %I.incident_cause_action ADD COLUMN IF NOT EXISTS status %I.incident_action_status NOT NULL DEFAULT %L',
    tenant_schema,
    tenant_schema,
    'OPEN'
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_cause_action ALTER COLUMN status SET DEFAULT %L',
    tenant_schema,
    'OPEN'
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_cause_action ALTER COLUMN status SET NOT NULL',
    tenant_schema
  );

    EXECUTE format(
      $sql$
        CREATE TABLE IF NOT EXISTS %I.incident_attachment (
        id uuid PRIMARY KEY,
        event_id uuid NOT NULL,
        storage_key text NOT NULL,
        filename text,
        mime_type text,
        size_bytes bigint,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by uuid NOT NULL,
        CONSTRAINT incident_attachment_event_id_fkey
          FOREIGN KEY (event_id) REFERENCES %I.incident_timeline_event(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT incident_attachment_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    $sql$,
      tenant_schema,
      tenant_schema
    );

    EXECUTE format(
      $sql$
        CREATE OR REPLACE VIEW %I.incident_case_analytics AS
        SELECT
          incident.id,
          incident.case_number,
          incident.suva_case_number,
          incident.incident_at,
          EXTRACT(YEAR FROM incident.incident_at)::integer AS year,
          EXTRACT(MONTH FROM incident.incident_at)::integer AS month,
          EXTRACT(WEEK FROM incident.incident_at)::integer AS iso_week,
          EXTRACT(ISODOW FROM incident.incident_at)::integer AS day_of_week,
          CASE
            WHEN incident.incident_at IS NULL THEN NULL
            WHEN EXTRACT(HOUR FROM incident.incident_at) < 6 THEN 'night'
            WHEN EXTRACT(HOUR FROM incident.incident_at) < 12 THEN 'morning'
            WHEN EXTRACT(HOUR FROM incident.incident_at) < 18 THEN 'afternoon'
            ELSE 'evening'
          END AS time_of_day,
          incident.shift_text AS shift,
          incident.location,
          incident.department_text AS department,
          incident.area_text AS area,
          incident.contractor_flag,
          incident.time_in_role_band,
          COALESCE(incident.ppe_required, ARRAY[]::text[]) AS ppe_required,
          COALESCE(incident.ppe_worn, ARRAY[]::text[]) AS ppe_worn,
          EXISTS (
            SELECT 1
            FROM unnest(COALESCE(incident.ppe_required, ARRAY[]::text[])) AS required_item
            WHERE NOT (required_item = ANY(COALESCE(incident.ppe_worn, ARRAY[]::text[])))
          ) AS ppe_non_compliance_flag,
          incident.incident_type::text AS incident_type,
          incident.event_type,
          incident.work_type,
          incident.process_involved,
          incident.body_part,
          incident.injury_nature AS injury_type,
          incident.lost_days AS days_lost,
          incident.actual_injury_outcome::text AS actual_outcome,
          incident.actual_severity_code,
          incident.potential_severity_code,
          incident.potential_likelihood_code,
          incident.potential_risk_band,
          incident.immediate_cause,
          COALESCE(incident.contributing_causes, ARRAY[]::text[]) AS contributing_causes,
          incident.control_failure,
          incident.workflow_stage::text AS workflow_stage,
          incident.workflow_stage::text IN ('ACTIONS', 'REVIEW', 'APPROVED') AS investigation_done_flag,
          (
            SELECT count(*)::integer
            FROM %I.incident_cause_action action
            JOIN %I.incident_cause_node node ON node.id = action.cause_node_id
            WHERE node.case_id = incident.id
              AND action.status::text <> 'COMPLETE'
          ) AS actions_open_count,
          (
            SELECT count(*)::integer
            FROM %I.incident_cause_action action
            JOIN %I.incident_cause_node node ON node.id = action.cause_node_id
            WHERE node.case_id = incident.id
              AND action.status::text = 'COMPLETE'
          ) AS actions_closed_count,
          incident.closed_at
        FROM %I.incident_case incident
      $sql$,
      tenant_schema,
      tenant_schema,
      tenant_schema,
      tenant_schema,
      tenant_schema,
      tenant_schema
    );

    EXECUTE format('CREATE INDEX IF NOT EXISTS incident_case_created_by_idx ON %I.incident_case(created_by)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_case_workflow_stage_idx ON %I.incident_case(workflow_stage)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_person_case_id_idx ON %I.incident_person(case_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_account_case_id_idx ON %I.incident_account(case_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_fact_account_id_idx ON %I.incident_fact(account_id)', tenant_schema);
  -- incident_fact_case_id_idx is created by migration 00370 (which adds the
  -- case_id column); not here, since 00200 runs before 00370 and the column
  -- does not yet exist on already-provisioned tenants.
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_personal_event_account_id_idx ON %I.incident_personal_event(account_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_timeline_event_case_id_idx ON %I.incident_timeline_event(case_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_timeline_event_event_at_idx ON %I.incident_timeline_event(event_at)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_timeline_source_event_id_idx ON %I.incident_timeline_source(timeline_event_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_timeline_source_account_id_idx ON %I.incident_timeline_source(account_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_timeline_source_fact_id_idx ON %I.incident_timeline_source(fact_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_timeline_source_personal_event_id_idx ON %I.incident_timeline_source(personal_event_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_deviation_event_id_idx ON %I.incident_deviation(event_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_cause_node_case_id_idx ON %I.incident_cause_node(case_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_cause_node_parent_id_idx ON %I.incident_cause_node(parent_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_cause_node_timeline_event_id_idx ON %I.incident_cause_node(timeline_event_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_cause_action_cause_node_id_idx ON %I.incident_cause_action(cause_node_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_attachment_event_id_idx ON %I.incident_attachment(event_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS incident_attachment_created_by_idx ON %I.incident_attachment(created_by)', tenant_schema);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', tenant_schema, tenant_role);
  END IF;
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
  PERFORM "shared"."apply_incident_case_schema"(tenant_schema);

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;

DO $$
DECLARE
  tenant_schema name;
BEGIN
  FOR tenant_schema IN
    SELECT nspname::name
    FROM pg_catalog.pg_namespace
    WHERE nspname ~ '^tenant_[0-9a-f_]{36}$'
    ORDER BY nspname
  LOOP
    PERFORM "shared"."apply_incident_case_schema"(tenant_schema);
  END LOOP;
END
$$;

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.incident_attachment;
-- 2. DROP TABLE <tenant>.incident_cause_action;
-- 3. DROP TABLE <tenant>.incident_cause_node;
-- 4. DROP TABLE <tenant>.incident_deviation;
-- 5. DROP TABLE <tenant>.incident_timeline_source;
-- 6. DROP TABLE <tenant>.incident_timeline_event;
-- 7. DROP TABLE <tenant>.incident_personal_event;
-- 8. DROP TABLE <tenant>.incident_fact;
-- 9. DROP TABLE <tenant>.incident_account;
-- 10. DROP TABLE <tenant>.incident_person;
-- 11. DROP TABLE <tenant>.incident_case;
-- 12. DROP TYPE <tenant>.incident_actual_injury_outcome;
-- 13. DROP TYPE <tenant>.incident_action_type;
-- 14. DROP TYPE <tenant>.incident_timeline_confidence;
-- 15. DROP TYPE <tenant>.incident_workflow_stage;
-- 16. DROP TYPE <tenant>.incident_type;
-- 17. DROP FUNCTION shared.apply_incident_case_schema(name);
