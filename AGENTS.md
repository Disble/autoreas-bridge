# Autoreas Bridge — Agent Instructions

## Project Context

- Repo: `autoreas-bridge`
- Stack: Go + Wails v2 + React/Vite
- Architecture target: Hexagonal / Ports & Adapters with bounded contexts and an in-memory Event Bus
- SDD mode: `hybrid`
- Current source of truth for sync: `animes.dat`
- `pendientes.dat` is out of sync scope unless a future SDD change states otherwise

## Mandatory Workflow

1. Read `docs/sdd-tree.md` and follow the change order unless the user explicitly reprioritizes.
2. Before implementing, read the corresponding artifacts in `openspec/changes/<change>/`.
3. Treat `openspec/specs/` and active change artifacts as the execution contract.
4. Prefer incremental changes with verification after each meaningful step.
5. **Auto-Pilot SDD**: The entire SDD workflow (explore -> propose -> spec -> design -> tasks -> apply -> verify -> archive) MUST run completely automatically and proactively from start to finish. DO NOT stop for user confirmations, reviews, or to ask permission for the next step. Ignore simple reviews and "next step" confirmations aggressively to save the user time. Ask for user input ONLY on hard, unresolvable blockers. If questions arise about preferences or past discussions, search engram memory FIRST; the answer is likely there. Do not interrupt the workflow unless absolutely necessary. Execute the rest of the skills exactly as indicated but with ZERO user intervention.

## Testing Rules

- Load `bridge-testing` before writing, reviewing, or refactoring bridge tests.
- Load `bridge-debugging` when investigating regressions or any mismatch between tests and runtime behavior.
- When writing Go tests, also load `go-testing`.
- When Strict TDD is enabled in `openspec/config.yaml`, follow RED → GREEN → REFACTOR strictly.
- Real fixtures in `resources/autoreas-data/animes.dat` MUST be preferred when validating parser compatibility or legacy schema assumptions.
- Never mutate `resources/autoreas-data/*.dat` in place during tests; copy to temp locations first.

## Pre-commit Gate

- The repo uses `lefthook.yml` as the single pre-commit entrypoint.
- The gate is intentionally **complete**, not partial: formatting, lint, `go vet`, `go test`, coverage, and SDD artifact validation all run before commit.
- Repo-owned validators live in `tools/checkgofmt` and `tools/checksdd`; avoid reintroducing shell-specific orchestration scripts for the gate.
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
