# Activity ↔ MCP observability parity

## Goal

Activity must be able to answer every question the agent-facing MCP sidecar can
answer, and that parity must be held by **structure** rather than by discipline.
Today it is held by nothing: the MCP registers 7 read tools and Activity binds 5,
`resolve_request_context` exists only inside the MCP adapter, and the store
`device_sync_diagnostics` has no readable path on either side.

The fix is the project's own hexagonal architecture, completed:

- **Capabilities live in the core** (`internal/observability/*`), never in an adapter.
  An adapter only names, projects and exposes them.
- **A capability catalog in the core** is the single source of truth for the read surface.
- **A manifest per adapter** declares what that adapter exposes, plus its exclusions
  with mechanical reasons.
- **A shared conformance suite** runs the same behaviour tests against both adapters.
- **A fitness function** fails the build when the two manifests diverge.

Parity means **same capabilities, different projections, declared absences**. The
projections must differ — the MCP sanitizes because its output leaves the machine
into an agent context; the desktop does not, because the owner's own data needs no
confidentiality at the display boundary.

## Tasks

- [x] Record the boundary rule and the vocabulary: ADR-025 states that sanitization is an **egress** rule and not a display rule, the three-way distinction is in `docs/ubiquitous-language.md`, and the lesson is logged. `ab64188`
- [x] Move the fuzzy resolve capability down into `internal/observability/requestcapture` so it stops being adapter-local, keeping the MCP tool's behaviour identical. Mutation 59/63, score 0.94. `6eaac74`
- [x] Introduce the core capability catalog in `internal/observability/readcap`: canonical name, owning store, kind, no adapter knowledge. `821a550`
- [x] Declare one capability manifest per adapter, each carrying its exclusions and their reasons. The MCP roster keeps its original order; the desktop declares what it binds and excludes `get_correlation_timeline` with its mechanical reason. The desktop also gained the resolve binding it could not reach before. `526e848`
- [x] Write one shared conformance suite and run it against **both** adapters: one conformance function over two adapter descriptors. Each adapter also asserts in its own package that its projections preserve the core's answers. `526e848`
- [x] Add the fitness function: an adapter's `exposed ∪ excluded` must equal the catalog, disjoint and reasoned, so a capability cannot be lost or hidden silently. **Residual**: the gate is capability-level; a table that no capability names is still unguarded. `526e848`
- [x] Add a read path over `device_sync_diagnostics` — the only store that can attribute a report to a device. Mutation 25/26, score 0.96, the survivor being an equivalent LIMIT-clamp mutant. `e9da0ac`
- [x] Expose that read path through the desktop: catalog entry, desktop exposure, MCP mechanical exclusion, pointer-safe contracts, nil-safe wiring. Mutation 16/16, score 1.00. `de276dc`
- [ ] Resolve the Runtime Events question for diagnostics: emit a `cycle_id`-deduplicated event, or record why not.
- [ ] Move `BridgeStatusCard` from the Activity strip into Overview.
- [ ] State retention caps and page/sample limits on every observability surface.
- [ ] Replace the hand-written parity note in the Overview with the count the catalog derives.

## Constraints

- A capability lives in the core; an adapter only names, projects and exposes it.
- **Never restore parity by copying a capability into the desktop.** That is
  duplication, and it manufactures the next drift.
- Parity is capability-level. Verbatim output parity is explicitly wrong: it would
  require removing the MCP's egress sanitization.
- Absence has three states: present in both, absent with a recorded mechanical
  reason, or debt. Anything not in the register is debt — that is the whole point.
- Vocabulary: `device_sync_diagnostics` is **diagnostics** or **sync cycle report**,
  never "health". `BridgeStatusCard` (SQLite status) and `notifyDeviceSyncHealth`
  (device staleness) are different concepts and keep their existing names.
- Schema constraints, stated by the schema itself: `degraded` is a **fidelity**
  signal and not a health signal, `app_state` is not a filter dimension, and
  `trigger_source` is the only trustworthy discriminator.
- Reported values are reports, not live state: no ticking clock on them.
- The capture path can skip a body (pre-auth oversized, unknown length). A capture
  with no report must say so; it must never render blanks as zeroes.
- A diagnostics capture **cannot be attributed to a device**: the report body carries
  no `device_id` by design, identity is Authorization-header-only, and the capture
  layer does not record it. A Transactions projection therefore shows the report and
  no device. Do not "fix" that by blanking a device field — the attribution lives in
  `device_sync_diagnostics`, and the projection must say nothing rather than guess.
- Artifacts are English. Never edit `frontend/wailsjs/`; regenerate with
  `bun --cwd="frontend" run generate:bindings`.
- Respect the 400-warn / 500-hard line limits with colocated splits.

## Open decisions

- **Runtime Events for diagnostics.** The owner's information-architecture decision
  places diagnostics in Transactions **and** Runtime Events. Ingestion emits nothing
  today, so this is new work. The data currently holds 117 duplicate deliveries, so
  an emit must deduplicate on `cycle_id` or it amplifies the noisiest traffic there is.
- **Capture-layer attribution.** Diagnostics captures are 332/332 unattributed, while
  reconcile captures are 860/862 attributed, and websocket captures are 582/954
  attributed. The capture layer cannot attribute a report whose identity travels only
  in the Authorization header. Whether to fix the capture middleware, or to treat
  attribution as a job the ingestion seam already does correctly, is undecided.
- **Where does the fitness function live?** It compares Go registrations against
  generated TypeScript bindings, so Go `tools/` is the likely home next to
  `checkgofilesize` and `checksdd`.

Resolved by measurement: the normalized `device_sync_diagnostics` reader **ships**.
The earlier draft proposed excluding it on the grounds that the capture path already
carried the same facts; that was wrong. The capture path carries the *report* but
**not the device**, so it cannot answer a single per-device question.

## Evidence

Measured 2026-09-19 against the live bridge database
(`%AppData%/Autoreas/data/bridge.db`), with `adb` showing `R52T30686RV` attached.

- `device_sync_diagnostics`: **212 rows, 6 devices, zero readers.** The only `SELECT`
  in the package is the retention prune. Four read-path indexes exist with no
  readers (`trigger_source`, `previous_outcome`, `previous_error_fingerprint`,
  `device_id`).
- `request_captures`: 2 886 rows, of which **332** are `POST /api/sync/diagnostics`,
  each carrying the full 543-byte report body. The newest capture shares its
  `cycle_id` (`a502d42b-…`) with the newest table row.
- **Capture attribution is the decisive measurement.** Per route, unattributed
  captures of the total:

  | Route | Captures | No `device_id` |
  | --- | --- | --- |
  | `/ws` | 954 | 372 |
  | `/api/sync/reconcile` | 862 | **2** |
  | `/api/sync/diagnostics` | 332 | **332 — all of them** |
  | `/api/animes` | 324 | 324 |

  A diagnostics capture cannot be attributed to a device, and no `device_name`
  exists either. The report body carries no `device_id` by design.
- **117 duplicate deliveries** (329 − 212): the table deduplicates on `cycle_id UNIQUE`,
  the capture table records every retry.
- Newest report: `consecutive_unclosed_cycles=20`, `pending_ops_count=5`, `cursor=2340`,
  `previous_outcome=never_closed`, `previous_elapsed_ms=600303`. The same day's
  `snapshot.html` reported 11 unclosed cycles. The counter climbed 11 → 20 with no
  screen showing it.
- Parity gap: MCP **7** tools vs **5** bound methods plus `RuntimeEventsAvailable`.
  `resolve_request_context` is implemented only at
  `internal/mcp/requestcapture/reader.go:187`. `activity-observability-overview`
  claims parity on 6 of 7 and names only `get_correlation_timeline` as excluded.
- Runtime event domains in the live store: websocket 2 279, sync 1 782,
  tracer-bullet 1 342, download 766, api 551, anime 383, system 372, device 9,
  bus 4, schedule 4.
- Nothing is implemented yet; every task above is open.

Pending work, not a blocker: the diagnostics projection inside Transactions and
the route preset that reaches those rows (tasks 9 and 10 of the original list)
are implemented and staged, but not committed, and the remaining work is ours to
finish. Frontend tests pass (3048/3048), typecheck passes, render smoke passes,
layout smoke passes. Two checks still fail: `dharness/require-jsdoc` fires on a
pre-existing fixture declaration in `TransactionDetail.test.tsx` that this change
brought into scope with a one-line edit, and the frontend mutation job reports 43
uncaught mutants (37 survived, 6 with no coverage) across the 193 in-scope
mutants of the nine staged production files.

How the surviving mutants are closed, per the repository's own `lean-tests` skill
(hard rule 1 and its decision gate): **by consolidating tests, not by adding
them**. A surviving mutant is killed with a new ROW in that behaviour's existing
table, or by strengthening an existing fixture so the same scenario carries more
assertions — never by adding a new test function per mutant, which is the exact
failure this repository already logged ("MUTATE survivors got new test functions
though the task said table rows"). This matters mechanically, not only
stylistically: the mutation suite runs once per mutant, so every test added for a
single mutant raises the cost of every future mutant. The measurement is mutant
kills before and after, with the suite runtime flat or lower.

Recorded while working, not part of the plan: `ditto staged` scopes mutants to
the staged diff but scores them against one test command, so a staged change
spanning several packages reports an unmeasurable score when the command names
only some of them. Written up for the ditto team in
`docs/reports/ditto-mutation-scope.md` (`debb318`). The workaround that works is
to name every owning package in the test command.
