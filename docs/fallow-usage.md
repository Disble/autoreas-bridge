# Fallow in `autoreas-bridge`

This project uses **Fallow** as the frontend static-analysis layer for dead code, dependency hygiene, duplication, and architecture-adjacent cleanup signals.

## Quick path

1. Install frontend dependencies with `bun --cwd="frontend" install`.
2. Run the changed-code gate with `bun --cwd="frontend" run fallow audit --quiet`.
3. Read or tune `C:/Users/User/.codex/worktrees/dbde/autoreas-bridge/frontend/.fallowrc.json` only when repo truth requires it.
4. Treat findings as triage input first; do **not** suppress or delete code blindly.

## What is enforced here

| Area | Project decision |
|---|---|
| Scope | Fallow is configured only under `frontend/` |
| Package manager | Use Bun commands from the repo root with `--cwd="frontend"` |
| Gate entrypoint | `lefthook.yml` runs `bun --cwd="frontend" run fallow audit --quiet` |
| Config file | `frontend/.fallowrc.json` (JSONC, comments allowed) |
| Manual entry points | `src/index.*`, `src/main.*`, and `src/test/setup.ts` |
| Generated ignore | `wailsjs/**` is ignored |
| Duplication mode | `semantic` |
| Duplication threshold | `3` |
| Minimum duplicate occurrences | `3` |
| Blocking rules | `boundary-violation`, `circular-dependencies`, `duplicate-exports`, `unlisted-dependencies`, `unresolved-imports`, `unused-dependencies`, `unused-files`, `unused-exports`, `unused-types` |

## Daily commands

### Run the pre-commit-equivalent Fallow check

```bash
bun --cwd="frontend" run fallow audit --quiet
```

Use this when validating changed frontend code before commit.

### Inspect dead code

```bash
bun --cwd="frontend" run fallow dead-code --format json --quiet
```

### Inspect duplication with the repo policy

```bash
bun --cwd="frontend" run fallow dupes --format json --quiet --mode semantic
```

### Inspect health / complexity

```bash
bun --cwd="frontend" run fallow health --format json --quiet
```

### Inspect the active config

```bash
bun --cwd="frontend" run fallow config --path
```

## Triage rules for this repo

- **Code wins.** If Fallow and the runtime disagree, verify the real code path before changing config.
- **Do not delete barrels blindly.** In this repo, several barrel findings can be caused by deep imports bypassing the intended public path.
- **Do not suppress before understanding.** Prefer fixing imports, ownership, or structure before adding ignores.
- **Treat `wailsjs/**` as generated bridge code.** Do not widen ignores casually.
- **Use Fallow as analysis, not as a replacement for ESLint, TypeScript, or tests.**

## Generated artifacts

Ad-hoc inspection commands may produce local JSON files such as:

- `frontend/fallow-dead-code.json`
- `frontend/fallow-list.json`
- `frontend/fallow-schema.json`

These are **scratch outputs**, not project source of truth. Do not commit them unless a future change explicitly introduces a tracked reporting workflow.

## Related files

- `frontend/.fallowrc.json`
- `frontend/package.json`
- `lefthook.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `.atl/skill-registry.md`
