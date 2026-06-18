## Change: Collapse invite page session/CSRF cookie switching onto the existing auth cookie helpers

### Equivalence contract
- **Inputs covered:** `acceptInviteAction` server-action session switch in [`src/app/invite/[token]/page.tsx`](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/app/invite/[token]/page.tsx:145), existing API-route cookie writes in [`src/app/api/auth/invitations/redeem/route.ts`](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/app/api/auth/invitations/redeem/route.ts:73), and shared cookie logic in [`src/lib/auth/cookies.ts`](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/lib/auth/cookies.ts:70) and [`src/lib/auth/csrf.ts`](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/lib/auth/csrf.ts:79)
- **Ordering preserved:** yes; the page still issues the new tenant session first, then writes the session cookie, then writes the session-bound CSRF cookie before redirecting
- **Tie-breaking:** unchanged; no fallback order changed in secure-cookie detection or invitation outcome handling
- **Error semantics:** unchanged; `issueSession`, `redeemInvitationToken`, and redirect behavior are untouched
- **Laziness:** unchanged; cookie option computation and CSRF minting remain eager at the point cookies are written
- **Short-circuit eval:** unchanged; secure-cookie detection still checks `NODE_ENV`, then `x-forwarded-proto`, then request URL, then `APP_BASE_URL`
- **Floating-point:** N/A
- **RNG / hash order:** unchanged; CSRF token minting still uses the same HMAC over the same session id and context label
- **Observable side-effects:** identical cookie names, `__Host-` behavior in secure contexts, readable fallback cookie, `maxAge`, `path`, `sameSite`, and `secure` flags; the invite page now calls the same helper path as the API routes instead of reimplementing it
- **Type narrowing:** unchanged; no auth result unions or rejection reasons changed
- **Rerender behavior:** unchanged; only server-side session/cookie plumbing changed

### Verification
- [x] `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/auth/invitation-redeem-route.test.ts tests/unit/auth/session.test.ts tests/unit/auth/base-url.test.ts`
- [x] `pnpm test:auth:last-user`
- [x] `pnpm typecheck`
- [x] Focused unit added for forwarded-header cookie-security derivation
- [x] LOC delta recorded in `ledger.md`
