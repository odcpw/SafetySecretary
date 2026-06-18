# Pass 02 Verification

Generated: 2026-06-18
Scope: candidate `C1` only

## Required commands

| Command | Result | Exact counts / note |
|---|---|---|
| `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/auth/email-transport.test.ts tests/unit/auth/invitations.test.ts tests/unit/auth/invitation-redeem-route.test.ts` | PASS | `tests 24`, `pass 24`, `fail 0`, `skipped 0` |
| `pnpm test:auth:last-user` | PASS with expected environment skip | `tests 37`, `pass 36`, `fail 0`, `skipped 1`; skip reason: `DATABASE_URL is required` in `last-user policy integration` |
| `pnpm typecheck` | PASS | `tsc --noEmit`; exit code `0`, no diagnostics |

## Focused verification notes

- `tests/unit/auth/email-transport.test.ts` now covers both `sendMagicLink` and `sendInvitation` request bodies for Resend, Postmark, and Mailgun.
- The invitation tests confirm the provider-specific observable contract stayed intact:
  - Resend JSON keys remain `from`, `to`, `subject`, `text`, `html`
  - Postmark JSON keys remain `From`, `To`, `Subject`, `TextBody`, `HtmlBody`, `MessageStream`, `TrackLinks`, `TrackOpens`
  - Mailgun form fields remain `from`, `to`, `subject`, `text`, `html`, `o:tracking`, `o:tracking-clicks`, `o:tracking-opens`
- Node emitted pre-existing `MODULE_TYPELESS_PACKAGE_JSON` warnings during test runs. They did not affect pass/fail status and were not touched in this pass.

## Pass/Fail/Skip summary

- Required commands: `3 pass`, `0 fail`, `0 skip`
- Required test assertions observed from command output: `60 pass`, `0 fail`, `1 skip`
