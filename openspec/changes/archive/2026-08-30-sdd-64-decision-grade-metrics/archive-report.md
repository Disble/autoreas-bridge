# Archive Report: Decision-Grade Metrics (SDD-64)

**Archived:** 2026-08-30
**Premise:** a metric is good only if it helps take a *specific* decision.

## What shipped

| Commit | Slice | What it does |
| --- | --- | --- |
| `f049f48` | A | `tools/checktruncation` — reports committed writes that emptied a collection field outside the write's intent |
| `90c66c4` | B (core) | `deriveChangedFields` — the diff between a write's base and desired snapshots |
| `e2b3199` | B (wiring) | The derived set travels to the changelog and the `anime.changed` event |
| `c14d95f` | C | Tracer bullet declares its domain; `domain.verb` vocabulary guard |
| `b19ecfd` | 3.7 | `tools/checkeventcoverage` — real-entity event coverage as a ratio |
| `d4b0375` | D | Websocket entries carry a real domain and dimensions; closure |

## The measurements that justify it

Both new checks were run against the production database, not only against fixtures.

- **Silent truncation: 8 findings**, spanning 2026-07-16 to 2026-08-30, the newest being the
  `One Pace - Wano` write itself. This independently reproduces the eight rows the incident
  report found by hand SQL.
- **Real-entity event coverage: 0.00** — 0 of 32 written anime emitted an `anime.write`
  event. The report's first finding as a number, confirming the code reading that the live
  publication path is the outbox drain, which does not log.

## Corrections recorded rather than quietly dropped

Three claims made during this change turned out to be wrong. Each is corrected in place.

1. **P-3 in the proposal was false.** It claimed four spellings of one area were in use
   (`sync`, `sync.reconcile`, `sync.changelog`, `reconcile`). That came from a grep that
   included test files and matched non-emission occurrences, yielding junk values (`"m"`,
   `"cur"`, `"a"`, `"b"`) read as real. The vocabulary was already uniformly `domain.verb`
   with exactly one outlier. Slice C therefore buys prevention, not cleanup. See
   `proposal.md` section 1.4.
2. **Finding 2 of the source report was mis-framed** as an unpopulated storage field. The
   transport was fully wired; zero of six producers ever set it. A producer gap, which is
   why the fix derives the value instead of asking a seventh caller to remember.
3. **Task 4.2 was cancelled**, not completed. Deriving changed fields from state makes
   declared and actual the same value, so there is no comparison left to sharpen the
   truncation detector with — and the derived list exists only on rows written after slice
   B, which would blind the detector to the historical rows where all eight findings are.

## Deviations from the plan

- **Task 3.2** planned typed constants; shipped a shape guard. `internal/download` emits
  event types through a wrapper taking the value as a parameter, generating 15+ values at
  its call sites, so a closed registry would fight that design without improving grouping.
- **Task 4.4** was not implementable as written: "remove the hard-coded `Fields{}` while
  keeping the four-method signatures" contradicts itself. The call sites that have a
  dimension moved to `Logf`; the convenience methods stay as the deliberate no-dimension
  path.

## Defects found along the way

- **`websocket_handler.go:105`** passed a whole sentence where `Warnf(domain, format, ...)`
  expects a domain, so those entries landed in `runtime_events` with a prose domain. Same
  class as the tracer bullet, invisible for the same reason: nothing asserts a domain.
- **`tools/checktruncation` reported "clean" on a pre-migration database** whose snapshots
  use Spanish keys (`dias`, not `days`). A clean result for the wrong reason — the exact
  defect this change exists to remove. Fixed with a run-level vocabulary guard.

## Tooling note

`ditto staged` must name the owning package in `--test-command`; the default `./...` runs
the whole suite once per mutant. Running it bare produced a ten-minute silent run that was
misread as a tool defect and escalated. `docs/mutation-testing.md` line 72 already said so.
Six items were nonetheless filed upstream from the exchange (Disble/ditto PR #11), the first
being that a healthy run and a hang are byte-identical on stdout.

Run properly, MUTATE earned its place: `checkeventcoverage` scored **0.31** on a fully green
suite, which surfaced unasserted CLI logic and one piece of genuinely dead code. Final
**0.91**.

## Known open item

The repository has a **~1-in-5 flaky test** on a cold full-suite run, package unidentified.
It matters here specifically: ditto has no retry, so a flake during a mutant run classifies
as a real kill and inflates any mutation score. Chase it before trusting one.
