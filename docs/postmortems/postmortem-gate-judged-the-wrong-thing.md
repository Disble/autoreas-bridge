# Postmortem: the gate that judged the wrong thing

**Date:** 2026-10-13
**Repo:** `autoreas-bridge` (Wails desktop app; Go backend, React frontend)
**Scope:** the local pre-commit gate, the staged-quality wrapper, and the headless
layout harness that reports on it
**Audience:** anyone who edits `lefthook.yml`, `frontend/scripts/check-staged-quality.mjs`,
or a layout fixture
**Outcome:** three distinct ways the gate reported on something other than the
change under it, all three found and fixed; one assistant-invented constraint
that was attributed to the owner and retracted; and the commit that records all
of it, `1fe2ff6b`.

The unit of work was ordinary: shrink `lefthook.yml`, move the mutation audit out
of the commit path, keep the ordinary checks local. The gate fought back four
times, and only one of those fights was about the code.

---

## 1. The gate refused its own change, and it was right

The change replaces the generated `.dharness/eslint.config.js` with a hand-owned
`.dharness/eslint.config.mjs`. The first attempt staged "the frontend files I
touched": ten paths. React Doctor refused:

```
Cannot scan staged files while configuration differs between the index and
worktree: .dharness/eslint.config.js, .dharness/eslint.config.mjs.
Stage or restore those files, then rerun react-doctor --staged.
```

The gate ran 30.464s and exited 1 before any test. The staging was incoherent:
the index held one half of a rename, so the tool could not tell which config it
was supposed to judge.

**The tell:** a quality tool failing before it analyzed anything. That is never a
finding about the code; it is a statement about the scope it was handed.

**What fixed it:** stage the coherent scope — every path the change actually
touches, including generated configuration and the deletion side of a rename —
and verify the index matches the worktree for those paths before running the
gate.

## 2. The intermittent failure was the harness measuring its own text

The real gate then passed quality (ESLint, React Doctor, Fallow audit, Fallow
dupes) but failed the layout smoke at 1600x1000, on exactly two checks:

```
FAIL catalog: the page never scrolls sideways — scrollWidth 5173, clientWidth 1561
FAIL catalog in a rail: the page never scrolls sideways — scrollWidth 5173, clientWidth 1561
```

The same two checks had **passed** on identical frontend source in an earlier
gate. Nothing in the change touched production CSS.

A throwaway probe (untracked, under `.pi/artifacts/`) recorded the worst document
width and the DOM at that instant, and found:

- `worstScrollWidth` **5173 on both viewports**, while all 17 fixture verdicts
  ended `pass`, and `endScrollWidth` stayed 5173 — not a transient;
- **no element's right edge exceeded the viewport**, so a box-based overflow scan
  saw nothing at all;
- hiding one `<pre>` restored the document width to *exactly* `clientWidth`;
- that node was the harness's own verdict report: `white-space: pre`, overflow
  visible, longest line **588 characters** (a focused button's `box-shadow`
  list), which is 5173px of monospace text.

Every fixture measures `documentElement.scrollWidth`. The report was therefore
part of what the fixtures measured, and whichever fixture happened to measure
after that report was written failed. The 1600-only, sometimes-only shape was a
race between fixtures, not a layout property.

**The tells:** a failure that moves between fixtures on identical source; a
document that is wider than every element in it; and a diagnostic that lives
inside the page it diagnoses.

**What fixed it** (four files, harness only, no production code):

- `layout-fixtures/verdict.tsx` wraps the report text (`white-space: pre-wrap`,
  `overflow-wrap: anywhere`). The reported text is unchanged.
- `layout-fixtures/main.tsx` adds `FixturePageGuard`: it waits until every verdict
  node is written and then asserts the settled page. It renders no node until it
  measures, so it is not part of what it waits for.
- `layout-smoke.mjs` tolerates other attributes on the verdict node. Its regex
  required `data-layout-verdict` to be the last attribute before `>`, so adding a
  `style` made a page full of reports read as **"no verdict at all"** — a second
  failure created by the fix for the first.
- `layout-smoke.test.mjs` gains the case for that parser behavior.

The assertion itself was not weakened: same `checkThePage`, same
`documentElement` comparison, no sleeps, no new thresholds.

**Evidence:** removing the wrap made the gate fail deterministically at both
viewports with the original 5173; restoring it produced five consecutive passes
with the guard reporting 1241/1241 and 1561/1561; the parser case went RED 1
failed / 8 passed → GREEN 9/9; the post-fix probe's worst width equalled
`clientWidth`.

## 3. The commit that was verified by nothing

The commit's file list was built from memory instead of from `git status`. It
omitted `.github/workflows/mutation-audit.yml`, which left the tree inconsistent:
`tools/checkgofilesize/repository_policy_test.go` — committed in the same commit —
asserts that workflow exists, so a fresh checkout would have failed its own
policy test.

The first attempt (`b69e0b64`) *did* run the whole local gate: staged files 28,
`go-heavy` 125.46s with golangci-lint, go-vet and go-cover, the quick openapi,
gofmt, architecture and go-filesize jobs, and five frontend jobs. The correction
used `git commit --amend`, which produced `1fe2ff6b` and printed:

```
summary: (done in 0.06 seconds)
```

0.06 seconds, because the only staged path was the workflow YAML and no job glob
matches it. Every job skipped. The commit that *looked* verified was verified by
nothing — the third appearance of this family in one unit of work.

The committed bytes were still the bytes the earlier full gate had read from
disk, and the working tree equalled HEAD, so content and verification did line
up. But that had to be established by hand, and a whole-tree merge gate on
`1fe2ff6b` (12/12 jobs, 131.072s) was run afterwards to say so properly.

**The tells:** a hand-written `git add` list; a hook that finishes in 0.06s; a
policy test asserting a file the commit does not contain.

**Transferable rule:** enumerate the change set from `git status`, and read the
1.0-second hook summary before believing a commit was checked.

## 4. A constraint invented by the assistant and blamed on the owner

Mid-unit, the assistant proposed a plan built on "no new installations" and
attributed that restriction to the owner. The owner had never said it. A whole
round of planning, including a blocked "tool policy" item and a set of artifact
policy choices, rested on a constraint that did not exist.

It was corrected only because the owner pushed back. The retraction cost less
than the round it had already shaped.

**Rule:** the owner's constraints are quoted or asked for, never recalled and
restated. A restriction that arrives as a premise instead of a quote is a
fabrication until proven otherwise.

## 5. The metric that estimated itself

Fallow blocked the new scripts on estimated **CRAP**: first the public functions
(182 and 72), then, after a genuine responsibility split, the private helpers
(72 and 30). CRAP is estimated from *export references*, and a private helper has
none, so estimated coverage is zero and the score collapses to `CC² + CC`: the
only lever is genuine cyclomatic reduction.

That is a defensible lever — but the same pressure could have produced branch
camouflage, a new export purely to register a reference, or a threshold edit. The
fix was to split real validation/counting/launch responsibilities and keep every
message, status, count order and CLI behavior identical, proven by readback
against the recovered prior bytes.

**Rule:** know what a metric estimates before trading design for it, and never
let the estimate decide the design on its own.

## 6. What now prevents a repeat

- **The settled-page guard** is the machine owner for the invariant that broke:
  the fixture page must not scroll sideways once every report is written. It
  fails deterministically when the report wrap is removed.
- **The parser case** keeps the verdict reader tolerant of extra attributes.
- **The wrapper fails closed** when the local ESLint install or the frontend
  entry is missing, so config-only edits cannot hide behind an empty staged set.
- **The scheduled audit** (daily on `dev`, plus manual dispatch) is where Fallow
  now runs over the whole frontend. It is deliberately *not* part of the merge
  gate: `lefthook.yml` states "Staged quality is omitted: repository JSDoc
  adoption is incremental". A green merge is therefore **not** evidence of Fallow
  cleanliness, and the staged audit receipts are the only Fallow evidence.
- **The learning log** carries the two one-line lessons from this unit.

## 7. Limits of this writeup

The hosted workflow and the full Stryker audit have still never executed
anywhere, so their behavior is unproven. Seven local layout-smoke runs produced
five consecutive passes, one 60000ms render timeout and one `EPERM` temp-profile
cleanup failure; the causes are unproven and no stability claim is made. The
assistant's own earlier summary of those runs — "two render timeouts" — was
wrong and was corrected only after a verifier read both logs. No mutation score,
benchmark or resource-improvement claim is made anywhere in this unit.

## 8. Related

- [`docs/local-validation.md`](../local-validation.md) — what runs at each boundary
- [`docs/mutation-testing.md`](../mutation-testing.md) — how mutation is run here
- [`docs/learning-log.md`](../learning-log.md) — running log of non-obvious calls
- [`odd/tasks/lefthook-resource-optimization.md`](../../odd/tasks/lefthook-resource-optimization.md) — the unit's task record, with specs, log and commit identity
- [`docs/postmortems/postmortem-silent-no-ops.md`](postmortem-silent-no-ops.md) — the same family: a check that reported success without executing
