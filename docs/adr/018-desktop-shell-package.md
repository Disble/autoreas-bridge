# ADR-018 — The desktop shell lives in `internal/desktop`, not the repository root

**Status:** Accepted
**Date:** 2026-09-02
**Supersedes the root-as-composition-root doctrine in** `ARCHITECTURE.md` (line 130 before this
change) and `docs/architecture.md`.

## Context

The repository root carried **104 `.go` files** — 42 production, 62 test, 17,582 lines, all in
`package main`. The standing explanation was that Wails requires it. It does not.

Wails v2.15.0 requires exactly one thing, visible in `pkg/commands/build/base.go`
(`CompileProject`): it runs a bare `go build` with `cmd.Dir` set to the directory holding
`wails.json`, with **no package argument**. So the `package main` must sit beside `wails.json`. That
is the whole constraint. Go adds a second, independent one: `//go:embed` cannot traverse `../`, so
whatever package embeds `frontend/dist` must contain it.

Both are satisfied by **one file**. The other 103 were there by habit.

Two things in this repository — not Wails — actually held them:

1. `.golangci.yml` → `wails-confined-to-edge` denied `github.com/wailsapp/wails/v2` to every
   `**/internal/**` file, so `App` could not move under `internal/` without amending the rule.
2. `ARCHITECTURE.md` and `docs/architecture.md` encoded "the root is the composition root" as
   doctrine.

The evidence that binding from a non-`main` package works was already in this repo: DTOs in
`internal/api/contracts` have always generated the `contracts` namespace in `models.ts`, and the
frontend imports it in production.

## Decision

Move all 103 non-entry files to **`internal/desktop`** (`package desktop`). The root keeps `main.go`
and nothing else: the `//go:embed`, `var assets`, and `wails.Run(desktop.Options(assets))`.

`internal/desktop` is the composition root's new address. The `wails-confined-to-edge` rule is
**amended, not removed** — it still says "Wails only at the edge", it just names the new edge:

```yaml
files:
  - "**/internal/**"
  - "!**/internal/desktop/**"
```

`domain-purity` and `contracts-are-ports` keep their own explicit Wails denials, so
`internal/anime/domain` and `internal/api/contracts` are unaffected by that exemption.

### Why `internal/desktop` and not `cmd/bridge`

One `git mv`. `wails.json` is untouched, CI is untouched, `wails build` still runs from the root, and
the short package name `desktop` collides with nothing in the module — which matters, because the
binding generator uses the **short** package name as the TypeScript namespace. The zero-`.go`-in-root
variant (the layout of Wails' own `examples/customlayout`) buys exactly one more file and costs a cwd
change in every script and workflow. It is documented in
`docs/reports/plan-migracion-raiz-go-ejecutable.md` §9 and deliberately not taken.

## Consequences

The bound namespace changes from `main` to `desktop`:

| Before | After |
|---|---|
| `frontend/wailsjs/go/main/App` | `frontend/wailsjs/go/desktop/App` |
| `export namespace main` in `models.ts` | `export namespace desktop` |
| `window.go.main.App` | `window.go.desktop.App` |

**The namespace appears in three shapes, and searching only for import paths misses the worst one.**
Besides the 9 import sites and 1 type-namespace alias, the runtime global `window.go.main.App` lived
in 16 files — including `infrastructure/wails-bindings.helpers.ts` (`hasGoBinding`, used by every
adapter) and `observability-log-source.helpers.ts`. `tsc` does not catch it, because the global is
typed in `frontend/src/test/setup.ts` and that declaration still said `main`. Nor does ESLint, nor
Go. **Only the frontend test suite did**, with 37 failures. Had those two files lacked coverage, the
adapters would have degraded silently — a healthy process serving a dead binding surface, the failure
mode `CLAUDE.md` 18b exists for.

When searching for this namespace, search all three shapes:

```bash
grep -rn "wailsjs/go/main\|go?\.main\|\['go'\]\['main'\]\|as wailsMain" frontend/src frontend/scripts
```

### The version stamp

`bridgeVersion` moved with `app_backup.go`, so `-ldflags "-X main.bridgeVersion=…"` stopped
resolving. **Go ignores a `-X` whose symbol does not exist: exit 0, nothing on stderr, the variable
keeps its default.** Every release job now derives the path with `go list` instead of typing it, so a
future move fails the build rather than shipping `"dev"` in silence.

Investigating that turned up a **pre-existing defect unrelated to this move**: the readback both
release workflows used, `go version -m <binary> | grep "bridgeVersion=X"`, matches the `build
-ldflags="…"` line that `go version -m` echoes back — the flag the job itself passed, not the stamped
value. A binary whose runtime reported `dev` passed that check. It happened to protect only because
the path was correct. `go tool nm` cannot replace it either: wails appends `-w -s`, so the shipped
binary has no symbol table. Both workflows now verify against a companion non-stripped build and
assert the `<path>.bridgeVersion.str` symbol, which the linker emits only when `-X` resolved
(measured: 2 symbols when it resolves, 1 when it does not).

### Leaving `package main` makes the exported surface public

`revive`'s `exported` rule does not check a `main` package -- nothing there is a public API. In
`package desktop` it does, and 36 declarations across four files were suddenly an undocumented public
surface: 26 `App` binding methods plus 10 editor DTOs. They now carry doc comments.

This is a consequence worth stating rather than a chore: those 36 declarations were always the
contract the frontend calls. `package main` was hiding that they had no documentation, not making it
acceptable. Note the gate runs **two** golangci-lint profiles (`scripts/lint.ps1 -Profile all`) --
`.golangci.yml` and the custom-built `.golangci.dlinter.yml` that carries revive. A bare
`golangci-lint run ./...` only exercises the first and reports clean.

Touching 24 frontend files also inherited their accumulated `dharness` debt, because the gate lints
`{staged_files}`: 17 mappers gained the JSDoc they always owed, and 7 module-level values took the
same inline `role-file-shape` suppression `download-runtime-source.helpers.ts` already used. That is
incremental adoption working as designed, not collateral damage.

### Committing this from a worktree

`dharness check` cannot run from a git hook inside a worktree. Git sets `GIT_DIR` to
`.git/worktrees/<name>`, and dharness then resolves the frontend root to `frontend/frontend` and
exits 1 in 0.2s. Measured: the same staged set passes standalone
(`lefthook run pre-commit --command dharness` → 20s, green), and in the main checkout an absolute
`GIT_DIR` works while a relative one fails the same way. It is a tool limitation, unrelated to this
change. This commit therefore ran the other 16 gate jobs through `LEFTHOOK_CONFIG` pointing at a copy
of `lefthook.yml` without the `.dharness` extends, with the dharness job verified separately.

### Historical records keep the old paths

Accepted ADRs (009, 010, 016) and everything under `openspec/changes/**` describe the tree as it was
when written and are **not** rewritten. Wherever they name a root-level `app*.go`, that file now
lives at `internal/desktop/`.

### What did not change

Nothing at runtime. No logic, no renamed symbol, no changed signature except `buildAppOptions`, which
gained an `assets embed.FS` parameter and is unexported. Because the 103 files moved together into
one package, every cross-file reference stayed intra-package and **no unexported identifier needed to
be exported**.

Verified before commit: `go build` / `go vet` / `go test ./...` clean, `golangci-lint` 0 issues,
`tsc` clean, 263/263 frontend test files and 2335/2335 tests, `wails build` plus `render:smoke`
passing, and the bound surface **99 → 99 methods, 98 → 98 classes**, byte-identical after normalising
the namespace. The generator emits namespaces alphabetically, so `models.ts` reorders its blocks
(`contracts logger main` → `contracts desktop logger`); compare it order-insensitively or the check
fails on a correct migration.

Full method, measurements and refuted hypotheses: `docs/reports/plan-migracion-raiz-go-ejecutable.md`.

## Phase 2, deliberately not taken here

`internal/desktop` still holds an `App` with ~110 dependency fields, 99 exported and 95 unexported
methods. It is still a god-object; it is merely somewhere it can be split without fighting Wails.
Splitting it is **not** chained to this change: the property that makes this migration safe is that
the bound surface is identical apart from the namespace, and a real API change in the same commit
would make a lost method indistinguishable from an intended one.
