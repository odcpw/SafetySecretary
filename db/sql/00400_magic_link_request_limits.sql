-- Durable magic-link request throttles for email-only auth.
CREATE TABLE IF NOT EXISTS "shared"."magic_link_request_limits" (
  "scope" text NOT NULL,
  "bucket_start" timestamptz NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "magic_link_request_limits_pkey"
    PRIMARY KEY ("scope", "bucket_start"),
  CONSTRAINT "magic_link_request_limits_count_nonnegative_check"
    CHECK ("count" >= 0)
);

CREATE INDEX IF NOT EXISTS "magic_link_request_limits_bucket_start_idx"
  ON "shared"."magic_link_request_limits" ("bucket_start");
