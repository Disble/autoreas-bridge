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
- [x] Resolve the Runtime Events question for diagnostics: ingestion now emits exactly one `sync`/`info` event per **stored** report. The deduplication is free — `IngestOutcome` already separates `Stored` from `Duplicate` (via `cycle_id UNIQUE`) and `Shed`, so a retry is not new information and a shed write is not a stored report. `c6bda20`
- [x] Move `BridgeStatusCard` from the Activity strip into Overview. Composition stays in the app layer: `ActivityRoute` passes the card as an opaque `statusStrip` element through `ActivityView` into `ActivityOverview`, so the network feature never imports the dashboard feature and the fallow boundary count stays at its 12 pre-existing crossings. Accepted consequence: `/activity/runtime-events` no longer shows the strip. `586115e`
- [x] State retention caps and page/sample limits on every observability surface. Each store exposes its row cap through one accessor, the desktop manifest is readable as data, and a single binding carries the parity facts plus the retention and sample limits; every number on screen comes from the code that enforces it. An unavailable binding states that the limits are unavailable and renders **no** count. `497c6d0`
- [x] Replace the hand-written parity note in the Overview with the count the catalog derives: how many of the catalog capabilities Activity exposes, plus each excluded capability named with its registered reason, falling back to the previous substance with no count when the binding is unavailable. `497c6d0`

## Mutation ledger

Every Go work unit was measured with `ditto staged` against its owning packages, and every
frontend unit with `dharness mutate --staged`.

| Unit | Score | Note |
| --- | --- | --- |
| Resolve moved to the core | 59/63 = 0.94 | Four survivors: the pagination batch size, unobservable without pinning the constant, plus two equivalent comparison guards |
| Desktop capability declarations | 4/4 = 1.00 | |
| `syncdiag` read path | 25/26 = 0.96 | Survivor is an equivalent LIMIT-clamp mutant |
| Diagnostics exposure | 16/16 = 1.00 | |
| Diagnostics legibility in Transactions | 193 in-scope, 43 uncaught → **0** | Closed by consolidating nine one-scenario tests into one 13-row table plus a 4-row skips table, a 3-row general-fields table, and a five-row hook table |
| Bridge status strip into Overview | 32/32 = 1.00 | |
| Derived parity and visible limits | 46 in-scope, **0** uncaught | |

The legibility unit also removed four pieces of **dead production code** rather than testing or
suppressing them: a number-type check before `Number.isFinite`, which never coerces; an array
exclusion where the reader only reads seven named string keys; an object-type check that could not
change any projection outcome; and a catch that returned exactly what the guard after it returned.
Equivalence was evidence of redundancy, and suppressing a survivor is forbidden here.

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
Pending-check history, closed: this unit was once recorded as blocked on 43 uncaught mutants
(37 survived, 6 with no coverage) across the nine staged production files. It closed at zero by
**consolidating tests rather than adding them**, per the repository's own `lean-tests` skill (hard
rule 1 and its decision gate): a surviving mutant is killed with a new ROW in that behaviour's
existing table, or by strengthening an existing fixture — never by adding a test function per
mutant, which is the exact failure this repository already logged. The reason is mechanical, not
stylistic: the mutation suite runs once per mutant, so every test added for a single mutant raises
the cost of every future mutant.

Known deviations, recorded rather than hidden:

- The fitness function is capability-level. A table that no capability names is still unguarded.
- The observability-facts hook reads the binding through `window.go` directly, because
  `frontend/wailsjs/` is generated and was untracked while the unit was built. The bindings have
  since been regenerated and now export `GetObservabilityFacts`, so the direct call can be
  swapped for the generated import in a follow-up.
- `frontend`'s layout/render smoke tooling leaves untracked `.tmp-*.png` screenshots in the
  repository root.

Recorded while working, not part of the plan: `ditto staged` scopes mutants to the staged diff but
scores them against one test command, so a staged change spanning several packages reports an
unmeasurable score when the command names only some of them. Our own lean-tests reference already
documented the workaround, which the report to the ditto team now discloses. See
`docs/reports/ditto-mutation-scope.md` (`debb318`).
