# ADR 011: No Barrel Files — Modules Are Imported by Concrete Path

## Status
Accepted (2026-08-02)

## Context
Every complex frontend module carried an `index.ts` barrel, required by the
"Strict Colocation" constraint (`AGENTS.md` / `CLAUDE.md` frontend rule #3)
and emitted automatically by `frontend/scripts/generate-feature.js` for every
module it scaffolds.

A Fallow `dead-code` run reported 44 unused files, of which ~41 were these
barrels. Rather than suppress the rule, the import graph was measured
directly: every `import`/`export … from` specifier in the 568 `.ts`/`.tsx`
files under `frontend/src`, resolved against the filesystem to classify each
target as a barrel or a concrete file.

Counting raw import statements is misleading. Of 1,188 relative imports:

- 620 are intra-module colocation (a module importing its own `.helpers`,
  `.types`, `.constants`) — a barrel was never an option.
- 243 target modules that have no barrel at all.
- **325 are genuine barrel-vs-concrete decisions.**

Of those 325 real decisions: **124 (38.2%) went through the barrel, 201
(61.8%) reached past it** to the concrete file.

Further findings:

- **40 of 67 barrels (59.7%) had zero production (non-test) importers.**
- Only 4 were used consistently — at least three production importers *and*
  bypassed less often than imported.
- Adoption was uneven by area: `app/` 100%, `infrastructure/` 80%,
  `shared/` 44%, `features/` 28%. `infrastructure/` combined 80% adoption
  with 92 bypasses, the most of any area — high adoption plus high bypass
  means there was no convention, only per-file habit.
- `shared/store/season-store`'s barrel had nine importers, **all of them test
  files**, while eleven production files imported
  `season-store/season-store` directly. Tests and production disagreed on the
  module's entry point.

The barrels were not chosen per module; they were manufactured by the
generator and mandated by rule #3, so the dead count grew on its own.

## Decision
**One convention for the whole tree: import modules by concrete path. No
`index.ts` barrels anywhere under `frontend/src`.**

An earlier draft of this analysis proposed keeping the four barrels that were
"earning their keep" and deleting the other 40. That was rejected: a rule
that holds in `shared/` but not in `features/` is two rules, and leaves every
developer checking whether a given module has a door. It reproduces the
inconsistency that caused the 59.7% dead rate in the first place.

Concrete was chosen over the opposite single convention (barrels everywhere)
on two grounds:

| | Every module concrete | Every module behind a barrel |
|---|---|---|
| Imports to rewrite | 124 (45 prod / 79 test) | 201 (all production) |
| Files created | 0 | one per module lacking one |
| Files deleted | 67 | 0 |
| Holds without enforcement? | Yes — a deleted file cannot be imported | No — needs a permanent no-deep-import rule |
| Fights existing habit? | No, 62% already do it | Yes, on all 201 |

The enforcement row decides it. Going concrete is self-enforcing: once
`index.ts` is gone there is no door to skip. Going all-barrel would need a
lint rule holding back 201 existing imports and every future one — the same
enforcement gap that produced the current state.

## Consequences
- `generate-feature.js` no longer emits `index.ts`; its test asserts the file
  is absent.
- Rule #3 in `AGENTS.md` and `CLAUDE.md` drops `index.ts` from the required
  colocation set.
- 124 barrel imports are rewritten to concrete paths and all 67 barrels are
  deleted. 48 barrels re-export a single module (a 1:1 path swap); 19
  aggregate two to four sources, so one import line splits into several.
- `eslint.config.js` restricts `/index` specifiers at `error`. The repo had
  zero explicit `/index` specifiers, so the rule shipped at `error`
  immediately. `dlinter/folder-ownership` is disabled in the same block,
  because that rule requires the `index.ts` entrypoints this ADR removes.
- ~~`frontend/scripts/check-no-barrels.mjs` runs as `check:no-barrels` and is
  wired into the `pre-commit` gate in `lefthook.yml`.~~ **Withdrawn
  2026-08-11 — see "Enforcement status" below. This ADR is now a convention,
  not a guarded rule.**
- Fallow's `unused-file` findings become real signal instead of ~41 false
  positives; no `ignorePatterns` entry is needed. Measured after the
  migration: **48 issues → 12**, and 44 unused files → 8. The 8 that remain
  are genuine candidates (four unimported zod schemas, two placeholder
  `Record<string, never>` props types, two Vitest config entry points).

## Trade-off accepted
Barrels buy real decoupling: a module can rearrange its internal files
without touching any caller. This codebase was not collecting that benefit —
62% of callers already reached past the barrel, pinning the layout anyway.

If that decoupling is wanted later, reintroduce it deliberately at
`infrastructure/`, the one area with a genuine seam between the app and the
Wails bindings, with the lint rule in place from day one — never as a
scaffold default applied to every module.

## Enforcement status — 2026-08-11

**This ADR has no deterministic guard. It is a convention.**

`frontend/scripts/check-no-barrels.mjs` was deleted during the `dharness`
harness adoption, along with its `check:no-barrels` script and the
`frontend-no-barrels` pre-commit job. What remains is `no-restricted-imports`
on `**/index` in `eslint.config.js`, which bans *importing* through a barrel
but does not ban the file from existing.

The replacement is not equivalent, and the difference was measured before the
script was removed:

| | `check-no-barrels.mjs` (deleted) | `dharness/pure-index-barrel` |
|---|---|---|
| Forbids | that an `index.ts` **exists** at all | only *impure* barrels — local declarations, imports, side effects |
| A pure re-export barrel | **fails** | **passes** |
| Scope | all of `src/`, every commit | staged changes only |

So a re-created `index.ts` that does nothing but re-export siblings — exactly
the file this ADR removed 67 of — now passes every automated check in the
repo. A barrel already sitting in the tree is never re-evaluated at all.

Restoring the guard means a rule that forbids the file rather than its
contents. That rule belongs in `Disble/dharness-eslint-plugin`, which is
outside this repository. Until it exists, this ADR is enforced by review
alone, and `docs/learning-log.md` records what that costs.

One correction to the deleted script's own header, so the argument is not
repeated in the wrong form: it claimed "ESLint cannot catch a barrel that
nothing imports yet". That reasoning is wrong — ESLint lints by glob, not by
import graph, so it does see the file. The script was still necessary, for the
other reason: no available rule *fails* a pure barrel.
