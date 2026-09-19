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

- [ ] Record the boundary rule and the vocabulary: add an ADR stating that
  sanitization is an **egress** rule and not a display rule, add the
  bridge-status / device-sync-health / device-sync-diagnostics distinction to
  `docs/ubiquitous-language.md`, and log the lesson.
- [ ] Move the fuzzy resolve capability down into
  `internal/observability/requestcapture` so it stops being adapter-local, keeping
  the MCP tool's behaviour identical.
- [ ] Introduce the core capability catalog: canonical name, owning store, kind.
  It must know nothing about Wails or MCP.
- [ ] Declare one capability manifest per adapter: the MCP's seven tools and the
  desktop's bindings, each carrying its exclusions and their reasons.
- [ ] Write one shared conformance suite and run it against **both** adapters.
- [ ] Add the fitness function: the manifest set difference must be empty except
  for registered exclusions, and every observability table must have a read path or
  a recorded exclusion.
- [ ] Make the diagnostics report legible inside Transactions by projecting the
  captured payload into values, honouring `request_body_state`. It must **not**
  render a device: diagnostics captures carry no attribution (see Evidence).
- [ ] Add a read path over `device_sync_diagnostics` — it is the **only** store
  that can attribute a report to a device, so it is the answer to every per-device
  question the capture path structurally cannot reach.
- [ ] Add a route-scoped way to reach the diagnostics rows without knowing the
  route string `/api/sync/diagnostics`.
- [ ] Resolve the Runtime Events question for diagnostics: emit a `cycle_id`-deduplicated
  event, or record why not.
- [ ] Move `BridgeStatusCard` from the Activity strip into Overview.
- [ ] State retention caps and page/sample limits on every observability surface.
- [ ] Replace the hand-written parity note in the Overview with the count the
  catalog derives.

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
