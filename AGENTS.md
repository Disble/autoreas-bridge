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
