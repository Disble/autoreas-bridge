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
6. **Mandatory JSDoc, everywhere**: ALL frontend declarations MUST carry a JSDoc block explaining what they do and why — not only exported functions, and not only `*.helpers.ts`. Private functions, top-of-file variables, and test-file declarations are included. Enforced by `dharness/require-jsdoc` and `dharness/require-variable-jsdoc` through the dharness layer in `frontend/eslint.config.js`. The wording here used to say "all exported functions in frontend `*.helpers.ts`", which was always narrower than the intent. Because the gate lints `{staged_files}`, adoption is incremental: a file owes its JSDoc the next time it is touched.
7. **TDD Mandate**: You are PROHIBITED from modifying or creating a frontend helper or hook without first creating or updating its corresponding test file in the colocated `__tests__/` directory.
8. **The 500-Line Rule**: If any frontend `.ts` or `.tsx` file exceeds 500 lines, refactor it immediately.
9. **Reference Feature**: If in doubt, use `frontend/src/features/dashboard` as the frontend source-of-truth structure once introduced.
10. **Scaffolding Generators**: NEVER create complex frontend feature folders manually when a generator can do it. Use `bun --cwd="frontend" run generate:feature <feature> <ComponentName>`.
11. **Drag & Drop Rule**: Load the `dnd-kit` skill for any drag-and-drop (sortable, kanban/multi-column). Use the new `@dnd-kit/react` + `@dnd-kit/helpers` (React 19 + StrictMode safe, pointer-based for Wails WebView2). NEVER legacy `@dnd-kit/core`/`sortable`/`utilities`, NEVER native HTML5 DnD, and NEVER remove `React.StrictMode` to make dragging work.
12. **Long List Rule**: Any rail that can render 100+ rows MUST load progressively — an initial batch that grows on scroll-near-bottom — never a full `.map()` of the collection into a scroll container. Use `useProgressiveListWindow` (`frontend/src/shared/hooks/`) for **static** lists (count changes only from filter/search/one-shot fetch) and render `items.slice(0, visibleCount)`. For **live** lists (an event stream pushes items into a store) do NOT use that hook — its render-phase reset would snap the user back to the first batch on every event; keep the panel's own reconciliation and reuse only `isNearListBottom` from `shared/helpers/progressive-list.helpers.ts`. There is deliberately no lint rule (the trigger is not statically decidable), so every such rail MUST ship a DOM-count test asserting only one batch renders — see `AnimeEditorWorkspace.windowing.test.tsx`. Full rationale and rejected alternatives in `docs/adr/012-progressive-list-rendering.md`.
13. **Shared Dumb Components Rule**: Reusable presentation-only components live in `frontend/src/shared/ui/` — e.g. `LabeledTextField`, `LabeledSelect`, `LabeledCheckbox`, `PathPickerField`, `AnimeCoverPlaceholder`. PREFER composing these over hand-writing another raw `Label`/`Input`/`Select` block. When a Label/Input/Select pattern repeats (3+ instances), EXTRACT a new generic `shared/ui` component (readonly props in a colocated `*.types.ts`, JSDoc, colocated test) — this is the sanctioned way to cut JSX duplication and render complexity that the Fallow gate flags.

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
- **Load `mutation-tdd` and mutation-check every guard before refactoring.** A test that still passes with its guard deleted proves nothing, and neither `go test` nor the coverage percentage will tell you. This is mandatory for concurrency tests, defensive branches (nil guards, clamps, `if err == nil { return }`), error and timeout paths, and any test written to close a coverage gap.
- **On Go, MUTATE means running `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./<owning-package>/"`.** Naming the owning package is not optional: ditto runs the test command once per mutant, sequentially, so the default `./...` multiplies the whole suite by your mutant count. Keep `-json` — without it a mutant that never compiled scores as a KILL. Stage the change and run it; it mutates only the lines you touched and reports every surviving mutant, each with a `path:line:col` address. Hand-mutation is the fallback for one guard mid-edit, not the step itself — it mutates where you were already looking, so it confirms a suspicion rather than surveying the change. On 2026-08-09 four hand-picked mutants all died while the wrapper found a test asserting against the very constant it claimed to pin. See `docs/postmortems/postmortem-silent-no-ops.md`.
- **Before concluding a hand-mutation was killed, prove it applied.** A failed edit and a perfectly-covered guard print the same thing. `sd` is NOT installed here despite what global instructions say — use `perl -0pi -e '<s///>' <file>` and follow it with `git diff --quiet -- <file> && echo "!! MUTATION DID NOT APPLY"`.
- **Mutation coverage differs by surface — do not assume one answer for the repo.**
  - **Frontend: automated.** `lefthook.yml` runs the `test:mutation:staged` job with `root: frontend` (a `dlinter:owned` job). The runner is Stryker via `frontend/stryker.dlinter.json`, driven by `frontend/scripts/dlinter-mutation-staged.mjs`, and `frontend/package.json` also exposes `test:mutation` and `test:mutation:guard` (the latter tests the staged runner itself). The staged job covers only the added lines of staged frontend files; everything else exits zero with no mutation coverage.
  - **Go: a runner exists and is the MUTATE step; no gate is wired.** `ditto staged` mutates the staged production Go files, scoped to the lines the staged diff touched, against a copy of the index. Do not claim the Go side has no mutation tooling. It is invoked by hand rather than by a hook because it recompiles and re-runs the named package's suite per mutant, on top of an already ~90s gate. Add `--dry` to see the computed scope without paying for a run.
  - Line scoping is what makes it usable as a routine step — before it, the same change cost 89 mutants and ~6 minutes because whole files were mutated. A scope it cannot derive does fall OPEN to whole-file mutation, but that is NOT the usual cause of a slow run: **the usual cause is an unscoped `--test-command`.** ditto prints nothing per mutant without `-verbose`, so a healthy run and a hang look identical. Check `--dry` for the scope and the `--test-command` for the cost before concluding the tool is broken — on 2026-08-30 a bare `ditto staged` was killed twice at ten minutes and escalated as a tool defect; it was the default `./...`.
  - See `docs/mutation-testing.md`.
- Branches the scheduler cannot reach (a raced pointer swap, `setErr(nil)`) need direct invocation of the unexported function from an in-package test. A stress loop that never reaches the branch passes while proving nothing — this has already happened twice in this repo.
- Prefer real stored-shape validation for the `internal/anime/store` codec: use the synthetic and single-line stored-shape fixtures under `internal/anime/store/testdata` (cloned from a real database row before `resources/autoreas-data/animes.dat` was deleted in SDD-55) when validating codec round-trips or stored-shape assumptions. Never mutate fixtures in place during tests; copy to temp locations first.

## Cross-Cutting File Size Policy

- Go and frontend files share a warning threshold at 400 effective lines and a hard failure ceiling above 500 effective lines.
- The Go gate is repo-owned and enforced with `go run ./tools/checkgofilesize` through `lefthook.yml`.
- The frontend hard failure path at `>500` is ESLint `max-lines` in `frontend/eslint.config.js`, reached through the `frontend-lint` job, and it must stay. `dharness/max-file-lines` checks the same 500 ceiling through the layer `dharness sync` splices into that same config; `dharness sync`'s "residue" note only means those plugin rules do not fire under react-doctor's `--staged` pass, not that they are off. The 400-line warning left the gate on 2026-08-11: `bun --cwd="frontend" run filesize:warning` is manual and whole-tree, and nothing runs it automatically.
- Existing oversized Go files may stay only when `tools/checkgofilesize/baseline.yaml` records a no-growth ceiling.
- `tools/checkgofilesize/baseline.yaml` is expected to be empty (`files: []`). It exists only as structural scaffolding for any temporary approved debt that must not grow; any entry MUST be removed as soon as the file reaches `<=500` effective lines.
- New Go files, renamed Go files, and files already at `<=500` effective lines MUST NOT receive baseline entries.
- Zero permanent `>500` debt is the enforced end state. Treat any entry above 500 as an active exception that must be eliminated, not accepted.
- Shrink the file or shrink the baseline ceiling in the same PR when debt gets smaller. Remove the baseline entry once deterministic counting reaches `<=500` effective lines.
- Comment padding, fake generated-path tricks, and ad-hoc hook flags are forbidden loopholes.
- For implementation details, see `docs/file-size-policy.md`.

## Pre-commit Gate

- The repo uses `lefthook.yml` as the single pre-commit entrypoint.
- **The gate is SLOW by design — budget for it.** A full pre-commit run takes ~90 seconds and can exceed 2 minutes on a cold cache (golangci-lint, `go vet`/coverage, frontend typecheck/lint/test/Fallow, filesize). Jobs are declared `parallel: true`, so their output interleaves — on a failure, read the job name rather than assuming the last lines belong to it. When you run `git commit`, use a generous command timeout (≥ 5 minutes / 300000 ms) so the commit is not killed mid-hook. A killed commit leaves changes staged but unrecorded — re-run `git commit` (do not `--no-verify`) to complete it.
- The gate is intentionally **complete**, not partial: frontend Fallow audit + lint/test via Bun, formatting, lint, `go vet`, `go test`, coverage, and SDD artifact validation all run before commit.
- Repo-owned validators live in `tools/checkgofmt`, `tools/checkgofilesize`, `tools/checksdd`, and `tools/genicons`; avoid reintroducing shell-specific orchestration scripts for the gate.
- **App icons are generated, never hand-edited.** `build/appicon.png` is the only master; `go run ./tools/genicons` rewrites `build/windows/icon.ico` and `internal/tray/tray-icon.ico` from it, and the `app-icons` job runs `-check`. See `docs/app-icons.md`.
- **A merge commit does not run the pre-commit gate — `pre-merge-commit` does, and it is a different gate.** Git never runs `pre-commit` for a merge. `pre-merge-commit` is a hook lefthook supports natively (`lefthook install` syncs it by name and silently ignores an unrecognised one; note `lefthook validate` does NOT check hook names and reports "All good" for a hook that does not exist). It runs the same checks **whole-tree instead of globbed**, because a merge produces a tree rather than a diff — a `glob:` there compares against the merge's own empty file list and skips. `frontend-lint` and `test:mutation:staged` are deliberately excluded: both are scoped to the staged set, which a merge does not have. `tools/checkgofilesize/merge_gate_test.go` pins the job list so it cannot quietly drift from pre-commit. A fast-forward merge writes no commit and runs no hook, which is correct: its commits already passed pre-commit.
- If more than one active change exists under `openspec/changes/`, set `.atl/active-sdd-change` locally (gitignored) to the change name that the commit belongs to.
- An active change MUST have `proposal.md`, `design.md`, `tasks.md`, at least one `spec.md`, and a `verify-report.md` whose verdict is `PASS` or `PASS WITH WARNINGS`.

## Branch Model

- **`dev` carries development. `main` carries deployments only.** Adopted 2026-09-01.
- Land work on `dev`. Do NOT commit development directly to `main`.
- A release exists only once `dev` has been merged into `main`, and the tag goes on the `main` commit — never on a `dev` commit.
- This is **enforced, not conventional**: the `guard` job in `.github/workflows/release.yml` runs `git merge-base --is-ancestor "$GITHUB_SHA" origin/main` and fails a tag build whose commit is not on `main`, before a single build minute is spent. It runs on every trigger with the check behind a step-level `if`, because a job-level `if` would skip it on `workflow_dispatch` and skip everything that `needs: guard` with it.
- The guard is the ONLY thing enforcing this: no branch is protected on GitHub, and `main` is still the repository's default branch.

## Releasing

- Load `bridge-release` when bumping the version, building the installer, or shipping a build.
- **Every release updates `CHANGELOG.md`.** Promote `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD`, leave a fresh empty `[Unreleased]` above it, and write the entries in user language under Keep a Changelog headings (`Added`/`Changed`/`Fixed`/`Removed`/`Security`, plus `Internal` for non-user-visible work). NEVER paste commit subjects. `wails.json`, the regenerated `wails_tools.nsh`, and `CHANGELOG.md` ship in the SAME commit — a bump without notes is an incomplete release. Wire-affecting releases say so explicitly, since REST/WS has mobile consumers.
- The version lives only in `wails.json` → `info.productVersion`; `build/windows/installer/wails_tools.nsh` is generated by `wails build -nsis` and must never be hand-edited.
- **CI is the default delivery path.** Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`, which builds Windows and Linux and PUBLISHES a GitHub Release. A local `wails build` is a rehearsal for smoke-testing, not a release: it ships nothing.
- CI publishes the Windows **installer**, the Linux `.tar.gz`, and a `SHA256SUMS` file per platform. The portable Windows `.exe` is deliberately NOT published — Bridge is an installed application, and that artifact also carries blank Windows file properties while the installer's are correct.
- **Corrections are patch releases.** Never re-cut, move, or force-push a published tag; anyone who downloaded it keeps a build that no longer matches it.
- Every CI guard exists because its failure is silent: tag vs `wails.json`, the `INFO_PRODUCTVERSION` readback, the `windows && cgo` tray-bindings file list, the `bridgeVersion` ldflags stamp, the CHANGELOG section, and the branch guard. Do not remove one to make a run pass.

## Frontend Static Analysis (Fallow)

- Load `fallow-repo-setup` when auditing frontend dead code, dependency hygiene, duplication, complexity, or changed-code risk.
- Fallow is frontend-scoped in this repo: run it with `bun --cwd="frontend" run fallow ...`.
- The enforced config lives in `frontend/.fallowrc.json`; treat it as repo truth and do not add remote config inheritance.
- `lefthook.yml` runs `bun --cwd="frontend" run fallow audit --quiet` as the pre-commit changed-code gate.
- `wailsjs/**` is generated bridge/runtime code and intentionally ignored by Fallow.
- `frontend/wailsjs/` is **untracked** as of 2026-08-23. Wails regenerates it on every build and wipes the runtime directory outright (`os.RemoveAll` in Wails v2.12's `pkg/commands/build/base.go`), so it was never editable source, and committing it made every regeneration fail `dharness check`: react-doctor scans staged files and offers no path exclusion, so 95 findings landed on generated code — see `docs/reports/dharness-generated-code-exclusion.md`. Fifteen frontend files import from it and the gate typechecks without invoking Wails, so `frontend`'s `postinstall` hook regenerates it; use `bun --cwd="frontend" run generate:bindings` after changing a bound Go method. Note `wails generate module` exits 0 even when it cannot find `wails.json`, which is why the hook verifies the output files rather than the exit code.
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
- GREEN is provisional at the Wails CLI boundary too: the gate never builds the desktop app. `go build`, `vet`, `test` and lint all pass without the Wails CLI ever loading a package, and it loads them through its OWN pinned `golang.org/x/tools` -- so a toolchain upgrade can break `wails dev` and `wails build` while every gate stays green. Measured 2026-08-28: Go 1.27 against wails v2.12.0 failed with `internal error: package "context" without types`, and no binary was produced. Run `wails build` before claiming a toolchain or dependency change works.
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
- When you resolve a non-obvious bug or take a deliberate decision, append one line with the writer:

  ```
  node scripts/log-lesson.mjs "the lesson, in one sentence"
  ```

  It stamps the date, enforces the format, and appends. **Do not edit `docs/learning-log.md` by hand** — the writer exists so the format cannot drift.
- **One line, 300 characters maximum.** The ceiling is measured: across the 82 existing entries the p25 is 278 characters and the median is 498, so three quarters of the log had already drifted past the "one short sentence" rule the file itself declares. If a lesson does not fit, it has not been extracted yet — you are storing the investigation. Put that in an ADR or a postmortem and log the one-line lesson that points at it.
- This is deliberately NOT in `lefthook.yml` and never blocks a commit. A gate that blocks on documentation makes deleting the entry the cheapest way to commit, which destroys the lessons it was meant to protect.
- It complements deterministic guards (linters, tests, gates); it does NOT replace them. Enforce the rule in code first, then record the *why* here.

## Project-local Skills

| Skill | Trigger |
| --- | --- |
| `app-notification-pipeline` | Adding a toast notification source, notification actions/buttons, or debugging toast visibility |
| `bridge-testing` | Parser, watcher, SQLite, sync, HTTP, event bus tests |
| `bridge-debugging` | Regressions, runtime/test mismatches, boundary bugs |
| `dnd-kit` | Drag-and-drop: sortable/kanban boards with `@dnd-kit/react` + `@dnd-kit/helpers` (React 19/WebView2) |
| `fallow-repo-setup` | Frontend dead-code, duplication, dependency hygiene, complexity, audit and triage work |

## References

- `docs/learning-log.md`
- `docs/architecture.md`
- `docs/autoreas-bridge-rfc.md`
- `docs/fallow-usage.md`
- `docs/mutation-testing.md`
- `docs/adr/007-english-code-spanish-boundaries.md`
- `openspec/config.yaml`
- `.atl/skill-registry.md`

<!-- standards:v1.1.0 -->

## Engineering Principles

Twelve rules extracted from four repositories that arrived at the same thesis
independently: **a rule that only exists in prose does not exist.** Each one is
referenced by ID. To depart from one, write `deviates: Pnn — reason` in this
file's repo-owned section; silence is drift, a stated deviation is a decision.

### Governance of the rules themselves

**P01 — Every prose rule needs a machine owner.** If a convention cannot be
expressed as a lint rule, a test, or a gate job, it is a wish. Write the
enforcement first; prose explains the why behind it.

**P02 — Respect upstream triage, and lock it with a drift test.** A bundled
plugin's per-rule severities are its author's judgment. Override named rule IDs
only, each with a recorded reason. Then snapshot the plugin's error-set to a
contract test, so a version bump that re-triages a rule fails loudly instead of
shifting the gate in silence. Blanket-downgrading a ruleset throws away the exact
work the preset exists to do.

**P03 — Thresholds and exclusions carry their evidence inline.** Record the
measurement in the comment beside the number. An unexplained ignore entry is
indistinguishable from a shortcut, and gets deleted or copied for the wrong
reasons.

**P04 — Rank levers by gaming resistance.** Cognitive complexity has no escape by
relocation, so it is a strong lever. File size is defeated by sharding one file
into two, so it is never the headline. Know which rules actually hold.

**P05 — Baselines are debt with an expiry.** A baseline entry is an active
exception that must shrink and disappear. The healthy state of a baseline file is
empty. Treat a permanent entry as a permission slip that was never granted.

### Gates

**P06 — One entrypoint, and its verdict equals the cloud's.** A single hook
config with no shell orchestration around it, running what CI runs. A local
threshold looser than the cloud's makes local green a lie.

**P07 — Prove the gate's failure path.** Stage a deliberately broken file, run the
hook, assert it fails, clean up. A gate nobody has watched fail is unproven.

**P08 — Marker-comment ownership for generated config.** Anything a tool owns sits
behind a marker comment and is re-merged additively. Everything outside the
markers is repo-owned and survives every update.

### Tests

**P09 — Mutate, don't trust coverage.** RED → GREEN → MUTATE → REFACTOR. A test
that passes with its guard deleted proves nothing, and neither the suite nor the
coverage number will tell you. Run a mutation tool over the change rather than
hand-picking mutants: a mutant you choose yourself covers only what you already
suspected, so it confirms rather than surveys. Hand-mutation stays useful for one
guard mid-edit — and there, prove the mutation applied before believing it was
killed. **Tests own behavior scenarios, never mutants** — a suite written one
test per surviving mutant mirrors the implementation instead of the behavior it
exists to protect. Strengthen the scenario that already owns the outcome before
adding a new test. Never assert against the production symbol you are pinning: if
both sides of the comparison can move together, the test has no opinion.

**P10 — State the boundary a guard does not cover.** Name what the check cannot
see, in the place someone will look. A guard whose limits are unstated will be
mistaken for a complete one. This applies to the harness as a whole: raising the
cost of a shortcut is worth shipping, and claiming it is impossible is not.

### Platform and knowledge

**P11 — Generators are platform, not convenience.** Never hand-scaffold what a
generator owns. A generator that emits structure the linter rejects is a platform
defect, never a user error.

**P12 — Keep an append-only why-log.** One dated line per non-obvious lesson,
newest at the bottom, never rewritten. A lesson that does not fit on one line has
not been extracted yet — that is an investigation, and it belongs in an ADR or a
postmortem with a one-line pointer from the log. The log complements deterministic
guards and never replaces them: enforce the rule in code first, record the why
second.

<!-- /standards -->

<!-- standards:ladder:v1.0.0 -->

## Enforcement Ladder

Every control in this repo sits on one of nine rungs. Each has a distinct owner
and a distinct failure mode. When adding a guard, name its rung first — two
guards on the same rung usually means one of them is redundant, and a rung with
nothing on it is where the next defect gets through.

| Rung | Control | Catches | Force |
|---|---|---|---|
| L0 | Agent doctrine — this file | The rule was never known | advisory |
| L1 | Architecture rails — lint rules, import contracts | Layer violations, misplaced declarations | blocking |
| L2 | Graph analysis — dead code, duplication, cycles, deps | Rot the compiler accepts | blocking |
| L3 | Test discipline — RED → GREEN → MUTATE → REFACTOR | Tests that pass with the guard deleted | prompt-driven |
| L4 | Local gate — one hook entrypoint | Everything above, before it enters history | blocking |
| L5 | Gate verification — prove the failure path | A gate that silently stopped enforcing | blocking |
| L6 | Cloud parity — CI, quality gate, drift contracts | Local green that is a lie | blocking |
| L7 | Agent-side gate — tool hook wrapping commit/push | An agent committing around the local gate | blocking |
| L8 | The why-record — ADRs, learning log | Rediscovering a solved problem | human process |

Two rules about the ladder itself:

**Advisory rungs stay advisory.** L0 and L8 carry judgment, and a gate that
blocks on documentation makes deleting the entry the cheapest way to commit —
which destroys the record it was meant to protect. Never promote them.

**L5 is the rung most often missing.** A gate nobody has watched fail is
indistinguishable from no gate at all.

<!-- /standards:ladder -->

<!-- standards:gate:v1.0.0 -->

## Gate Contract

**One entrypoint.** The hook config is the single place the local gate is
declared. No shell orchestration wrapped around it, no second script that runs
"the other checks". A reviewer asking "what blocks a commit here" reads one file.

**The local verdict equals the cloud's.** Any threshold looser locally than in
CI makes local green a lie, and the lie is discovered at the least convenient
moment. When a cloud gate flags something the local gate permits, tighten the
local one.

**The failure path is proven.** Stage a deliberately broken file, run the hook,
assert it fails, clean up. Keep that check runnable. A gate nobody has watched
fail is unproven, and gates fail silently far more often than they fire wrongly.

**The gate is slow by design — budget for it.** Give `git commit` a generous
command timeout so it is never killed mid-hook. A killed commit leaves changes
staged and unrecorded: re-run the commit. Never pass `--no-verify`.

**Suppressions are reviewable sentences.** Every inline suppression names the
specific rule and explains itself in prose. Silent suppression becomes a visible
diff a reviewer can catch.

**Weakening a threshold is a decision, not a fix.** Raising a limit or excluding
a path to make a finding disappear is the cheapest available action and almost
never the right one. If it is right, the reason goes in the config beside the
number.

<!-- /standards:gate -->

<!-- standards:threat:v1.0.0 -->

## What This Harness Does Not Guarantee

Every machine-checked rule here constrains code only while the rule stays in
place. A rule can be satisfied by removing it: widening a threshold, dropping a
linter from the enabled set, adding a suppression, excluding a path. Each is a
one-line change, cheaper than the refactor the rule was trying to force.

**A linter cannot police the config that configures it.** Any meta-check lives in
the same mutable tree, editable by the same actor with the same one-line change.
Shipping a partial mechanism here would imply a guarantee that cannot be made.

What this harness actually buys: defeating it is no longer free or silent. Every
threshold sits in one small reviewable file, and every suppression must name its
rule and explain itself in English. A reviewer checking whether anyone weakened
the cage has a short list of places to look.

The credible controls are external and belong to the repository's settings:
CODEOWNERS on the config files, branch protection requiring review, and a CI
check that fails a pull request when a threshold moves in the permissive
direction without a written justification.

**This raises the cost and visibility of cheating. It does not make cheating
impossible.** State the limit rather than decorating it — a guard whose
boundaries are unstated will be mistaken for a complete one.

<!-- /standards:threat -->

## Standards Coverage and Deviations

What the blocks above add, what was deliberately not landed, and where this repo
departs from a principle.

**Not landed — already covered natively, more specifically.** The Go, TS/React and
hybrid-desktop stack profiles were skipped. This repo is where most of that text
was extracted from, and its own sections carry the real thresholds: the 400/500
effective-line policy, the `depguard` boundary rules with a paragraph of reasoning
each, the Fallow contract, the generator rule, the shared `shared/ui` extraction
rule. A generic restatement would add length without adding instruction, and
length is the scarce resource in this file.

**Not landed — both mutation fragments.** The "Testing Rules" section already
states mutation coverage per surface, with the exact job, runner, config path and
covered scope on the frontend, and the measured reason the Go runner stays out of
the hook while remaining the expected MUTATE step. That is what the fragments
exist to produce.

**Note on the Go mutation surface.** `ditto staged` is installed rather than
vendored (`go install github.com/Disble/ditto/cmd/ditto@latest`, v0.7.0 or
later — below that a mutant that never compiled counts as killed and
inflates the score), is the expected MUTATE step, and is deliberately not
wired into `lefthook.yml` (it re-runs the named package's suite per mutant, on
top of an already ~90s gate). It MUST be invoked with a `--test-command` naming
the owning package; the default `./...` runs the whole repository suite once per
mutant.
Available and unwired is a real third state — do not read the tool's existence as
evidence the gate runs it, and do not read its absence from the hook as evidence
no runner exists, or that running it is optional.

- `deviates: P07 — the gate's failure path is unproven.` `tools/` holds
  `checkgofmt`, `checkgofilesize`, `checkarchitecture`, `checkopenapi` and
  `checksdd`, and nothing that stages a broken file to assert the hook rejects it.
  The sister mobile repo has `scripts/verify-precommit-fail-path.mjs`; this repo
  has no equivalent. The ladder calls L5 the rung most often missing, and it is
  missing here.
- `deviates: P06 — local and cloud verdicts are not comparable.` The only CI
  workflow is `go-lint.yml`, which runs the Go lint profile. The frontend gate,
  the coverage run, the SDD gate and the OpenAPI check exist only locally, so CI
  green proves substantially less than a local commit does.
