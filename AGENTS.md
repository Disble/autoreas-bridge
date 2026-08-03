# Autoreas Bridge — Agent Instructions

## Project Context

- Repo: `autoreas-bridge`
- Stack: Go + Wails v2 + React/Vite
- Architecture target: Hexagonal / Ports & Adapters with bounded contexts and an in-memory Event Bus
- SDD mode: `hybrid`
- Bridge is the sole owner of anime state; its embedded SQLite database (`anime_snapshots` and related tables) is the only source of truth. There is no Legacy Desktop synchronization channel (retired in SDD-55 — see `docs/adr/008-legacy-breakup-sqlite-sole-owner.md`).

## CRITICAL FRONTEND ARCHITECTURE CONSTRAINTS (DO NOT IGNORE)

1. **Dumb UI Rule**: Files with `.tsx` extensions under `frontend/src/features/` MUST only render JSX using HeroUI React primitives and Tailwind classes. ZERO Wails calls, ZERO `useEffect`, and ZERO business/data transformation logic are allowed in those `.tsx` files.
2. **Hook Anatomy Rule (10 Steps)**: Custom hooks (`use-*.ts`) in the frontend MUST follow this order: Imports -> Signature -> 1. Refs -> 2. State -> 3. Context/3rd Party Hooks -> 4. Queries/Mutations -> 5. Derived State (`useMemo`) -> 6. Callbacks (`useCallback` calling pure helpers) -> 7. Effects -> Return.
3. **Strict Colocation**: Each complex frontend UI module must be an independent folder with `.tsx`, `use-*.ts`, `*.helpers.ts`, `*.types.ts`, `*.constants.ts`, optional `*.schema.ts`, and colocated `__tests__/`. **No `index.ts` barrel** — modules are imported by concrete path. See `docs/adr/011-no-barrel-files.md`.
   - **ESLint Enforcement**: You are FORBIDDEN from putting `interface`, `type`, root-level `const`, root-level helper functions, or inline Zod schemas in frontend feature `.tsx` or `use-*.ts` files.
   - **Function Export Rule**: Frontend feature `.tsx` and `use-*.ts` files MUST export the main symbol as a named `function`, never a root-level `const` arrow function.
4. **Delivery Layer Rule**: `frontend/src/App.tsx` and any future `frontend/src/app/**` files are composition only. They MUST NOT use React state/effect hooks, MUST NOT call Wails bindings directly, and MUST NOT contain business logic.
5. **Readonly Props Rule**: Every property in any `*Props` interface inside frontend `*.types.ts` files MUST be declared as `readonly`.
6. **Mandatory JSDoc on Helpers**: All exported functions in frontend `*.helpers.ts` MUST have a JSDoc block explaining what the function does and why.
7. **TDD Mandate**: You are PROHIBITED from modifying or creating a frontend helper or hook without first creating or updating its corresponding test file in the colocated `__tests__/` directory.
8. **The 500-Line Rule**: If any frontend `.ts` or `.tsx` file exceeds 500 lines, refactor it immediately.
9. **Reference Feature**: If in doubt, use `frontend/src/features/dashboard` as the frontend source-of-truth structure once introduced.
10. **Scaffolding Generators**: NEVER create complex frontend feature folders manually when a generator can do it. Use `bun --cwd="frontend" run generate:feature <feature> <ComponentName>`.
11. **Drag & Drop Rule**: Load the `dnd-kit` skill for any drag-and-drop (sortable, kanban/multi-column). Use the new `@dnd-kit/react` + `@dnd-kit/helpers` (React 19 + StrictMode safe, pointer-based for Wails WebView2). NEVER legacy `@dnd-kit/core`/`sortable`/`utilities`, NEVER native HTML5 DnD, and NEVER remove `React.StrictMode` to make dragging work.
12. **Shared Dumb Components Rule**: Reusable presentation-only components live in `frontend/src/shared/ui/` — e.g. `LabeledTextField`, `LabeledSelect`, `LabeledCheckbox`, `PathPickerField`, `AnimeCoverPlaceholder`. PREFER composing these over hand-writing another raw `Label`/`Input`/`Select` block. When a Label/Input/Select pattern repeats (3+ instances), EXTRACT a new generic `shared/ui` component (readonly props in a colocated `*.types.ts`, JSDoc, colocated test) — this is the sanctioned way to cut JSX duplication and render complexity that the Fallow gate flags.

## Mandatory Workflow

1. Read `openspec/changes/` (folders are date-prefixed, so they sort into change order) and follow that order unless the user explicitly reprioritizes.
2. Before implementing, read the corresponding artifacts in `openspec/changes/<change>/`.
3. Treat `openspec/specs/` and active change artifacts as the execution contract.
4. Prefer incremental changes with verification after each meaningful step.
5. **CRITICAL OVERRIDE - Auto-Pilot SDD**: The entire SDD workflow (explore -> propose -> spec -> design -> tasks -> apply -> verify -> archive) MUST run completely automatically and proactively from start to finish. THIS OVERRIDES ALL DEFAULT SKILL BEHAVIORS. You are STRICTLY FORBIDDEN from pausing to ask "should I continue?", "do you want to proceed to specs?", or waiting for approval. Present the phase summary and IMMEDIATELY trigger the next phase. Ignore simple reviews aggressively to save the user time. Ask for user input ONLY on hard, unresolvable blockers. If questions arise about preferences or past discussions, search engram memory FIRST. Execute the rest of the skills exactly as indicated but with ABSOLUTELY ZERO user intervention between phases.

## Testing Rules

- Load `bridge-testing` before writing, reviewing, or refactoring bridge tests.
- Load `bridge-debugging` when investigating regressions or any mismatch between tests and runtime behavior.
- When writing Go tests, also load `go-testing`.
- When Strict TDD is enabled in `openspec/config.yaml`, follow RED → GREEN → **MUTATE** → REFACTOR strictly.
- **Load `mutation-tdd` and mutation-check every guard before refactoring.** Delete the guard the test claims to cover, run only that test, and confirm it FAILS; then `git checkout -- <file>`. A test that still passes with its guard deleted proves nothing, and neither `go test` nor the coverage percentage will tell you. This is mandatory for concurrency tests, defensive branches (nil guards, clamps, `if err == nil { return }`), error and timeout paths, and any test written to close a coverage gap.
- Mutation checking is a prompt-driven step, NOT a hook. `lefthook.yml` deliberately does not run it: gremlins is non-reproducible on Windows and `go run ./tools/mutationstaged` costs ~100s per staged file against a ~90s gate. See `docs/mutation-testing.md`.
- Branches the scheduler cannot reach (a raced pointer swap, `setErr(nil)`) need direct invocation of the unexported function from an in-package test. A stress loop that never reaches the branch passes while proving nothing — this has already happened twice in this repo.
- Prefer real stored-shape validation for the `internal/anime/store` codec: use the synthetic and single-line stored-shape fixtures under `internal/anime/store/testdata` (cloned from a real database row before `resources/autoreas-data/animes.dat` was deleted in SDD-55) when validating codec round-trips or stored-shape assumptions. Never mutate fixtures in place during tests; copy to temp locations first.

## Cross-Cutting File Size Policy

- Go and frontend files share a warning threshold at 400 effective lines and a hard failure ceiling above 500 effective lines.
- The Go gate is repo-owned and enforced with `go run ./tools/checkgofilesize` through `lefthook.yml`.
- The frontend warning path is `bun --cwd="frontend" run filesize:warning`; it must stay advisory-only and preserve the existing ESLint hard failure path at `>500`.
- Existing oversized Go files may stay only when `tools/checkgofilesize/baseline.yaml` records a no-growth ceiling.
- `tools/checkgofilesize/baseline.yaml` is expected to be empty (`files: []`). It exists only as structural scaffolding for any temporary approved debt that must not grow; any entry MUST be removed as soon as the file reaches `<=500` effective lines.
- New Go files, renamed Go files, and files already at `<=500` effective lines MUST NOT receive baseline entries.
- Zero permanent `>500` debt is the enforced end state. Treat any entry above 500 as an active exception that must be eliminated, not accepted.
- Shrink the file or shrink the baseline ceiling in the same PR when debt gets smaller. Remove the baseline entry once deterministic counting reaches `<=500` effective lines.
- Comment padding, fake generated-path tricks, and ad-hoc hook flags are forbidden loopholes.
- For implementation details, see `docs/file-size-policy.md`.

## Pre-commit Gate

- The repo uses `lefthook.yml` as the single pre-commit entrypoint.
- **The gate is SLOW by design — budget for it.** A full pre-commit run takes ~90 seconds and can exceed 2 minutes on a cold cache (golangci-lint, `go vet`/coverage, frontend typecheck/lint/test/Fallow, filesize all run serially). When you run `git commit`, use a generous command timeout (≥ 5 minutes / 300000 ms) so the commit is not killed mid-hook. A killed commit leaves changes staged but unrecorded — re-run `git commit` (do not `--no-verify`) to complete it.
- The gate is intentionally **complete**, not partial: frontend Fallow audit + lint/test via Bun, formatting, lint, `go vet`, `go test`, coverage, and SDD artifact validation all run before commit.
- Repo-owned validators live in `tools/checkgofmt`, `tools/checkgofilesize`, and `tools/checksdd`; avoid reintroducing shell-specific orchestration scripts for the gate.
- If more than one active change exists under `openspec/changes/`, set `.atl/active-sdd-change` locally (gitignored) to the change name that the commit belongs to.
- An active change MUST have `proposal.md`, `design.md`, `tasks.md`, at least one `spec.md`, and a `verify-report.md` whose verdict is `PASS` or `PASS WITH WARNINGS`.

## Releasing

- Load `bridge-release` when bumping the version, building the installer, or shipping a build.
- The version lives only in `wails.json` → `info.productVersion`; `build/windows/installer/wails_tools.nsh` is generated by `wails build -nsis` and must never be hand-edited.

## Frontend Static Analysis (Fallow)

- Load `fallow-repo-setup` when auditing frontend dead code, dependency hygiene, duplication, complexity, or changed-code risk.
- Fallow is frontend-scoped in this repo: run it with `bun --cwd="frontend" run fallow ...`.
- The enforced config lives in `frontend/.fallowrc.json`; treat it as repo truth and do not add remote config inheritance.
- `lefthook.yml` runs `bun --cwd="frontend" run fallow audit --quiet` as the pre-commit changed-code gate.
- `wailsjs/**` is generated bridge/runtime code and intentionally ignored by Fallow.
- `src/test/setup.ts` is a required manual entry point in Fallow config; do not remove it casually or Vitest setup can be misclassified as dead code.
- For operational details and triage rules, see `docs/fallow-usage.md`.

## Language Policy (Code in English)

- **All code is English by default**: identifiers, function/method names, DB column
  names, error strings, and comments. See `docs/adr/007-english-code-spanish-boundaries.md`
  (superseded by `docs/adr/008-legacy-breakup-sqlite-sole-owner.md`, which retains
  this policy's storage-format exception below).
- Spanish is allowed ONLY at three boundaries:
  1. **Retained storage-format codec** — fields that must byte-match the historical
     NeDB-shaped JSON stored in `anime_snapshots.snapshot_json`
     (`internal/anime/store`'s `wire.go`/`mapper.go`/`projection.go`: `Pagina`, `Dias`,
     `NroCapVisto`, `FechaEstreno`, `activo`, `primeravez`, …). This is Bridge's own
     internal storage codec (there is no external Legacy consumer left); Spanish
     MUST NOT propagate past it into domain/service/API layers.
  2. **Runtime data literals** — Spanish *values* in stored data (Estrenos sections
     `"Sin ver"`/`"Ver hoy"`/`"Visto"`, `"No me gusto"`, …). The values stay Spanish;
     the identifiers carrying them are English.
  3. **UI copy** — separate rule (frontend UI text is English).
- Cross-service wire contracts use English field names too (e.g. mobile season
  rating: `{ "anime_id", "grade", "rated_at" }`, never `"nota"`). Fix the wire name
  before the sister repo consumes it.
- When a slice touches Spanish bridge code predating this policy, it English-ifies
  the vocabulary it owns (rename + additive column migration). Do NOT rename shipped
  Spanish that another pending slice actively owns — let the owning slice do it, and
  record any code↔plan drift per "code wins".

## Boundary Truths

- GREEN is provisional when the bug lives at the SQLite or Windows filesystem boundary.
- Real behavior beats permissive mocks.
- Anime state lives in `anime_snapshots.snapshot_json`, keyed by `_id`; effective state must be reasoned by `_id`, not by naive row-order diffs.
- `activo=false` is not a tombstone.
- Bridge no longer watches, parses, or writes any external Legacy file (SDD-55). There is no `animes.dat` file-watch or atomic-replace concern left to reason about.

## Delegation and Verification Guardrails

- If docs, specs, or archived changes conflict with the code, treat the **codebase** as the runtime truth, document the drift, and only then plan the fix.
- When delegating bugfix or apply work to sub-agents, prompts MUST include the exact reproduction steps/commands when known.
- Those prompts MUST include both acceptance examples and rejection/negative examples; do not describe only the happy path.
- Those prompts MUST name forbidden outputs or behaviors explicitly when the bug involves false positives, misleading fallbacks, or malformed UX.
- If the user explicitly asks the orchestrator to perform a repo-doc or instruction-file update itself, do not delegate that file edit to a sub-agent.
- Verification is a special case: the orchestrating agent MUST perform the final verification itself and MUST NOT delegate the verify phase to a sub-agent. Other phases may still use sub-agents when appropriate.
- After verify passes, the orchestrating agent MUST create the commit before reporting verify as fully complete. The commit's own hooks/validations are part of the real verification boundary and save the user an extra round-trip.

## Learning Log (Vitácora)

- `docs/learning-log.md` is a human-readable "why" log of decisions taken and non-obvious problems solved.
- Read it at the start of non-trivial work so you inherit past reasoning instead of rediscovering it.
- When you resolve a non-obvious bug or take a deliberate decision, append one line: `- [YYYY-MM-DD]: text`.
- It complements deterministic guards (linters, tests, gates); it does NOT replace them. Enforce the rule in code first, then record the *why* here.

## Project-local Skills

| Skill | Trigger |
| --- | --- |
| `app-notification-pipeline` | Adding a toast notification source, notification actions/buttons, or debugging toast visibility |
| `bridge-testing` | Parser, watcher, SQLite, sync, HTTP, event bus tests |
| `bridge-debugging` | Regressions, runtime/test mismatches, boundary bugs |
| `dnd-kit` | Drag-and-drop: sortable/kanban boards with `@dnd-kit/react` + `@dnd-kit/helpers` (React 19/WebView2) |
| `fallow-repo-setup` | Frontend dead-code, duplication, dependency hygiene, complexity, audit and triage work |
| `mutation-tdd` | After a test goes green; any test guarding a conditional, defensive branch, error path, or concurrency |

## References

- `docs/learning-log.md`
- `docs/architecture.md`
- `docs/autoreas-bridge-rfc.md`
- `docs/fallow-usage.md`
- `docs/mutation-testing.md`
- `docs/adr/007-english-code-spanish-boundaries.md`
- `openspec/config.yaml`
- `.atl/skill-registry.md`
