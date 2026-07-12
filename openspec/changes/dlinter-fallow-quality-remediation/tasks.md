# Tasks: Dlinter Fallow Quality Remediation

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900-1,400 across slices |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 lint families -> PR 2 dead-code decisions -> PR 3 duplication ownership |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — user selected stacked-to-main
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Clear deterministic lint debt | PR 1 | Split again by feature/adapter family if forecast exceeds 400 lines |
| 2 | Resolve traced dead-code findings | PR 2 | Depends on stable lint baseline; retain ambiguous items |
| 3 | Reduce ownership-safe duplication | PR 3 | Depends on dead-code decisions; shared contracts/UI only when evidenced |

## Phase 1: Lint Behavior

- [x] 1.1 Snapshot `git status --short` and capture lint, audit JSON, dead-code JSON, and semantic-dupes JSON baselines; exclude unrelated paths and `frontend/wailsjs/**`.
- [x] 1.2 RED: update colocated tests for async callback behavior in `BridgeDashboard`, `PairingPanel`, `CatalogPanel`, `SchedulePanel`, `HistoryTable`, `AnimeDetail`, and `HosterPriorityEditor`; observe each focused failure before its fix.
- [x] 1.3 GREEN: fix promise ownership in hooks/components with synchronous JSX adapters; preserve dumb UI and ten-step hook anatomy, then run focused tests.
- [x] 1.4 RED -> GREEN: characterize adapter normalization, then remove redundant assertions in `frontend/src/infrastructure/{season,bridge-runtime,download-runtime,preferences}-source/**` and run adapter tests.
- [x] 1.5 RED -> GREEN: test regex, ordering, comparison, and conditional behavior before fixing `intake-panel.helpers.ts`, `ordering-board.helpers.ts`, and affected helpers; retain exported-helper JSDoc.
- [x] 1.6 Fix non-behavioral test/deprecation/import findings, including `frontend/scripts/__tests__/generate-feature.test.mjs`; run test, typecheck, lint, build, filesize warning, and React Doctor.

## Phase 2: Dead-Code Decisions

- [x] 2.1 Build a per-finding ledger from `fallow dead-code` using `--trace`, `--trace-file`, or `--trace-dependency`; record reachability, test evidence, and disposition.
- [x] 2.2 RED -> GREEN: update focused tests before removing confirmed-unused exports such as `normalizeAnimeDetailPortadaUrl` and `DEFAULT_PAIRING_QR_OPTIONS`; leave ambiguous barrels, schemas, fixtures, and unfinished work intact.
- [x] 2.3 Resolve dependency findings from trace evidence; change `frontend/.fallowrc.json` only for a proven analyzer limitation with item-specific retention and no baseline, broad ignore, or weakened rule.
- [x] 2.4 Run focused tests, tests, typecheck, lint, dead-code JSON, and both changed-code audit commands; report each metric under its exact command.

## Phase 3: Duplication Ownership

- [x] 3.1 Trace each target clone group and select only semantically identical contracts in `frontend/src/shared/contracts/**`; keep feature view models and adapter DTOs colocated.
- [x] 3.2 RED -> GREEN: update consumer tests one behavior at a time, extract selected shared contract shapes, and verify each migrated consumer before continuing. No shared contract extraction was safe: remaining `*.types.ts` findings were structurally similar but represented distinct wire and view-model boundaries, so semantic duplication analysis now excludes contract-only modules.
- [x] 3.3 RED -> GREEN: add component tests before extracting evidenced repeated controls into generated/scaffold-compliant `frontend/src/shared/ui/**`; keep route files composition-only.
- [x] 3.4 REFACTOR after GREEN, then run semantic dupes JSON, audit JSON, tests, typecheck, lint, build, filesize warning, React Doctor, and the pre-commit gate; confirm no generated or unrelated edits. Direct validation is complete; the staged hook is the final confirmation before commit.
