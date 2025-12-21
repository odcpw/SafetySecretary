# Auth Decision Log (Beta)

Purpose: capture concrete auth policies that drive schema, UX copy, and backend behavior for the beta.

## Decisions

### Lockout policy
- Threshold: 5 failed attempts per org + username within a rolling window.
- Lockout duration: 15 minutes (time-based unlock only for beta).
- User feedback: show remaining attempts before lockout on the login form.
- Reset: successful login clears the failure counter.
- Rationale: balances beta usability with a clear deterrent; avoids admin unlock workflows.

### Session TTL
- Non-remember session: 8 hours, rolling expiration on activity.
- Remember me: 10 days, rolling expiration on activity.
- Logout: explicit logout invalidates current session; admin "logout everywhere" invalidates all.
- Rationale: supports workday sessions while allowing longer beta access when requested.

### Org slug rules
- Format: lowercase `a-z`, `0-9`, and single hyphens only.
- Length: 3-32 characters.
- Must start with a letter; no trailing hyphen.
- Stored canonical form: lowercased and trimmed; reject invalid input instead of auto-fixing.
- Uniqueness: global across all orgs.
- Rationale: stable, URL-safe identifier that avoids ambiguous capitalization.

### Admin access policy (platform vs org)
- Platform admin can provision orgs/users and access tenant data for beta support.
- Access requires platform admin login (separate role from org admin); no IP allowlist in beta.
- All platform admin actions are audited (create org/user, reset password, view tenant).
- Rationale: beta requires hands-on support and provisioning; audit trail mitigates risk.

## Notes for implementation
- Store lockout counters in the registry DB keyed by org + username; include last-failed-at.
- Store session TTLs in the registry DB and refresh on activity.
- Add a validation helper for org slugs; reuse in UI and CLI.
- Include platform admin role in the registry DB schema and seed via CLI.

## Impacted beads
- SafetySecretary-q5l.2 (registry DB schema)
- SafetySecretary-q5l.5 (auth backend: login/logout + sessions)
- SafetySecretary-q5l.7 (rate limiting + lockout)
- SafetySecretary-q5l.11 (login page + validation)
- SafetySecretary-q5l.20 (platform admin bootstrap + access control)
