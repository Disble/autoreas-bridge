# Tasks: Airis Empty States

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,150 authored lines; three binary assets excluded from line count |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Work units below; PR bases pending chain-strategy decision |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain, delivered as one local commit |

Decision needed before apply: Resolved
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain (local commits, no pull requests)
400-line budget risk: High

### Chain-strategy decision

The selected strategy is `feature-branch-chain` with each work unit as a LOCAL
commit; no pull request is opened for this change.

The four units below are nonetheless delivered as ONE commit, because unit 1 does
not survive the repository gate on its own: `fallow audit` reports an exported
symbol whose only consumer is its own test as unused, so a commit holding the
shared `AirisEmptyState` before any feature renders it fails the gate for being
dead code. The units stay as the review and rollback boundaries they were
planned as; they are simply not separate commits.

### Suggested Work Units

| Unit | Goal, acceptance, rejection, forbidden behavior | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1 | Assets and shell. Accept three distinct 512px transparent compositions and accessible action. Reject duplicate/opaque art. Forbid state, routing, or raw controls in shared UI. | `bun --cwd=frontend run test -- AirisEmptyState` | `bun --cwd=frontend run check:airis-assets` | assets + `shared/ui/AirisEmptyState/` |
| 2 | Async lifecycle. Accept errors before empty classification and recovery clears errors. Reject stale/cancelled updates. Forbid consumer regressions. | `bun --cwd=frontend run test -- use-async-list` | N/A: hook contract | `shared/hooks/use-async-list/` |
| 3 | Surface states. Accept contextual Today and truthful Library/Catalog recovery. Reject loading/error/nonempty Airis. Forbid wrong or dual CTAs. | focused Episode/Editor/Catalog Vitest files | layout fixture at both viewports | feature folders only |
| 4 | Routing and release proof. Accept Create precedence and mounted reselection. Reject `create` as ID. Forbid route-order regressions or stale active-change alignment. | `bun --cwd=frontend run test -- App` | `bun --cwd=frontend run render:smoke` | routes, smoke script, `.atl/active-sdd-change` |

## Phase 1: Assets and Shared Presentation

- [x] 1.1 RED: add `AirisEmptyState.test.tsx` for 512×512 decorative eager/async image and exact supplied button name; reject missing action/image semantics.
- [x] 1.2 Create three genuinely distinct compositions from `.ignore/blank/airis.png` (read-only); convert/optimize `assets/airis-empty-states/{today,editor-library,catalog}.webp` as transparent 512×512 WebP.
- [x] 1.3 Add `frontend/scripts/check-airis-assets.mjs` and `package.json` command; fail wrong codec/dimensions or fully opaque alpha.
- [x] 1.4 GREEN/REFACTOR: create typed readonly `shared/ui/AirisEmptyState/`; use HeroUI Card/Typography/optional primary Button, Vite imports, no predicates/effects/routing.

## Phase 2: Error Lifecycle and Feature States

- [x] 2.1 RED: extend `use-async-list.test.ts` for start/success/reload/source/refresh error clearing, rejection, cancellation, and History/dashboard compatibility.
- [x] 2.2 GREEN/REFACTOR: add additive `error` to `use-async-list` types/hook; rejected loads settle empty with error while cancelled loads change nothing.
- [x] 2.3 RED then GREEN: update Episode panel hook/component tests and code for loading/error precedence, contextual selected day/lens empty copy, controls retained, and Create → `/editor/create`.
- [x] 2.4 RED then GREEN: add Editor helper/hook/panel tests and code for actual-empty versus criteria-empty, default reset, exclusive Create/Clear actions, and rejection feedback.
- [x] 2.5 RED then GREEN: add Catalog helper/hook/panel tests and code for rejection-before-classification, actual/criteria truth, full default reset, and exclusive actions.

## Phase 3: Routing, Layout, and Verification

- [x] 3.1 RED: extend `app/__tests__/App.test.tsx` for root/legacy redirects, static `/editor/create`, `/editor/:id` Library, and mounted Library→Create reselection.
- [x] 3.2 GREEN/REFACTOR: add static route before `:id`; pass keyed `initialTab` through `AnimeEditorRoute` types so uncontrolled Tabs remount correctly.
- [x] 3.3 Add `layout-fixtures/airis-empty-states-fixture.tsx` and register it: import production shell/constants/assets; assert decoded 512 image, visible in-card box, and no horizontal overflow at 1280×900 and 1600×1000.
- [x] 3.4 Run focused tests, `typecheck`, `lint`, `audit`, `doctor:react`, `check:airis-assets`, `layout:smoke`, and `render:smoke` with `/#/editor/create` marker.
- [x] 3.5 Stage touched frontend guards; run `bun --cwd=frontend run test:mutation:staged`, resolve observable Stryker survivors, then rerun focused suites.
- [x] 3.6 Apply preparation: set `.atl/active-sdd-change` to `airis-empty-states`, choose a chain strategy before apply, then run the final `lefthook run pre-commit` gate.
