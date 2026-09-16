# Running SDD Work Units Without Rework

> **Status: provisional.** Adopted 2026-09-14 as a trial on SDD-74 WU4–WU6b. It becomes canon
> only if the trial meets the [promotion criteria](#promotion-criteria). Until then, AGENTS.md
> does not reference it.

A work unit's time goes to rework, not to writing code. These rules remove the rework loops and
keep every quality gate: strict TDD, mutation score ≥ 0.80, `lint.ps1 -Profile all`, the file-size
policy, and the 800 changed-line cap.

## Quick path (per work unit)

1. **Budget per file before RED.** Measure comparables with `wc -l`, write a per-file line budget
   into the unit's `tasks.md` header, and hand it to the writer.
2. **Put the lean rules in the writer brief from the start.** See rule 2.
3. **The writer stops at a budget; it never writes first and trims later.**
4. **Freeze the candidate, then verify it once**, running commands one at a time in the
   [verification order](#verification-order).
5. **Run ditto at most twice:** one run, one edit that kills every behavior-changing survivor, and
   one confirming run.
6. **Close the unit** by recording receipts in `apply-progress.md`, then open the next unit.

## Why: measured on SDD-74

| Unit | Forecast | Landed | What cost the time |
|---|---|---|---|
| WU1 | 270–340 | 788 | 2 stalled writer launches; 5 independent verification passes, run while the candidate was still changing |
| WU2 | 180–230 | 847 → 692 | size-refactor round; 4 ditto runs |
| WU3 | 390–510 | ~1,070 before refactor | size-refactor round: multi-line doc comments, duplicated tests, field-inspection tests |

One ditto run costs about 100 s per 27 mutants on one package (`docs/mutation-testing.md`). A
single run is cheap. Repeating it is what costs the time.

## Rules

| # | Rule | What it replaces |
|---|---|---|
| 1 | **Per-file budget, written before RED**, derived from `wc -l` comparables (AGENTS.md → "Sizing a Change"). Deletions count, so price removed code and its tests too. | One whole-unit forecast that turns out wrong only after the code exists |
| 2 | **Lean test rules in the brief:** one-line doc comments; one table per behavior, with scenario names as row names; literals, never the production symbol being pinned; assert observables, never struct fields; a 5 s failsafe on every blocking channel receive. Details live in the `lean-tests` skill. | A refactor round after the overshoot |
| 3 | **Stop before exceeding a file budget** and report the measured remainder. The changed-line metric cannot be lowered after the fact (AGENTS.md → "Sizing a Change"). | Write, then trim |
| 4 | **One verification pass per frozen candidate.** The writer stages everything and runs the full order once. The orchestrator reads the diff and re-runs one command. A later fix re-runs only the focused test and that package's ditto. | Re-running the whole matrix after every edit |
| 5 | **Ditto runs `--dry` first, then at most 2 times.** The test command carries `-json -p=4 -timeout 120s` and names only the owning packages. Under cumulative staging, `--exclude-prefix` covers every earlier unit's files. | Open-ended mutation loops, and a mutant hanging for the default 10 minutes |
| 6 | **Heavy commands run one at a time:** ditto, lint, `wails build`, `go test ./...`, bun builds. This machine hangs under concurrent load, and the gate pins `-p=4` for the same reason (CLAUDE.md #18). Parallelize only agent-side work, such as read-only mapping of the next unit or drafting docs. | Running lint or a build next to ditto |
| 7 | **A heavy receipt runs only in the unit whose change it can observe.** `wails build` and `render:smoke` go in the desktop-wiring unit and in final verification; other units use `go build ./...`. A benchmark goes in the unit whose document cites it. | `wails build` in a pure-Go unit |
| 8 | **Pure deletions get their own unit.** Removing a superseded path and its tests needs no RED and no ditto, and its deletions stay out of a feature unit's cap. | Hidden deletion lines blowing a feature unit's cap |

## Verification order

Stage the candidate, then run these one at a time:

```bash
gofmt -l <package dirs>
go test -count=1 <owning packages>
powershell -ExecutionPolicy Bypass -File scripts/lint.ps1 -Profile all
go run ./tools/checkgofilesize
git diff --shortstat <previous-unit-tree> $(git write-tree)
ditto staged --dry --exclude-prefix frontend/ --exclude-prefix <earlier-unit paths>
ditto staged --exclude-prefix frontend/ --exclude-prefix <earlier-unit paths> --threshold 0.80 \
  --test-command "go test -count=1 -json -p=4 -timeout 120s <owning packages>"
go build ./...   # the desktop-wiring and final units run wails build, then render:smoke, instead
```

## Writer brief checklist

- [ ] Files, each with its line budget
- [ ] Acceptance examples, rejection examples, and forbidden outputs (AGENTS.md → "Delegation and Verification Guardrails")
- [ ] Lean test rules (rule 2) and the stop-at-budget instruction (rule 3)
- [ ] The exact verification order, with the scoped ditto command
- [ ] Boundaries: no commit, reset, stash, or ref updates; stage only the unit's files

## Promotion criteria

For each trial unit, record in `apply-progress.md`:

- per-file budget against landed lines;
- size-refactor rounds;
- ditto runs;
- verification passes;
- mutation score.

No reliable wall-clock baseline exists for WU1–WU3, so the criteria count the rework events that
drove the time.

Promote to canon when all of these hold across SDD-74 WU4–WU6b:

- [ ] No unit needs a size-refactor round: every file lands within budget, or the writer stopped and reported.
- [ ] No unit needs more than 2 ditto runs or more than 1 verification pass.
- [ ] Quality holds: every mutation score is ≥ 0.80, and the final commits pass the real gate.

**On promotion:**

1. Link this document from AGENTS.md → "Sizing a Change".
2. Drop the provisional banner.
3. Log the lesson with `node scripts/log-lesson.mjs`.

**If a criterion fails:** record here which rule failed and why, before changing the rule.

## Related

- AGENTS.md → "Sizing a Change": comparables and the over-engineering rule
- `lean-tests` skill: the test smell table
- `docs/mutation-testing.md`: ditto scoping and cost
- CLAUDE.md #18: why the gate is bounded
