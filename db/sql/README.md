# db/sql/ — Raw SQL Migration Conventions

All conventions below are cited from **ADR-0001 §1 (Tenant topology)** unless noted otherwise.

## Per-tenant schema naming

> "Each company workspace gets its own Postgres schema (`tenant_{uuid}`). Application tables live inside the tenant schema; shared tables (user accounts, tenant registry, invitations) live in a `shared` schema."

Schema name format: `tenant_{tenant_id}` where `{tenant_id}` is the UUID from `shared.tenants` with hyphens replaced by underscores.

Example: `tenant_a1b2c3d4_e5f6_7890_abcd_ef1234567890`

Shared tables (user accounts, tenant registry, invitations) live in the `shared` schema.

## Per-tenant role naming

> "Each tenant schema has a corresponding Postgres role (`role_tenant_{uuid}`) that owns the schema and has USAGE + full DML on tables within it. The role has no grants on any other tenant schema."

Role name format: `role_tenant_{tenant_id}` using the same UUID-underscored convention as the schema name.

## Migration-only role

> "Migration scripts run under a migration-only role with CREATE / ALTER on all tenant schemas but no DML — it can change structure but cannot read or write tenant data."

The migration role holds DDL grants only (`CREATE`, `ALTER`) on all tenant schemas. It has no DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on any tenant schema.

## SET ROLE policy at connection checkout

> "The application connects via a shared connection pool using a superuser or login role, then issues `SET ROLE role_tenant_{uuid}` at connection checkout based on the authenticated session's tenant_id."

Every data-access path must:
1. Resolve the tenant schema from the authenticated session's `tenant_id`.
2. Issue `SET ROLE` for the corresponding `role_tenant_{tenant_id}` role.
3. Set `search_path` to the tenant schema + `shared`.

There is no default tenant schema on the search path.

This policy is owned by bead `ssfw-1df` (auth/tenant skeleton).

## Raw SQL file naming convention

Raw SQL files in this directory use a 5-digit zero-padded lexicographic-prefix filename convention so that alphabetical listing yields execution order. The migration runner enforces the pattern `^\d{5}_.+\.sql$`. Files are named with a 5-digit sequence prefix followed by a short descriptive label:

```
00010_create_tenants.sql
00011_create_users.sql
00012_create_magic_link_tokens.sql
```

This ensures `ls` and `git ls-files` order matches migration order without a separate metadata file.

## Raw SQL migration ledger

`scripts/db/migrate.ts` records applied raw SQL files in `shared.raw_sql_migrations` after Prisma migrations run. Existing deployments that already reached `00450_incident_case_number_unique.sql` are imported once as `legacy_imported`; later raw SQL files are applied once and recorded as `applied`.

Do not edit an already-applied raw SQL file to change behavior. Add a new numbered SQL file instead. The runner compares SHA-256 checksums and fails if an applied raw migration changes.

Useful checks:

```
pnpm db:migrate -- --dry-run
pnpm db:check:tenant-conformance
pnpm db:tenants:orphans -- --json
```

`db:tenants:orphans -- --drop` only drops one explicitly named orphan at a time. Pass `--tenant-id <uuid>` or `--schema <tenant_uuid_schema>` plus `--confirm-drop <same-uuid>`. Destructive mode also requires `NODE_ENV=development`, unless `--force-production` is explicitly provided.

## Snapshots and artifacts layering

The snapshots and foreign-key layering conventions are documented in:

- [`db/sql/snapshots-fk-layering.md`](./snapshots-fk-layering.md) — produced by bead `ssfw-kxh`

See that file for snapshot creation, FK dependency ordering, and artifact management.
