# Fallow in `autoreas-bridge`

This project uses **Fallow** as the frontend static-analysis layer for dead code, dependency hygiene, duplication, and architecture-adjacent cleanup signals.

## Quick path

1. Install frontend dependencies with `bun --cwd="frontend" install`.
2. Run the changed-code gate with `bun --cwd="frontend" run fallow audit --quiet`.
3. Read or tune `frontend/.fallowrc.json` only when repo truth requires it. Architecture boundaries are the exception: they live in `.dharness/fallow.jsonc` and arrive by `extends`.
4. Treat findings as triage input first; do **not** suppress or delete code blindly.

## What is enforced here

| Area | Project decision |
|---|---|
| Scope | Fallow is configured only under `frontend/` |
| Package manager | Use Bun commands from the repo root with `--cwd="frontend"` |
| Gate entrypoint | `lefthook.yml` runs `bun --cwd="frontend" run fallow audit --quiet` |
| Config file | `frontend/.fallowrc.json` (JSONC, comments allowed) |
| Architecture boundaries | Declared in `.dharness/fallow.jsonc`, pulled in with `"extends"` |
| Manual entry points | `src/main.*`, `src/test/setup.ts`, `scripts/__tests__/check-file-size-warnings.test.mjs` (an ESM script test outside `src`, which Fallow does not infer as a test root), and `vitest.dlinter-mutation.mts` (named as a string in `stryker.dlinter.json` → `vitest.configFile`, so the import graph cannot see it) |
| Generated ignore | `wailsjs/**` is ignored |
| Ignored dependency | `eslint` — imported only by `scripts/check-file-size-warnings.mjs`, never by shipped runtime code |
| Duplication mode | `semantic` |
| Minimum duplicate occurrences | `3` — pair-only clones stay hidden; lower to `2` to see every pair |
| Duplication baseline | `audit` reads `.fallow/baselines/dupes.json` |
| Blocking rules | `boundary-violation`, `circular-dependencies`, `duplicate-exports`, `unlisted-dependencies`, `unresolved-imports`, `unused-dependencies`, `unused-files`, `unused-exports`, `unused-types` — all nine are already fallow's defaults, and the config restates them only to pin them against an upstream default change |

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

### Inspect the declared architecture

```bash
bun --cwd="frontend" run fallow list --boundaries
bun --cwd="frontend" run fallow dead-code --boundary-violations
```

The first prints every zone with the number of files it matched. **A zone matching zero files is a mistake, not a style choice** — it means a glob no longer fits the tree. The second prints what the declaration costs today.

## Triage rules for this repo

- **Code wins.** If Fallow and the runtime disagree, verify the real code path before changing config.
- **There are no barrels here — by convention, not by guard.** ADR-011 removed every `index.ts` barrel, so any Fallow finding that looks like a barrel problem is something else. The filesystem guard that kept them out was withdrawn on 2026-08-11 (see "Enforcement status" in `docs/adr/011-no-barrel-files.md`): a pure re-export `index.ts` now passes every automated check, so a Fallow run is one of the few places a reintroduced barrel would surface at all. Config written for barrels rots invisibly: three keys survived the original removal pointing at `src/**/index.ts`, a pattern that now matches zero files, until the 2026-08-10 audit deleted them.
- **Do not suppress before understanding.** Prefer fixing imports, ownership, or structure before adding ignores.
- **Boundary violations that already exist do not block.** The gate fails only on crossings a change introduces, which is what lets an architecture be declared on a tree that does not fully obey it yet. See the comment block in `.dharness/fallow.jsonc` for the 22 known ones and why each is left standing.
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
