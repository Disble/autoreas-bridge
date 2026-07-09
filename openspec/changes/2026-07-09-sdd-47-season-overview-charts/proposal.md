# Proposal — sdd-47-season-overview-charts

## Intent

The Season Workspace's **Overview tab** today is a bare definition list
(`<dl>` inline in `SeasonWorkspace.tsx` ~lines 177-204) showing only title,
status, created date, min-approval-grade and slots. It answers "what season is
this" but not "how is the season going" — the user cannot see, at a glance, how
many intake rows are still unmatched, where created animes sit in the Sin ver →
Ver hoy → Visto pipeline, how grades cluster around the approval threshold, or
how full the slot quota is.

This change turns the Overview into a **season dashboard**: a small set of
deliberately-chosen visualizations that give a clean picture of the season at
any moment. Because the panel reads the same live `seasonAnimes` dataset every
other workflow tab derives from, the charts update as the season progresses —
new intake rows, new matches, new grades, and new approvals all move the
numbers the next time Overview is viewed, with no new realtime infrastructure.

Success looks like: opening Overview surfaces (1) headline KPI numbers, (2) the
watching pipeline as a stage-ordered bar, (3) intake health by match status,
(4) a grade histogram with the approval threshold marked, and (5) a slots meter
— all reactive to season progress, all consistent with the app's existing
color vocabulary, and all read-only for past seasons automatically.

## Scope (in-scope)

1. **Install `@nivo/bar` (>=0.98.0).** The only charting dependency this change
   needs. Installed via `bun add @nivo/bar` in `frontend/` — never by hand-editing
   `package.json`. The `>=0.98.0` pin is mandatory (React 19 support landed there;
   the project is on React 19.2.5). No other `@nivo/*` package is in scope.

2. **Extract a colocated `ui/OverviewPanel/` module.** Move the inline Overview
   JSX out of `SeasonWorkspace.tsx` into a strict-colocation folder
   (`index.ts`, `OverviewPanel.tsx`, `use-overview-panel.ts`,
   `overview-panel.helpers.ts`, `overview-panel.types.ts`,
   `overview-panel.constants.ts`, `__tests__/`), matching the established
   IntakePanel / EvaluationPanel / SelectionBoard convention. `SeasonWorkspace.tsx`
   then renders `<OverviewPanel />` instead of the current `<dl>`.

3. **Reactive data wiring.** `use-overview-panel.ts` reads `season`,
   `seasonAnimes` and `readOnly` from `useSeasonStore` and, on mount, calls
   `refreshAnimes(source)` (plus `refresh(source)` for season fields) — the exact
   same reactivity pattern EvaluationPanel/IntakePanel already use. Chart-ready
   aggregates are `useMemo`'d from the raw `seasonAnimes` array in
   `overview-panel.helpers.ts`. No WebSocket client, no polling infra is built.

4. **The five Overview visualizations** (chart forms already resolved via the
   dataviz form-first heuristic — see Approach):
   - **KPI stat-tile row** (HeroUI, not nivo): Intake rows total · Created animes ·
     Rated x/y · Approved n/slots. Headline numbers are stat tiles, not charts.
   - **Watching pipeline** — single horizontal stacked `@nivo/bar`: created animes
     grouped by section Sin ver → Ver hoy → Visto, ordinal stage order preserved.
   - **Intake health** — horizontal stacked `@nivo/bar`: all intake rows by
     `matchStatus` (pending / matched / ambiguous / not_found / discarded), reusing
     the matched→success, ambiguous→warning, not_found→danger mapping.
   - **Grade histogram** — vertical `@nivo/bar` columns for grades 1–6: count per
     grade, bars at/above `season.minApprovalGrade` emphasized (accent/success),
     bars below de-emphasized (default), threshold visually marked.
   - **Slots meter** (HeroUI progress/meter, not a pie): approved count vs
     `season.slots`.

5. **Reuse existing derivations, never re-derive.** Approved-count and verdict
   logic MUST come from `decideVerdict` / `countApproved` in
   `selection-board.helpers.ts` (the drift-proof twin of the Go golden suite).
   Match-status coloring reuses `getMatchStatusColor` (`intake-panel.helpers.ts`);
   rated/ungraded counting mirrors the `countUngraded` pattern
   (`evaluation-panel.helpers.ts`).

6. **Hardcoded chart palette + theme-skill update.** Because HeroUI v3 exposes no
   readable CSS variables and nivo needs literal color VALUES, the brand/status
   palette is defined as literal oklch/hex constants in
   `overview-panel.constants.ts`, matching the documented `autoreas-theme` values.
   This drift (literals instead of tokens, forced by the stack) is documented in
   the module and the settled chart palette is added to the `autoreas-theme`
   SKILL.md (living design-system doc; bump its version).

7. **One-line drift correction (in passing).** The doc comments in
   `season-store.ts:59` and `use-evaluation-panel.ts:11` falsely claim the bridge
   desktop store "refreshes live on the `season_changed` realtime signal" — that
   channel is mobile-only. Since OverviewPanel documents the real
   refetch-on-mount mechanism, correct those two comments while nearby. No realtime
   client work.

## Out of scope

- **Download/watch progress per anime chart.** Not in season's data model at all —
  `SeasonAnimeRow` carries `availableChapters` (chapters online), not
  watched/downloaded counts, which are filesystem-derived and owned by the
  `download`/`catalog` context (disk-is-truth, no DB cache). Pulling this into
  Overview would need a NEW cross-context Wails read; deferred to a future slice.
- **Time-series charts** (intake-added-over-time, availability-confirmed-over-time).
  Only `ratedAt` is exposed per anime today; `firstAvailableAt`, `lastCheckedAt`
  and season-anime `createdAt` exist in the SQLite schema but are NOT in the Wails
  DTO or `SeasonAnimeRow`. Unlocking these needs an additive DTO change — a
  separate future slice, not this one. (A "grades recorded over time" line is
  technically feasible from `ratedAt` alone but is deliberately deferred; the five
  scoped views already answer the at-a-glance question without it.)
- **Any donut/pie for the slots ratio.** A single ratio against a limit is a
  meter, not a pie (dataviz rule). If design later wants a donut for a genuine
  part-to-whole breakdown, that is design's call — this proposal scopes `@nivo/bar`
  only.
- **New realtime/push reactivity.** The refetch-on-mount + refetch-after-mutation
  mechanism is sufficient; no WebSocket listener is added to the desktop frontend.
- **Interactive controls on the panel** (e.g. a "recheck availability" trigger).
  Overview stays display-only "dumb UI"; `readOnly` needs no special handling
  beyond what the store already provides.

## Approach & rationale

- **Form-first chart selection, not chart-first.** Each visualization was picked
  by matching the question to the visual form, deliberately (dataviz heuristic),
  not by reaching for a default chart:
  - Headline totals are **numbers**, so they are **stat tiles**, not charts —
    a chart for a single scalar is noise.
  - The pipeline and intake health are **counts across an ordered/nominal set of
    categories that sum to a whole**, so they are **stacked bars** — the pipeline's
    bar preserves the ordinal Sin ver → Ver hoy → Visto conveyor order.
  - Grades are a **distribution with a decision threshold**, so a **histogram with
    emphasis around `minApprovalGrade`** communicates "which side of the line" at a
    glance — far better than a flat count table.
  - Slots-filled is a **single ratio against a hard limit**, so it is a **meter**,
    never a pie.
  - Explicitly ruled out: pie charts for ratio-to-limit, dual axes, per-point
    number labels everywhere, and colors cycled per bar value.
- **Extraction, not rewrite.** Overview is the last workflow tab still inlined in
  `SeasonWorkspace.tsx`; extracting `OverviewPanel/` brings it in line with every
  sibling panel and gives the charts, hook, helpers and constants a home that
  respects the dumb-`.tsx` + strict-colocation constraints. The `.tsx` renders
  HeroUI + nivo components fed entirely by hook-provided props; all aggregation and
  color decisions live in `use-overview-panel.ts` / `*.helpers.ts` / `*.constants.ts`.
- **Reactivity is already solved — reuse it.** The exploration verified there is no
  WS client in the bridge frontend, and HeroUI Tabs do not keep inactive panels
  mounted, so re-entering Overview remounts it and its mount `useEffect`
  refetches. Mirroring EvaluationPanel's `refreshAnimes` call is the whole
  mechanism; building anything more would be redundant infra.
- **Single source of truth for derived numbers.** Approved counts and verdicts are
  ALWAYS derived (never stored) and already have a client twin of the Go golden
  suite. Reusing `decideVerdict`/`countApproved` keeps the "Approved n/slots" tile
  and slots meter consistent with the Selection board and the backend, avoiding a
  parallel (and drift-prone) approval calculation.
- **Palette drift is inherent to the stack, so document it.** nivo cannot consume
  Tailwind classes or HeroUI props and there is no CSS variable to read at runtime;
  literal color constants are the only option. Centralizing them in
  `overview-panel.constants.ts` and promoting the settled palette into
  `autoreas-theme` SKILL.md keeps the design system authoritative and gives the
  next chart feature a documented palette to reuse.
- **Strict TDD, frontend stack.** Helper and hook logic (aggregations, color
  selection, approved-count wiring) leads with failing vitest specs in the
  colocated `__tests__/`. File-size 400-warn / 500-hard-fail, JSDoc on exported
  helpers, `readonly` `*Props`, and English-only code all hold; Spanish appears
  only as the section data literals (`"Sin ver"`/`"Ver hoy"`/`"Visto"`).

## Affected modules

- `frontend/package.json` / lockfile — new `@nivo/bar` dependency (via `bun add`).
- `frontend/src/features/season/ui/SeasonWorkspace/SeasonWorkspace.tsx` — Overview
  tab body changes from inline `<dl>` to `<OverviewPanel />`.
- `frontend/src/features/season/ui/OverviewPanel/` — NEW colocated module
  (`index.ts`, `OverviewPanel.tsx`, `use-overview-panel.ts`,
  `overview-panel.helpers.ts`, `overview-panel.types.ts`,
  `overview-panel.constants.ts`, `__tests__/`).
- Read-only reuse (imported, not modified): `selection-board.helpers.ts`
  (`decideVerdict`/`countApproved`), `intake-panel.helpers.ts`
  (`getMatchStatusColor`), `evaluation-panel.helpers.ts` (`countUngraded`),
  `frontend/src/shared/store/season-store.ts` (`useSeasonStore`,
  `refreshAnimes`/`refresh`).
- `frontend/src/features/season/ui/SeasonWorkspace/season-store.ts:59` and
  `use-evaluation-panel.ts:11` — one-line doc-comment drift correction only.
- `.claude/skills/autoreas-theme/SKILL.md` — add settled chart palette; bump version.
- No backend (`internal/**`) or Wails DTO changes; no schema changes.

## Rollback plan

- **Dependency:** `bun remove @nivo/bar` in `frontend/` restores the prior
  lockfile state (no runtime dependency elsewhere consumes it).
- **Module extraction:** revert `SeasonWorkspace.tsx` to render the inline
  Overview `<dl>` and delete `frontend/src/features/season/ui/OverviewPanel/`.
  The change is purely additive at the feature layer — no store, DTO, backend, or
  schema surface is altered — so removal restores the prior Overview exactly.
- **Theme skill:** revert the `autoreas-theme` SKILL.md palette addition and
  version bump.
- **Doc-comment correction:** independently revertable one-line changes.
- No data migration and no persisted state is introduced, so rollback carries no
  data risk.

## Reference

- Exploration: engram `sdd/2026-07-09-sdd-47-season-overview-charts/explore`
  (obs #4798) — verified data model, store shape, reactivity mechanism, theming
  constraints, and the chart-feasibility table.
- Colocation precedent to mirror:
  `frontend/src/features/season/ui/EvaluationPanel/` and
  `.../SelectionBoard/` (Panel + hook + helpers + constants + `__tests__/`).
- Derivation reuse: `selection-board.helpers.ts` (`decideVerdict`,
  `countApproved`); `intake-panel.helpers.ts` (`getMatchStatusColor`).
- Data model ground truth: `internal/season/domain/season.go` (grades 1–6,
  `MinApprovalGrade` default 4, `Slots` default 12),
  `internal/season/domain/season_anime.go` (`MatchStatus`, `Availability`,
  `Grade`, `RatedAt`), `internal/season/domain/decision.go` (`Consideration`,
  derived `Verdict`).
- Theming: `.claude/skills/autoreas-theme/SKILL.md`,
  `.claude/skills/frontend-theme/SKILL.md` (no CSS vars; component-prop colors).
