# Tasks: Frontend Global Governance Enforcement

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~800-1100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 fixtures+catalog → PR 2 checker+gate → PR 3 adapter migration → PR 4 docs+verify |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Fixture matrix and shared ESLint catalogs | PR 1 | Start fixtures; end harness GREEN; rollback revert `frontend/eslint/**` |
| 2 | Repo checker, tests, and lint gate wiring | PR 2 | Start checker scaffold; end gate invocation; rollback revert `frontend/scripts/**`, config, tests |
| 3 | Source-adapter folder migration and facade removal | PR 3 | Start one adapter folder move; end all `src/infrastructure/*-source.ts` facades removed and folder entrypoints live; rollback restore flat entrypoints |
| 4 | Docs, generator, artifacts, and final verify | PR 4 | Start docs/templates; end `verify-report.md`; rollback revert docs/templates/artifacts |

## Phase 1: Fixture matrix RED

- [x] 1.1 Add RED, GREEN, EXEMPT, and HARNESS-ONLY fixtures under `frontend/eslint/__fixtures__/architecture-policy/**` for pure barrels, sibling-role ownership, `window.go`, generated `wailsjs/**`, and flat facade shims.
- [x] 1.2 Extend `frontend/eslint/__tests__/architecture-policy.test.mjs` to assert the full matrix first, including structural-check expectations and negative cases from the spec scenarios.

## Phase 2: Shared ESLint catalogs GREEN

- [x] 2.1 Consolidate global declaration and runtime selector catalogs in `frontend/eslint/architecture-rules.js`, including delivery remap messages and documentation contexts.
- [x] 2.2 Recompose `frontend/eslint.config.js` around the shared catalogs so governed `frontend/src/**/*.{ts,tsx}` stays global-by-default with only generated and harness exclusions.
- [x] 2.3 Run the architecture-policy harness after each selector change until all Phase 1 RED cases turn GREEN without weakening existing frontend rules.

## Phase 3: Repo-local structural checker

- [x] 3.1 Create `frontend/scripts/check-frontend-architecture.mjs` to validate pure `index.ts` barrels, folder-owned role files, facade allowlist boundaries, and folder/index topology.
- [x] 3.2 Add checker coverage in `frontend/eslint/__tests__/architecture-policy.test.mjs` and `frontend/scripts/__tests__/` for pass, fail, and allowlisted-shim paths.

## Phase 4: Gate integration

- [x] 4.1 Wire the structural checker into `frontend/package.json`, `lefthook.yml`, and any lint entrypoint consumed by repo gates.
- [x] 4.2 Verify the merged lint path reports scoped failures for selector rules and topology rules from one frontend gate.

## Phase 5: Source-adapter migration

- [x] 5.1 Migrate `frontend/src/infrastructure/{bridge-runtime-source,download-runtime-source,notification-source,observability-log-source,preferences-source,season-source}.ts` into folder entrypoints with colocated `index.ts`, role files, and removed flat facades.
- [x] 5.2 Update `frontend/src/infrastructure/__tests__/**` and importing call sites to the folder/index structure, then clear production allowlist entries tied to the retired facades.

## Phase 6: Docs, generator, and artifacts

- [x] 6.1 Update `frontend/scripts/generate-feature.js`, its tests, `frontend/eslint/README.md`, and `docs/architecture.md` so new scaffolds and docs describe the global rule, barrel purity, and folder ownership contract.
- [x] 6.2 Align `openspec/changes/2026-06-19-sdd-21-linter-architecture-enforcement/{design.md,tasks.md,verify-report.md}` with the final slice boundaries, checker ownership, and migration status.

## Phase 7: Final verification

- [x] 7.1 Run `bun --cwd="frontend" run test -- architecture-policy`, script tests, `bun --cwd="frontend" run lint`, `bun --cwd="frontend" run typecheck`, and repo-owned gate checks; record exact results in `verify-report.md`.
- [x] 7.2 Re-check changed-line totals per slice, confirm stacked-to-main PR boundaries held, and document each slice's finish state before `sdd-apply` starts.
