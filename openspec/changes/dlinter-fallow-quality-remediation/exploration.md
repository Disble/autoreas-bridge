## Exploration: dlinter-fallow-quality-remediation

### Current State
- Canonical commands executed from repo root:
  - `bun --cwd="frontend" run lint`
  - `bun --cwd="frontend" run fallow audit --quiet`
  - `bun --cwd="frontend" run fallow audit --format json --quiet`
  - `bun --cwd="frontend" run fallow dupes --format json --quiet --mode semantic`
  - `bun --cwd="frontend" run fallow dead-code --format json --quiet --unused-files --unused-exports --unused-types`
  - `bun --cwd="frontend" run fallow dead-code --trace src/features/anime-detail/ui/AnimeDetail/anime-detail.helpers.ts:normalizeAnimeDetailPortadaUrl`
  - `bun --cwd="frontend" run fallow dead-code --trace src/features/dashboard/ui/PairingPanel/pairing-panel.helpers.ts:DEFAULT_PAIRING_QR_OPTIONS`
  - `bun --cwd="frontend" run fallow dead-code --trace-dependency eslint`
  - `bun --cwd="frontend" run fallow dead-code --trace-dependency tailwindcss`
  - `bun --cwd="frontend" run fallow dead-code --trace-dependency react-aria-components`
- Runtime truth differs from the user report:
  - ESLint currently reports **64 errors**.
  - `fallow audit --quiet` reports **10 unused exports**, **2 dev-dependencies-in-production**, and **6 duplicate clone groups** in changed-code scope.
  - `fallow dupes --format json --quiet --mode semantic` reports **26 clone groups** and **19.98% duplication** across the full frontend.
  - `fallow dead-code --format json --quiet --unused-files --unused-exports --unused-types` reports **40 unused files**, **27 unused exports**, and **9 unused types**.
- ESLint findings cluster into a small set of root causes:
  - `@typescript-eslint/no-unnecessary-type-assertion` — 19
  - `sonarjs/different-types-comparison` — 12
  - `sonarjs/no-nested-conditional` — 7
  - `@typescript-eslint/no-misused-promises` — 6
  - `@typescript-eslint/no-floating-promises` — 3
  - remaining 17 are isolated test, regex, sort, deprecation, and helper issues.
- Representative root-cause files inspected:
  - Async handler / promise wiring: `src/features/dashboard/ui/BridgeDashboard/BridgeDashboard.tsx`, `src/features/dashboard/ui/PairingPanel/PairingPanel.tsx`, `src/features/catalog/ui/CatalogPanel/CatalogPanel.tsx`, `src/features/download/ui/HosterPriorityEditor/use-hoster-priority-editor.ts`, `src/features/anime-detail/ui/AnimeDetail/use-anime-detail.ts`
  - Type assertion drift in Wails adapters: `src/infrastructure/season-source/season-source.helpers.ts`, `src/infrastructure/bridge-runtime-source/bridge-runtime-source.helpers.ts`, `src/infrastructure/download-runtime-source/download-runtime-source.helpers.ts`, `src/infrastructure/preferences-source/preferences-source.helpers.ts`
  - Duplicate-shape hotspots: `src/shared/contracts/anime.types.ts`, `src/shared/contracts/download.types.ts`, `src/infrastructure/season-source/season-source.types.ts`, `src/features/history/ui/HistoryTable/history-table.types.ts`, `src/features/chapters/ui/ChapterSchedulePanel/chapter-schedule-panel.types.ts`
  - Duplicate JSX hotspots: `src/features/catalog/ui/CatalogFilterBar/CatalogFilterBar.tsx`, `src/features/history/ui/HistoryTable/HistoryTable.tsx`, route wrappers under `src/app/routes/*.tsx`
- Fallow signals are mixed quality:
  - `dead-code` flags many `index.ts` barrels and `*.schema.ts` files as unused, even when the feature remains reachable by direct imports.
  - `trace` confirmed at least two exports are truly unused: `normalizeAnimeDetailPortadaUrl` and `DEFAULT_PAIRING_QR_OPTIONS`.
  - `trace-dependency` confirmed `eslint`, `tailwindcss`, and `react-aria-components` are truly used, so any dependency cleanup must follow the tracer, not the audit summary alone.

### Affected Areas
- `frontend/eslint.config.js` — lint gate source of truth through `dlinter-ts-react`.
- `frontend/.fallowrc.json` — Fallow repo truth; must only receive precise, justified changes if code fixes cannot resolve a real false positive.
- `frontend/scripts/__tests__/generate-feature.test.mjs` — one sonar security-style lint finding around `execFileSync('node', ...)`.
- `frontend/src/features/dashboard/ui/BridgeDashboard/BridgeDashboard.tsx` — promise-returning handler passed into HeroUI `onPress`.
- `frontend/src/features/dashboard/ui/PairingPanel/PairingPanel.tsx` — same promise-handler pattern.
- `frontend/src/features/catalog/ui/CatalogPanel/CatalogPanel.tsx` — same promise-handler pattern.
- `frontend/src/features/download/ui/SchedulePanel/SchedulePanel.tsx` — two promise-handler findings.
- `frontend/src/features/history/ui/HistoryTable/HistoryTable.tsx` — promise-handler issue and duplication with catalog filter UI.
- `frontend/src/features/anime-detail/ui/AnimeDetail/use-anime-detail.ts` — navigation callback trips floating-promises rule.
- `frontend/src/features/download/ui/HosterPriorityEditor/HosterPriorityEditor.tsx` — `react-aria-components` reorder ids are compared against impossible `undefined` branches.
- `frontend/src/features/season/ui/IntakePanel/intake-panel.helpers.ts` — two regex complexity findings.
- `frontend/src/features/season/ui/OrderingBoard/ordering-board.helpers.ts` — type comparisons, nested assignment, and sort callback issues in the dnd helper layer.
- `frontend/src/infrastructure/*-source/*.helpers.ts` — repeated unnecessary Wails binding assertions and inconsistent helper return types.
- `frontend/src/shared/contracts/*.types.ts`, `frontend/src/features/**/**/*.types.ts` — the largest duplication surface; repeated DTO/view-model shapes drive most clone groups.
- `frontend/src/features/**/index.ts` and `*.schema.ts` — high-risk Fallow delete candidates that may be intentional colocation/public-surface files.

### Approaches
1. **Lint-first, slice-based remediation** — remove deterministic ESLint debt before Fallow structure work.
   - Pros: Clears the hard failure gate first, exposes real remaining Fallow surfaces, and keeps each change easy to verify.
   - Cons: Needs careful TDD around hook/helper changes and several small refactors across many feature folders.
   - Effort: Medium

2. **Shared-type and shared-presentational extraction for duplication** — consolidate repeated DTO/view-model/filter control structures into explicit shared modules.
   - Pros: Attacks the true duplication root cause instead of hiding it; likely removes most semantic clone groups cleanly.
   - Cons: Higher architecture risk because shared extraction can easily violate strict colocation or leak domain language across bounded contexts if done lazily.
   - Effort: High

3. **Suppress or baseline the findings** — add broad Fallow ignores, keep barrels/schemas as-is, and quiet lint with local disables.
   - Pros: Fastest path to green numbers.
   - Cons: Violates the requested outcome, hides real debt, and weakens repo architecture enforcement.
   - Effort: Low

### Recommendation
Use a **two-track remediation plan built on Approach 1 first, then targeted pieces of Approach 2**.

- **Slice 1 — deterministic lint fixes**
  - Promise handlers: wrap `onPress`/event callbacks with void-safe synchronous closures in dumb `.tsx` files while keeping async work inside hooks.
  - Adapter cleanup: remove unnecessary assertions from Wails helper modules and normalize return types.
  - Pure helper cleanup: replace nested ternaries, impossible comparisons, redundant jumps, deprecated React types, unstable alphabetical sorts, and risky regexes.
  - Test hygiene: fix duplicate test names, generic assertions, stray `void` use in tests, and the unused import.
- **Slice 2 — dead-code triage with tracer evidence**
  - Only delete exports/files after `fallow dead-code --trace ...` confirms they are unreachable.
  - Start with confirmed-safe removals like unused exported helper constants/functions.
  - Treat `index.ts` barrels, `*.schema.ts`, and exported prop types as suspect until traced or connected to generator/public-surface conventions.
- **Slice 3 — duplication remediation by category**
  - Shared DTO/type blocks: extract stable shared shapes where the vocabulary already belongs to a shared contract module.
  - Repeated filter/select JSX: introduce shared dumb filter field primitives under an appropriate shared UI folder.
  - Route wrappers: extract a small composition helper only if it keeps `App` and route files composition-only.
  - Hook/store repeated fetch patterns: extract pure helpers only when hook anatomy stays compliant.
- **Acceptance criteria**
  - `bun --cwd="frontend" run lint` returns zero errors.
  - Fallow duplication is reduced by real refactors, with no broad new ignores or blanket baselines.
  - No generated `wailsjs/**` files are edited.
  - No valid tests, fixtures, or architecture guards are deleted just to satisfy Fallow.
- **Negative criteria**
  - Do not widen `ignorePatterns` or add repo-wide suppression comments as a shortcut.
  - Do not delete `index.ts`, `*.schema.ts`, `__tests__`, or helper exports without trace evidence.
  - Do not weaken the dumb UI rule, hook-order rule, strict colocation rule, or file-size ceiling.
  - Do not replace real duplication with hidden baselines unless a proven Fallow false positive has a narrow, documented exception.

### Risks
- Fallow full-code duplication and changed-code audit report different numbers; proposal and tasks must name which command is the contractual metric.
- Many dead-code findings target barrels and schemas that may be intentional project structure, generator output, or future public entrypoints.
- Shared-type extraction can create architecture leakage if DTOs from feature folders are moved into the wrong shared layer.
- Promise-handler lint fixes touch many UI components; careless edits could leak business logic back into `.tsx` files.
- Regex and sort fixes in helpers can change behavior if not covered with focused tests first.
- `react-aria-components` is truly used but currently missing from `frontend/package.json`; dependency truth must be resolved carefully during remediation.

### Ready for Proposal
Yes — proposal should commit to canonical verification commands, split the work into lint, dead-code triage, and duplication slices, and explicitly forbid suppression-first cleanup.
