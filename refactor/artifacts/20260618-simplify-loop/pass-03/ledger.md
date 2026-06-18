# Pass 03 Ledger

Generated: 2026-06-18
Candidate: `C2` narrow invite-flow subset
Decision: landed

## LOC delta

| File | Approx. delta | Why |
|---|---:|---|
| `src/app/invite/[token]/page.tsx` | `-46` | Removed page-local cookie-security derivation and page-local CSRF/session cookie writers; the server action now delegates to shared auth helpers |
| `src/lib/auth/cookies.ts` | `+19` | Added a header-derived security-context helper plus a cookie-writer variant so server actions can reuse the existing session-cookie contract |
| `src/lib/auth/csrf.ts` | `+18` | Added a cookie-writer variant so server actions and API routes share the exact same CSRF cookie emission path |
| `tests/unit/auth/session.test.ts` | `+17` | Added a focused unit for forwarded-header cookie security derivation |
| **Net touched-file delta** | **`+8`** | Production invite-flow duplication shrank, with a small net increase from making the shared helper path explicit and tested |

## Rationale

- This stayed on the lowest safe rung:
  - no auth flows were merged
  - no error contracts changed
  - no cookie names or attributes changed
  - no broad auth utility module was introduced
- The real duplication removed was local reimplementation of:
  - request-aware secure-cookie context derivation
  - session-cookie writing in the server action
  - session-bound CSRF cookie writing in the server action
- The shared cookie contract remains obvious because the cookie-shape code still lives in the canonical auth files:
  - [`src/lib/auth/cookies.ts`](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/lib/auth/cookies.ts:32)
  - [`src/lib/auth/csrf.ts`](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/lib/auth/csrf.ts:72)

## Checks kept unchanged

- Session-bound CSRF verification still uses the same HMAC token over the issued session id
- Secure contexts still receive both `__Host-ssfw_csrf` and readable `ssfw_csrf`
- Non-secure/dev contexts still receive only the readable fallback cookie
- Cookie `maxAge`, `path`, `sameSite`, and `secure` behavior remain unchanged
- Invite acceptance still switches the user into the invited tenant session before redirecting to `/workspace`
