# Pass 02 Ledger

Generated: 2026-06-18
Candidate: `C1`
Decision: landed

## LOC delta

| File | Before | After | Approx. delta | Why |
|---|---:|---:|---:|---|
| `src/lib/email/transport.ts` | 501 | 474 | `-27` | Removed duplicated provider `sendMagicLink` / `sendInvitation` body assembly by extracting shared transactional content builders plus one provider-local private `send(...)` helper per class |
| `tests/unit/auth/email-transport.test.ts` | 322 | 422 | `+100` | Added invitation-path assertions for Postmark and Mailgun so all in-scope providers prove identical wire semantics after the refactor |
| **Net touched-file delta** | **823** | **896** | **`+73`** | Production code shrank, but test coverage grew to close the missing proof gap |

## Rationale

- This stayed on the lowest safe rung:
  - no provider classes were merged
  - no shared transport abstraction was introduced
  - provider-specific endpoint/auth/header/body details remain inline and obvious
- The real duplication removed was the repeated message-content selection (`subject`, `text`, `html`) inside each provider pair, not the provider transport mechanics.
- The pre-edit gap in this candidate was proof coverage: Resend already had invitation assertions, but Postmark and Mailgun did not. The added tests make the preserved contract explicit.

## Scope checks

- Did not change provider endpoint URLs
- Did not change headers or auth schemes
- Did not change tracking flags
- Did not change content types
- Did not change request/response failure semantics
- Did not change collaborative-by-default invite behavior
