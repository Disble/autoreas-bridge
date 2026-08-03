# Postmortem: "Fallow reports too many unused files"

**Date:** 2026-08-03
**Repo:** `autoreas-bridge` (Wails desktop app; React + TypeScript frontend)
**Audience:** other teams running Fallow, or any dead-code / reachability linter
**Outcome:** 48 findings → 12. Nothing was suppressed.

This is written for teams outside this project. The specifics are TypeScript
barrel files, but the failure mode is generic: **a linter reports a large,
uniform category of findings, and the team's first instinct is to silence the
category.**

---

## 1. What happened

A routine `fallow dead-code` run reported **48 issues, 44 of them "unused
files."** Roughly 41 of those 44 were `index.ts` barrel files — one per UI
module, a structure our own written conventions required.

The obvious reading was "Fallow doesn't understand our architecture." The
obvious fix was three lines:

```jsonc
// .fallowrc.json
{ "ignorePatterns": ["src/**/index.ts"] }
```

That would have made the report green in under a minute. **It would also have
been wrong.** The barrels really were unused. Fallow was reporting a true
fact about the codebase, and the noise was ours, not the tool's.

## 2. What was actually true

We measured the import graph directly instead of arguing with the tool: every
`import` / `export … from` specifier in 568 source files, resolved against the
filesystem to classify each target as a barrel or a concrete file.

- **40 of 67 barrels (59.7%) had zero production importers.**
- Only 4 barrels were used consistently — imported by 3+ production files and
  rarely bypassed.
- One module's barrel had nine importers, **all of them test files**, while
  eleven production files imported the concrete path instead. Tests and
  production disagreed on the module's entry point.

The barrels were not a deliberate architecture being misread by a linter. They
were **manufactured**: a scaffolding script emitted one for every new module,
and a written convention required it. Nothing enforced that anyone *use* them.
The dead count grew on its own, every time someone ran the generator.

Suppressing the rule would have hidden a category that was still growing.

## 3. The measurement traps

Three ways we got the wrong answer before we got the right one. Each is easy
to repeat.

### Trap 1 — counting raw import statements

The first pass concluded "89% of imports bypass the barrel." That number was
wrong, and it was wrong in the direction that made deletion look obvious.

Of 1,188 relative imports:

| Import class | Count | Was a barrel ever an option? |
|---|---|---|
| Intra-module colocation (a module importing its own helpers/types) | 620 | No — you never route your own folder through your own barrel |
| Cross-module into a module with no barrel | 243 | No — nothing to route through |
| **Cross-module into a module that has one** | **325** | **Yes — the only real decision set** |

The honest split of those 325 is **38.2% barrel / 61.8% concrete**. Still a
majority for concrete, but a normal margin rather than a landslide — and that
difference matters when the conclusion is "delete 67 files."

**Lesson:** before computing a ratio, prove the denominator only contains cases
where the choice was actually available.

### Trap 2 — path-suffix regex on a codebase that names modules after folders

This repo colocates `season-store/season-store.ts`, so:

```
'../../shared/store/season-store'                <- barrel (directory import)
'../../shared/store/season-store/season-store'   <- concrete file
```

A grep like `from '[^']*/season-store'` matches **both**. It produced two
confidently-stated wrong conclusions before the discrepancy with the
filesystem-resolution pass exposed it.

**Lesson:** "which module does this import actually resolve to" is a
resolution question, not a text-matching question. Try `base + '.ts'`,
`base + '.tsx'`, then `base + '/index.ts'`, and let the filesystem answer.

### Trap 3 — trusting a caller count without looking at the caller

A code-graph query reported one of the dead routes as having "1 caller," which
reads as *used*. That caller was **the component's own colocated test file**.

**Lesson:** a symbol kept alive solely by the test written for it is still dead
production code. When a caller count is low, look at *who*, not just *how many*.

### A note on picking the right tool

We also reached for a symbol-graph tool (CodeGraph) to audit brand strings and
import styles. It indexes **symbols** — functions, types, call edges — so it
correctly returned unrelated structures and no answer to either question.
String literals and import *style* are not nodes in a symbol graph. That is not
a tool defect; it is a category error by the operator. Match the question to
the index: symbol graph for "who calls this," ripgrep for literals,
filesystem resolution for "what does this specifier resolve to."

## 4. The half-measure we nearly shipped

Our first recommendation was: delete the 40 dead barrels, **keep the 4 that
earn their keep.**

The reviewer rejected it, correctly. Keeping barrels in `shared/` while
`features/` goes concrete is not a decision — it is the original inconsistency
with a smaller headcount, and every developer still has to check whether a
given module has a door. **A rule that holds in one directory and not the next
is two rules**, and two rules is precisely the state that produced a 59% dead
rate in the first place.

The report had literally contained the sentence *"half-applied is the one
option that costs you both ways"* one section above the half-applied
recommendation. Consistency is easy to preach and easy to violate in the same
document.

## 5. How the decision got made

We priced both coherent end states rather than debating taste:

| | Every module concrete | Every module behind a barrel |
|---|---|---|
| Imports to rewrite | **124** (45 prod / 79 test) | 201 (all production) |
| Files created | 0 | one per module lacking one |
| Files deleted | 67 | 0 |
| Holds without enforcement? | **Yes** — a deleted file cannot be imported | No — needs a permanent no-deep-import rule |
| Fights existing habit? | No, 62% already do it | Yes, on all 201 |

The deciding row is *enforcement*, not cost. Going concrete is
**self-enforcing**: once the file is gone there is no door to skip and no rule
to remember. Going all-barrel would require a lint rule holding back 201
existing imports and every future one — the same enforcement gap that created
the mess.

Full rationale: [`docs/adr/011-no-barrel-files.md`](adr/011-no-barrel-files.md).

## 6. What we changed

1. **Stopped the factory first.** The scaffolding generator no longer emits a
   barrel, and its test asserts the file is absent. Deleting 67 files without
   this would have bought a few months.
2. **Rewrote 124 imports and deleted all 67 barrels.** The typechecker was the
   safety net: with no `index.ts` present, every missed specifier became a
   compile error instead of a silent runtime failure.
3. **Added two guards, because one was not enough.**
   - ESLint rejects `**/index` specifiers.
   - A filesystem check (`check:no-barrels`) runs in the pre-commit hook.

   ESLint alone cannot hold this line: under `moduleResolution: "bundler"`, a
   re-created `index.ts` plus a directory import resolves cleanly and **no lint
   rule can see it**. Only a filesystem check catches a reintroduced barrel.
4. **Wrote the ADR** with the measurements, the rejected alternative, and the
   trade-off accepted — so the next person who wonders "why no barrels here?"
   gets the numbers rather than folklore.

## 7. Result

| | Before | After |
|---|---|---|
| Fallow issues | 48 | **12** |
| Unused files | 44 | **8** |
| `ignorePatterns` entries added | — | **0** |

The 8 remaining unused files are genuine: four unimported Zod schemas, two
placeholder `Record<string, never>` props types, and two Vitest config entry
points. The report is now short enough to read, so the next real finding will
be noticed instead of buried.

One of those survivors is worth flagging as its own lesson: four Zod schemas
that validate runtime payloads are imported by nothing. That is not a cleanup
question, it is a correctness question — runtime data is reaching view models
unvalidated. **It had been invisible for months underneath 41 barrel
findings.** Noise does not just annoy; it conceals.

## 8. Transferable rules

1. **A large uniform finding category is a signal about your codebase, not
   about your linter.** Investigate before suppressing.
2. **Suppression is the last option, not the first.** Fix the code, or change
   the convention that generates the finding. `ignorePatterns` should be
   reserved for things the tool genuinely cannot know.
3. **Never let scaffolding manufacture what a linter then flags.** If a
   generator emits it and nothing consumes it, the generator is the bug.
4. **Prove your denominator** before quoting a ratio.
5. **Prefer resolution over text matching** for any "what does this refer to"
   question.
6. **Look at *who* the caller is,** not just how many there are. Tests keeping
   production code alive is still dead code.
7. **Prefer self-enforcing states.** A convention that survives only through
   vigilance will decay; one enforced by the absence of a file will not.
8. **Half-applying a convention costs more than either extreme.** If a rule
   cannot hold everywhere, it is two rules — decide which one you want.
9. **When a guard cannot see the failure, add a guard that can.** Deterministic
   filesystem checks beat lint rules for "this file must not exist."

## 9. Related

- [`docs/adr/011-no-barrel-files.md`](adr/011-no-barrel-files.md) — the decision
- [`docs/fallow-usage.md`](fallow-usage.md) — how Fallow is run in this repo
- [`docs/learning-log.md`](learning-log.md) — running log of non-obvious calls
