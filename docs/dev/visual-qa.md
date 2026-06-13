# Visual QA

Run the visual harness with:

```bash
pnpm test:visual
```

Update accepted snapshots with:

```bash
pnpm test:visual:update
```

CI generates the Prisma client, builds the app assets used by the fixture
renderer, then runs the same baseline command without updating snapshots. If a
visual comparison fails, the Visual QA workflow uploads the Playwright report
and `test-results/` output as `visual-qa-playwright-artifacts` for review.

The harness reads tests from `tests/visual` and runs three dark-mode projects:
`desktop@1920`, `desktop@1024`, and `mobile@375`.

Screenshot assertions use Playwright's `maxDiffPixelRatio: 0.002`, which allows
up to 0.2% differing pixels before a snapshot comparison fails.
