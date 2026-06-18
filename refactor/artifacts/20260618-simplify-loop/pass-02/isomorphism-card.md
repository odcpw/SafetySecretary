# Pass 02 Isomorphism Card

## Change: Collapse duplicated transactional-email content selection inside provider transports

### Equivalence contract
- **Inputs covered:** `ResendEmailTransport`, `PostmarkEmailTransport`, and `MailgunEmailTransport` for both `sendMagicLink` and `sendInvitation`
- **Ordering preserved:** yes; each public send method still computes content once, performs one provider `fetch`, then checks `response.ok`
- **Tie-breaking:** unchanged; no branching priorities or fallback chains changed
- **Error semantics:** unchanged; the same constructor validation errors and provider-specific `... email send failed with status ...` errors must be thrown
- **Laziness:** unchanged; request bodies are still materialized eagerly before `fetch`
- **Short-circuit eval:** unchanged; missing credential checks and failed-response guards stay in the same order
- **Floating-point:** N/A
- **RNG / hash order:** N/A
- **Observable side-effects:** identical provider endpoints, methods, headers, auth schemes, tracking flags, content types, body field names, and success/failure behavior
- **Type narrowing:** unchanged; `MagicLinkEmail` and `InvitationEmail` remain the public method inputs, with shared content extracted behind private/provider-local helpers
- **Rerender behavior:** N/A

### Verification
- [x] `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/auth/email-transport.test.ts tests/unit/auth/invitations.test.ts tests/unit/auth/invitation-redeem-route.test.ts`
- [x] `pnpm test:auth:last-user`
- [x] `pnpm typecheck`
- [x] Transport test coverage proves both message kinds for all in-scope providers
- [x] LOC delta recorded in `ledger.md`
