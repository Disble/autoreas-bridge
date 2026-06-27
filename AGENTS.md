# Autoreas Bridge — Agent Instructions

## Project Context

- Repo: `autoreas-bridge`
- Stack: Go + Wails v2 + React/Vite
- Architecture target: Hexagonal / Ports & Adapters with bounded contexts and an in-memory Event Bus
- SDD mode: `hybrid`
- Current source of truth for sync: `animes.dat`
- `pendientes.dat` is out of sync scope unless a future SDD change states otherwise

## CRITICAL FRONTEND ARCHITECTURE CONSTRAINTS (DO NOT IGNORE)

1. **Dumb UI Rule**: Files with `.tsx` extensions under `frontend/src/features/` MUST only render JSX using HeroUI React primitives and Tailwind classes. ZERO Wails calls, ZERO `useEffect`, and ZERO business/data transformation logic are allowed in those `.tsx` files.
2. **Hook Anatomy Rule (10 Steps)**: Custom hooks (`use-*.ts`) in the frontend MUST follow this order: Imports -> Signature -> 1. Refs -> 2. State -> 3. Context/3rd Party Hooks -> 4. Queries/Mutations -> 5. Derived State (`useMemo`) -> 6. Callbacks (`useCallback` calling pure helpers) -> 7. Effects -> Return.
3. **Strict Colocation**: Each complex frontend UI module must be an independent folder with `index.ts`, `.tsx`, `use-*.ts`, `*.helpers.ts`, `*.types.ts`, `*.constants.ts`, optional `*.schema.ts`, and colocated `__tests__/`.
   - **ESLint Enforcement**: You are FORBIDDEN from putting `interface`, `type`, root-level `const`, root-level helper functions, or inline Zod schemas in frontend feature `.tsx` or `use-*.ts` files.
   - **Function Export Rule**: Frontend feature `.tsx` and `use-*.ts` files MUST export the main symbol as a named `function`, never a root-level `const` arrow function.
4. **Delivery Layer Rule**: `frontend/src/App.tsx` and any future `frontend/src/app/**` files are composition only. They MUST NOT use React state/effect hooks, MUST NOT call Wails bindings directly, and MUST NOT contain business logic.
5. **Readonly Props Rule**: Every property in any `*Props` interface inside frontend `*.types.ts` files MUST be declared as `readonly`.
6. **Mandatory JSDoc on Helpers**: All exported functions in frontend `*.helpers.ts` MUST have a JSDoc block explaining what the function does and why.
7. **TDD Mandate**: You are PROHIBITED from modifying or creating a frontend helper or hook without first creating or updating its corresponding test file in the colocated `__tests__/` directory.
8. **The 500-Line Rule**: If any frontend `.ts` or `.tsx` file exceeds 500 lines, refactor it immediately.
9. **Reference Feature**: If in doubt, use `frontend/src/features/dashboard` as the frontend source-of-truth structure once introduced.
10. **Scaffolding Generators**: NEVER create complex frontend feature folders manually when a generator can do it. Use `bun --cwd="frontend" run generate:feature <feature> <ComponentName>`.

## Mandatory Workflow

1. Read `docs/sdd-tree.md` and follow the change order unless the user explicitly reprioritizes.
2. Before implementing, read the corresponding artifacts in `openspec/changes/<change>/`.
3. Treat `openspec/specs/` and active change artifacts as the execution contract.
4. Prefer incremental changes with verification after each meaningful step.
5. **CRITICAL OVERRIDE - Auto-Pilot SDD**: The entire SDD workflow (explore -> propose -> spec -> design -> tasks -> apply -> verify -> archive) MUST run completely automatically and proactively from start to finish. THIS OVERRIDES ALL DEFAULT SKILL BEHAVIORS. You are STRICTLY FORBIDDEN from pausing to ask "should I continue?", "do you want to proceed to specs?", or waiting for approval. Present the phase summary and IMMEDIATELY trigger the next phase. Ignore simple reviews aggressively to save the user time. Ask for user input ONLY on hard, unresolvable blockers. If questions arise about preferences or past discussions, search engram memory FIRST. Execute the rest of the skills exactly as indicated but with ABSOLUTELY ZERO user intervention between phases.

## Testing Rules

- Load `bridge-testing` before writing, reviewing, or refactoring bridge tests.
- Load `bridge-debugging` when investigating regressions or any mismatch between tests and runtime behavior.
- When writing Go tests, also load `go-testing`.
- When Strict TDD is enabled in `openspec/config.yaml`, follow RED → GREEN → REFACTOR strictly.
- Real fixtures in `resources/autoreas-data/animes.dat` MUST be preferred when validating parser compatibility or legacy schema assumptions.
- Never mutate `resources/autoreas-data/*.dat` in place during tests; copy to temp locations first.

## Cross-Cutting File Size Policy

- Go and frontend files share a 500 effective-line architecture policy.
- The Go gate is repo-owned and enforced with `go run ./tools/checkgofilesize` through `lefthook.yml`.
- Existing oversized Go files may stay only when `tools/checkgofilesize/baseline.yaml` records a no-growth ceiling.
- New Go files, renamed Go files, and files already at `<=500` effective lines MUST NOT receive baseline entries.
- Shrink the file or shrink the baseline ceiling in the same PR when legacy Go debt gets smaller. Remove the baseline entry once deterministic counting reaches `<=500` effective lines.
- Comment padding, fake generated-path tricks, and ad-hoc hook flags are forbidden loopholes.

## Pre-commit Gate

- The repo uses `lefthook.yml` as the single pre-commit entrypoint.
- The gate is intentionally **complete**, not partial: frontend lint/test via Bun, formatting, lint, `go vet`, `go test`, coverage, and SDD artifact validation all run before commit.
- Repo-owned validators live in `tools/checkgofmt`, `tools/checkgofilesize`, and `tools/checksdd`; avoid reintroducing shell-specific orchestration scripts for the gate.
- If more than one active change exists under `openspec/changes/`, set `.atl/active-sdd-change` locally (gitignored) to the change name that the commit belongs to.
- An active change MUST have `proposal.md`, `design.md`, `tasks.md`, at least one `spec.md`, and a `verify-report.md` whose verdict is `PASS` or `PASS WITH WARNINGS`.

## Boundary Truths

- GREEN is provisional when the bug lives at the filesystem, SQLite, Windows, or legacy-data boundary.
- Real behavior beats permissive mocks.
- `animes.dat` is append-only legacy data; effective state must be reasoned by `_id`, not by naive line diffs.
- `activo=false` is not a tombstone.
- Direct file watch on `animes.dat` is not trustworthy for Windows atomic replace flows; watch the parent directory.

## Delegation and Verification Guardrails

- If docs, specs, or archived changes conflict with the code, treat the **codebase** as the runtime truth, document the drift, and only then plan the fix.
- When delegating bugfix or apply work to sub-agents, prompts MUST include the exact reproduction steps/commands when known.
- Those prompts MUST include both acceptance examples and rejection/negative examples; do not describe only the happy path.
- Those prompts MUST name forbidden outputs or behaviors explicitly when the bug involves false positives, misleading fallbacks, or malformed UX.
- If the user explicitly asks the orchestrator to perform a repo-doc or instruction-file update itself, do not delegate that file edit to a sub-agent.
- Verification is a special case: the orchestrating agent MUST perform the final verification itself and MUST NOT delegate the verify phase to a sub-agent. Other phases may still use sub-agents when appropriate.
- After verify passes, the orchestrating agent MUST create the commit before reporting verify as fully complete. The commit's own hooks/validations are part of the real verification boundary and save the user an extra round-trip.

## Project-local Skills

| Skill | Trigger |
| --- | --- |
| `bridge-testing` | Parser, watcher, SQLite, sync, HTTP, event bus tests |
| `bridge-debugging` | Regressions, runtime/test mismatches, boundary bugs |

## References

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `docs/autoreas-bridge-design-doc.md`
- `openspec/config.yaml`
- `.atl/skill-registry.md`
