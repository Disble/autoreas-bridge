# Proposal: dlinter testing rules for Vitest mock hygiene and timeout discipline

This report proposes three new rules for `dlinter-ts-react` based on a real
incident in `autoreas-bridge`. The incident and its resolution are reproducible
on branch `perf/vitest-dev-env` (commit `d8d80ee`).

## Incident summary

The frontend Vitest suite carried `testTimeout: 20000` / `hookTimeout: 20000`
overrides in `vite.config.ts`. They were added to stop first-render flakes,
but the flakes were a symptom: every test file re-imported the full HeroUI
module graph, costing a cumulative 696 seconds of import time across 110 test
files (82s wall time).

The fix enabled `test.deps.optimizer.client` to pre-bundle heavy UI packages
(import cost dropped to ~100s cumulative, wall time to ~27s, slowest single
test 256ms), which allowed removing the timeout overrides entirely. However,
the optimizer exposed a latent anti-pattern in four test files:

1. `vi.mock(pkg, async (importOriginal) => ...)` on npm packages breaks when
   `deps.optimizer` is enabled. Vitest 4.1.3 through 4.1.6 mangles the
   version-stamped module URL (`?v=hash` becomes `&v=hash`) and fails with
   `Cannot find module ...js&v=hash` — for any npm package, optimized or not.
2. Packages bundled by the optimizer expose frozen ESM namespaces, so
   `vi.spyOn(namespace, 'export')` fails on them too
   (`Module namespace is not configurable in ESM`).
3. Externalized pure-ESM packages (for example `react-aria-components`) have
   frozen namespaces under native Node ESM; they only become spyable through
   `test.server.deps.inline`.

The durable posture that keeps the suite fast and green:

- Heavy UI packages that tests never stub go in `deps.optimizer.client.include`.
- Packages that tests stub are kept out of the optimizer and stubbed with
  `vi.spyOn` on the module namespace, or with full `vi.mock` factories
  (which are optimizer-safe).
- `importOriginal`-based partial package mocks are never used.
- Timeout overrides are never used to paper over slow imports.

Each rule below makes one part of that posture deterministic.

## Rule 1: `dlinter/no-partial-package-mock`

Forbid `vi.mock` / `vi.doMock` factories that take the `importOriginal`
parameter when the mocked specifier is a bare package (not a relative path).

```ts
// ✗ Breaks under deps.optimizer; couples the test to module-loader internals
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

// ✓ Namespace spy — optimizer-safe for non-optimized packages
import * as ReactRouter from 'react-router';
vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(navigateMock);

// ✓ Full factory — optimizer-safe even for optimized packages
vi.mock('@heroui/react', () => ({ toast: { success: vi.fn(), danger: vi.fn() } }));
```

Detection: the factory passed to `vi.mock`/`vi.doMock` declares one or more
parameters and the first argument is a bare specifier (does not start with
`.` or `/`). Parameter name must not matter. Relative-path mocks stay allowed:
project-local modules are transformed by Vitest and do not hit the bug.

Suggested severity: `error`. Auto-fix: not safe (the replacement depends on
whether the package is optimized); a suggestion pointing at the two compliant
patterns is enough.

## Rule 2: `dlinter/no-test-timeout-overrides`

Forbid raising Vitest timeouts, both globally and per test:

- `testTimeout` / `hookTimeout` properties in `vite.config.*` /
  `vitest.config.*` files.
- The third `timeout` argument of `it` / `test` (and their `.only` / `.skip`
  member forms).

```ts
// ✗ Hides a performance regression instead of fixing it
test: { testTimeout: 20000, hookTimeout: 20000 }
it('renders', () => { ... }, 20000);

// ✓ Fix the root cause (import cost, contention) and keep the 5s default
```

Rationale: the default 5-second budget is a regression detector. In this
incident the overrides silently masked a 12x import-cost regression for
months; removing the root cause left the slowest test at 256ms — a 20x
margin. A timeout raise is almost always a deferred performance bug.

Escape hatch: an inline `eslint-disable` with a justification comment for
genuinely long-running integration tests. Suggested severity: `error`.

## Rule 3: `dlinter/require-spy-restore`

When a test file calls `vi.spyOn` on an imported module namespace, require a
`vi.restoreAllMocks()` (or per-spy `mockRestore`) inside an `afterEach` hook.

```ts
// ✗ Spy leaks into the next test file sharing the worker
vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(navigateMock);

// ✓
afterEach(() => {
  vi.restoreAllMocks();
});
```

Rationale: rules 1 and 2 push tests toward namespace spies; without paired
restoration, spies on shared module objects outlive the test and produce
order-dependent failures. This rule requires cross-node analysis (spy usage +
hook body), so it belongs in dlinter rather than in `no-restricted-syntax`.

Suggested severity: `error`. Auto-fix: insertable `afterEach` when none exists.

## Local enforcement (adopted in this repo)

Until dlinter ships these, rules 1 and 2 are enforced in
`frontend/eslint.config.js` with `no-restricted-syntax` selectors (see the
`Vitest mock hygiene` block). Rule 3 is not expressible with
`no-restricted-syntax` and is covered only by convention plus review until it
lands in dlinter.

## Relevant configuration

- `dlinter-ts-react` `^0.4.1`, ESLint `^9`, Vitest `4.1.6`, Vite `8.0.7`.
- Optimizer and inline configuration: `frontend/vite.config.ts`.
- Converted test files (importOriginal → spy/factory):
  `DownloadsRootPanel.test.tsx`, `HistoryTable.test.tsx`,
  `use-anime-detail.test.tsx`, `HosterPriorityEditor.test.tsx`.
