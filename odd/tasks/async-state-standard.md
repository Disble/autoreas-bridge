# Async-state standard (readiness, failure codes, server state)

Objective: one standard for loading/readiness/failure state across Go modules and the frontend, so no screen renders "no data" while the backend is not ready, guided by helpers and skills with gates as tripwires.
Branch: `feat/async-state-standard` (worktree `autoreas-bridge-worktrees/async-state-standard`, from `dev` at `fe1fa0fa`). Delivery: local work-unit commits, slices merged into `dev` locally on owner OK (no push/PR). Test runners: `go test`, `bun --cwd="frontend" run test`.

## Specs

- **S1 — Backend owns and reports its state.** Owner: "debería existir un estado de loading que se envie al frontend, lo que no puede ser es que el frontend tenga skeletons, loaders y real time, pero que le valga madres al backend". Acceptance: a binding never answers empty/"ok" while its module is not ready; readiness is queryable and pushed.
- **S2 — One standard of states.** Owner: "debemos tener un estandar de estados, para que cada modulo del backend (y frontend) no terminen con estados cada uno de su padre y de su madre". Acceptance: one module lifecycle (`starting | ready | failed(reason)`), one failure-code set, one frontend query model.
- **S3 — Architecture decided before adoption.** Owner: "tankstack query no se agrega así no más en un proyecto de esta envergadura, cómo lo harás? y si has evaluado las alternativas, tanto internas como externas antes de proponerlo?" Acceptance: ADR-032 records alternatives, decision (TanStack Query owns server state, Zustand keeps UI state) and that it supersedes ADR-006 for server state.
- **S4 — Hexagonal alignment.** Owner: "quiero saber si tu siguiente propuesta corregida sigue en línea con la arquitectura hexagonal que maneja el proyecto". Acceptance: registry in its own Wails-free package written only by the composition root; transitions on `events.Bus`; failure→code mapping only in driving adapters; domains keep sentinel errors; OCC `conflict` stays a successful outcome; App does not grow (ADR-018); frontend layering features → shared/query → infrastructure.
- **S5 — Guide before block.** Owner: "los bloqueos deben estar acompañados de instrucciones (prompts) y helpers que puedan usar la IA para que prefieran usar lo que ofrecemos en lugar de reinventar la rueda." Acceptance: every rule ships helper → instructions → scaffold → gate whose message names the helper and the skill; deliberate bypass is out of scope.
- **S6 — Architecture docs per module, backend and frontend, retroactive.** Owner: "por cada módulo que se refactorice, cree o modifique, toda su documentación de arquitectura de ese módulo se actualiza retroactivamente" and "por supuesto que la architecture incluye frontend". Acceptance: each slice brings every touched module page under `docs/architecture/` fully current (backend and frontend sections), creating it if missing; README scope widened.
- **S7 — Skills for every agent runtime.** Owner: "añade la skill también a .agents y te lo apruebo, no asumas que solo se usa claude code aquí". Acceptance: `bridge-data` exists identical in `.claude/skills/` and `.agents/skills/`; guidance lines in both `CLAUDE.md` and `AGENTS.md`; a parity test fails when the two skill copies differ.
- **S8 — Work in a worktree.** Owner: "todo esto, como es muy largo se lo realizará en un worktree".
- **S9 — Today never opens as if empty.** Owner: "por qué bridge prod a veces abre así? … como si no tuviera datos?" Acceptance: with the episodes module still starting, Today shows its skeleton; once ready it shows the schedule; if startup failed it shows the failure Alert.
- **S10 — Judgment Day residuals accepted as specs** (owner: "te lo apruebo"): F-1 stale-baseline check also on staged files in pre-commit, message names the entry; F-2 skill recipe for a binding in an unmigrated module (create its handle first); F-3 discovery through tracked skill folders + CLAUDE.md/AGENTS.md, never `.atl/`; F-4 architecture page template created in slice 0; S-A1 `unavailable`/`failed_precondition` constructors unexported, produced only by the handle package; S-A2 binding-signature rule limited to string-status and slice-without-error returns; S-B1 `EventsOn`/`subscribe*` gate ships with its baseline inventory; S-A3 `toAsyncView` is called in hooks, `.tsx` only renders.

Design source until ADR-032 lands: Judgment Day `proposal-r2.md` (sha256 `34533f43…0963`) and `verdict.md`, session scratchpad `jd-async-state/`.

## Tasks

| ID | Specs | Route | Status | Commit / evidence |
|---|---|---|---|---|
| T0 | S8 | inline | done | worktree from `dev` `fe1fa0fa`; `bun install --frozen-lockfile` OK (532 packages), `typecheck` exit 0, `bun.lock` diff empty, CodeGraph initialized |
| T1 | S3 S4 S5 S6 S10(F-4) | inline (docs, passive) | done | ADR-032; `cross-cutting/async-state.md` (3 Mermaid diagrams, Known drift measured); `templates/overview.md` with Readiness and Frontend sections; README scope widened to backend + frontend; `docs/architecture.md` §5 pointer; ADR-006 status partly superseded; module-docs rule + references in `CLAUDE.md` and `AGENTS.md`. Commit: see Log |
| T2 | S1 S2 S4 S5 S10(F-1,S-A1,S-A2) | inline unless a Writer trigger fires | open | Go: `internal/lifecycle`, failure codes, typed module handles + `shell`, wrapper, ErrorFormatter, `GetReadiness` + `bridge.readiness`, checkarchitecture rules + baseline, desktop-shell architecture page. Risk: items 3, 4 |
| T3 | S2 S3 S5 S7 S10(F-1,F-2,F-3,S-B1,S-A3) | inline unless a Writer trigger fires | open | Frontend: TanStack Query, `shared/query` helpers, readiness gate, invalidation bridge, merged ESLint block + baseline script, scaffold, `bridge-data` skill in both folders + parity test, CLAUDE.md/AGENTS.md lines, autoreas-theme update. Risk: items 3, 5 |
| T4 | S1 S6 S9 | inline | open | Today pilot: episodes handle, schedule/day-count bindings via `Use`, hooks via `useBridgeQuery`, no `[]` fallbacks, anime context pages (backend + frontend) |
| T5 | S1 S2 S6 | per context | open | Remaining contexts, one slice each; split when reached; download and season stores last |

## Log

- **L1 (2026-11-14, original request):** "por qué bridge prod a veces abre así? [Image #1], como si no tuviera datos?"
- **L2:** Diagnosis: Wails v2.15 runs OnStartup in a goroutine (`frontend.go:228-232`); `GetEpisodeSchedule` returns `[]` while `episodeService` is nil (`internal/desktop/app_runtime.go:236-245`); `GetBridgeStatus` says "ok" during startup and is never called by the frontend.
- **L3:** Owner corrections in order: backend must report state (S1); one standard (S2); evaluate alternatives first (S3); enforcement must exist (ADR-006 drifted with no machine owner: 4 stores vs ~40 hand-fetch hooks); judgment day requested; worktree (S8); architecture docs retroactive incl. frontend (S6); hexagonal check (S4); guide before block (S5); skills in `.agents` too (S7).
- **L4:** Judgment Day: 3 attempts, terminal ESCALATED with no confirmed CRITICAL; residuals accepted as S10 on owner approval.
- **L5:** Found while scoping S7: `.claude/skills` has 47 tracked files and `.agents/skills` 46; `activity-events` exists only in `.claude/skills`. Nothing checks parity today.
- **L6:** `AGENTS.md` has drifted from `CLAUDE.md` beyond the skill-path line: it lacks the ADR-030 provider-client rule and the `cfclearance` solver-mode mention (`diff CLAUDE.md AGENTS.md`, lines 84-85). Out of this feature's scope; recorded as evidence for S7's parity concern.
- **L7 (T1):** verified while writing: `dev` `fe1fa0fa` and `main` `b4392629` have identical trees; `GetEpisodeDayCounts` also degrades to `[]` (`internal/desktop/app_runtime.go:357-366`).
- **Next:** T2 (Go foundation).
