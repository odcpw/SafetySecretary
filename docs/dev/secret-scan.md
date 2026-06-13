# Secret Scanning

Safety Secretary uses the official `gitleaks` CLI for ongoing secret scanning. The pinned version is `8.30.1` in `package.json` under `config.secretScan.gitleaksVersion`; the pre-commit hook and CI workflow both check that value.

## Local Hook

The repo hook is `.husky/pre-commit`. Configure Git to use it:

```sh
git config core.hooksPath .husky
```

The hook runs:

```sh
gitleaks protect --staged --config .gitleaks.toml --redact --no-banner
```

This scans staged diffs only. A non-zero scanner exit blocks the commit.

Install the pinned official `gitleaks` CLI before committing. Do not use the unrelated `gitleaks` npm package.

## CI

`.github/workflows/secret-scan.yml` runs on every push and pull request. It downloads the pinned official gitleaks release, verifies the version against `package.json`, and scans the full branch tree:

```sh
gitleaks dir . --config .gitleaks.toml --redact --no-banner
```

## Allow-List Policy

Do not add allow-list entries casually. A pull request that introduces an allow-list entry in `.gitleaks.toml` requires reviewer sign-off. The CI workflow flags added `allowlist` or `allowlists` blocks and fails unless the PR has the `secret-scan-allowlist-reviewed` label after reviewer approval.

Every exception must include a short explanation in `.gitleaks.toml`, but this bead intentionally adds no allow-list entries.

## Canary

Run the local hook canary with:

```sh
pnpm test:secret-scan-canary
```

The canary creates a sandbox Git repo, stages a non-secret fake OpenAI-shaped value assembled at runtime, and proves the hook rejects the commit when the scanner exits non-zero.
