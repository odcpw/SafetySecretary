# Beta Rollout Checklist

Purpose: consistent onboarding for new orgs while preserving strict isolation and attachment security.

## Prerequisites
- Registry DB is reachable (`REGISTRY_DATABASE_URL`).
- Tenant DB host is reachable (per-org DBs).
- Attachments storage root exists and is writable.
- Platform admin account exists (see Admin bootstrap flow).

## Provision an organization
Choose one path:

### Admin UI
1. Log in as platform admin.
2. Create organization:
   - slug (unique, URL-safe)
   - name
   - optional storage root and DB connection string
3. Create the owner/admin user and set an initial password.

### CLI
Use `npm run admin:cli -- <command>`:
1. Create org:
   - `org:create --slug <slug> --name <name> [--storage-root <path>] [--db-url <url>]`
2. Run migrations:
   - `org:migrate --slug <slug>`
3. Create a user via Admin UI or registry tooling, then set password:
   - `user:reset-password --org <slug> --username <username> --password <password>`

## Validate access
1. Log in with org slug + username + password.
2. Confirm session cookie is set (remember-me optional).
3. Create a HIRA/JHA/Incident case and verify:
   - Data saves correctly
   - Navigation does not lose edits

## Verify isolation
1. Log in as a different org.
2. Confirm:
   - No visibility of other org cases/attachments
   - Different storage root paths are used
   - Tenant DB is distinct

## Attachment encryption check
1. Upload a photo.
2. On disk, verify ciphertext (not plaintext).
3. Download and confirm the file decrypts correctly in-app.

## Admin safety actions
1. Test user lockout and unlock:
   - lockout after 5 failed attempts
   - unlock via Admin UI or `user:unlock`
2. Revoke sessions:
   - `user:revoke-sessions --org <slug> --username <username>`
   - `org:revoke-sessions --slug <slug>`

## Escalation path
- Tenant DB down or misconfigured: notify platform admin, confirm registry org config.
- Unexpected access issue: revoke sessions and reset password.

## Recordkeeping
- Log org slug, storage root, and DB connection.
- Confirm locale preference if required.
