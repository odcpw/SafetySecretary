## Change: Remove unused `incident.tab.placeholder` i18n message key

### Equivalence contract
- **Inputs covered:** `MessageKey`, four locale catalogs, and `t()` catalog shape checks.
- **Ordering preserved:** yes. The adjacent `incident.tab.*` keys remain in the same order; only the unused placeholder row is removed.
- **Tie-breaking:** N/A.
- **Error semantics:** unchanged. `t()` still resolves known keys through the selected locale, then EN, then the key string.
- **Laziness:** N/A.
- **Short-circuit eval:** N/A.
- **Floating-point:** N/A.
- **RNG / hash order:** N/A.
- **Observable side-effects:** unchanged. No source, test, doc, config, or visible-string reference reaches `incident.tab.placeholder`.
- **Type narrowing:** unchanged except the dead literal is no longer part of `MessageKey`; all remaining catalog keys still share the same `MESSAGE_KEYS` list.
- **Rerender behavior:** unchanged. No React component or route calls `t("incident.tab.placeholder")` or constructs an `incident.tab.*` key dynamically.

### Dead-code evidence before edit
- Exact key census: `rg -n --fixed-strings "incident.tab.placeholder" .` found only `src/lib/i18n/messages.{de,en,fr,it}.json` and `src/lib/i18n/types.ts`.
- Prefix census: `rg -n -F 'incident.tab' src tests docs refactor package.json tsconfig.json .env.example` found only the locale catalogs and `MESSAGE_KEYS`.
- Dynamic composition census: `rg -n -F 'incident.tab.${' ...` returned zero hits.
- Visible-string census for `Coming in`, `Kommt in`, `Arrive dans`, and `Arriva in` found only the four candidate catalog rows.
- Git history: `git log -S'incident.tab.placeholder' -- ...` points to the initial incident-investigation i18n batch (`eba1655 Safety Secretary - incident-investigation coach`), with no later touch or companion test/doc that names this key.

### Verification
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/i18n/t.test.ts`
- [x] `pnpm test:copy-lint`
- [x] `git diff --check`
