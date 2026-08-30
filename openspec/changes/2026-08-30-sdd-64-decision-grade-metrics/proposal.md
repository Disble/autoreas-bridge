# Proposal: Decision-Grade Metrics (SDD-64)

Change: `2026-08-30-sdd-64-decision-grade-metrics`
Inputs: `docs/reports/debugging-metrics-report.md` (2026-08-29), `docs/mcp-event-visibility-report.md`, live verification of the tree at `f99baf9`.
Delivery: `delivery_strategy=ask-on-risk`, `review_budget_lines=400`, `strict_tdd: true`.

---

## 1. Intent

### 1.1 The premise

A metric is good only if it helps take a **specific decision**. Everything below is scored
against that. A count nobody acts on is not a metric — it is chatter with a number attached.

### 1.2 The problem, in the product's own evidence

On 2026-08-29 a cover-only editor save silently wiped `One Pace - Wano`'s three scheduled
days. The incident was diagnosed **entirely** from `anime_write_operations`. Every
purpose-built observability surface contributed zero evidence:

| Surface | Rows | Rows that helped |
| --- | --- | --- |
| `anime_write_operations` | 468 | all of them |
| `runtime_events` (`anime`) | 368 | 0 |
| `changelog` | 1 | 0 |
| request MCP `search_events` | — | 0 |

The bug had been destroying schedules for six weeks. Nothing surfaced it.

### 1.3 Root cause of the observability gap — verified in code, not inferred

Bridge has **two logging patterns**, and only one of them can produce a decision:

- **Narrative log** — `internal/logger` to `eventlog.Sink` to `runtime_events`. The payload
  is a formatted sentence. Countable, not aggregatable.
- **State-transition record** — `anime_write_operations`
  (`base_snapshot_json` + `desired_snapshot_json`, `internal/sync/write_base_store.go:36`).
  The payload is the state itself.

Four concrete defects keep the narrative log from ever answering a question:

| # | Defect | Evidence |
| --- | --- | --- |
| P-1 | `Infof`/`Warnf`/`Errorf`/`Debugf` hard-code `Fields{}`, so four of five `Logger` methods **structurally cannot** carry `EventType`/`EntityID`/`CorrelationID`. 26 of 41 production call sites use them. | `internal/logger/fanout.go:42,47,52,57`; `mem.go:37,42,47,52`; `stdout.go:27,32,37,42` |
| P-2 | The `anime` domain in `runtime_events` is produced by the tracer bullet, which derives the **domain** by splitting a prose message on `": "` and taking `parts[0]`. So `anime: publishing...` becomes `domain=anime`. | `internal/tracerbullet/runner.go:79-84` |
| P-3 | `EventType` is free text with **no const registry anywhere** in the tree. The convention holds by discipline alone, and nothing prevents the next call site from breaking it. | No vocabulary declaration exists; only filter and render sites reference the field |
| P-4 | `changed_fields_json` is empty because **zero of the six `events.AnimeChangedEvent` producers set `ChangedFields`**. The transport is fully wired: `changelog_recorder.go:56` copies it, `changelog_store.go:31` marshals and persists it. The producers ship an empty envelope, and the zero value of `[]string` is valid, so nothing ever failed. | `editor_service.go:220`, `schedule_service.go:218`, `writer.go:164`, `writer.go:195`, `write_service.go:257`, `tracerbullet/runner.go:42` |

P-4 is the load-bearing one. It is not a storage gap — it is a **producer** gap, and it is
the exact failure shape this proposal is designed to make structurally impossible.

---

### 1.4 Correction to P-3, recorded 2026-08-30 during slice C

An earlier revision of this proposal claimed the emitted event types included
`sync`, `sync.reconcile`, `sync.changelog`, and `reconcile` — "four spellings for
one area". **That was wrong**, and it is corrected above.

It came from a grep that included test files and matched `EventType` occurrences
that were not emission sites at all, producing junk values (`"m"`, `"cur"`,
`"a"`, `"b"`) alongside the real ones. A precise sweep of production emission
sites shows the vocabulary is in fact **uniformly `domain.verb`**:

```
anime.write            download.detect_start_failed      sync.changelog
bus.publish            download.detect_start_succeeded   sync.reconcile
eventlog.prebind_overflow  download.episode_available    websocket.broadcast
notification           download.failed  (+11 more download.*)  websocket.register
                                                          websocket.unregister
```

Exactly one outlier exists: `"notification"` (`internal/notification/log_forward.go:55`)
carries no verb segment.

**What this changes.** Slice C's event-type work is **prevention, not cleanup**.
The grouping dimension is not currently garbage; it is currently correct by
discipline and unenforced. That is a weaker justification than originally
written, and it is stated here rather than quietly left standing. The slice is
still worth doing — an unenforced convention across 30+ call sites in five
domains drifts the moment someone is in a hurry, and `download`'s wrapper
(`service_effects.go:114`) already passes the value as a plain parameter — but it
buys a guard against future drift, not a fix for present damage.

P-1, P-2, and P-4 are unaffected by this correction; each was verified directly
at its call sites.

## 2. Drift record (CLAUDE.md rule 2 — code wins over docs)

`docs/mcp-event-visibility-report.md` is **historical**. Every fix in its "Recommended
fixes" table has landed. Proposing them again would re-do finished work:

| Report claim | Current code | Status |
| --- | --- | --- |
| Unbound window drops early-boot entries | `Sink.writeUnbound` buffers pre-bind up to `preBindBufferCapacity`, drops only after `everBound`; overflow self-reports via `recordPreBindOverflow` with event type `eventlog.prebind_overflow` | **RESOLVED** (`internal/observability/eventlog/sink.go:79,110-137`) |
| `Items` nil marshals to `null`, breaking the MCP schema | `scanEventSearchPage` starts from `EventSearchPage{AppliedLimit: limit, Items: []EventRecord{}}` with the rationale in a comment | **RESOLVED** (`internal/observability/eventlog/reader_search.go:94`) |
| Prune never runs in short sessions | `if s.successful > 1 && s.successful%s.pruneEvery != 0` — the first write prunes unconditionally | **RESOLVED** (`internal/observability/eventlog/store.go:61-62`) |
| Debug filtering | Unchanged, deliberate | **NO CHANGE INTENDED** |

The startup ordering the report flagged (`app.go:230` tracer bullet before `app.go:239`
`configureRuntimeServices`) is **still present**; it is now covered by the pre-bind buffer
rather than by reordering. No action needed.

`docs/reports/debugging-metrics-report.md` (2026-08-29) stands, with one correction this
change carries: its Finding 2 frames `changed_fields_json` as unpopulated storage. It is a
producer gap (P-4 above).

---

## 3. Scope

### 3.1 In scope

| # | Deliverable | Slice |
| --- | --- | --- |
| S-1 | Silent-collection-truncation detector over `anime_write_operations`, as a runnable check | A |
| S-2 | Derive changed fields at outbox insert, where both snapshots are in the same transaction; carry them into `AnimeChangedEvent` and `changelog` | B |
| S-3 | Closed `EventType` vocabulary as typed constants in `internal/logger` | C |
| S-4 | Tracer bullet stops deriving `domain` from prose; synthetic entities excluded from health rollups | C |
| S-5 | Real-entity event-coverage ratio (percentage of committed anime writes that emitted a matching runtime event) | C |
| S-6 | Dimension-carrying convenience methods, or migration of the 26 printf call sites | D |

### 3.2 Out of scope, with reasons

- **Changing the debug-persistence default.** Reviewed and deliberate
  (`eventlog/types.go:87-91`); debug volume would evict the rows that carry failure signal.
- **Age-based retention.** Reviewed in the MCP report and rejected; the row cap plus
  existing indexes already bound storage and query cost.
- **Re-plumbing request-capture correlation.** `matchesCorrelationID`
  (`internal/mcp/requestcapture/event_tools.go:109-124`) documents its own best-effort join
  and the follow-up it needs. Unrelated axis.
- **Fixing the placements data-loss bug itself.** In flight in the working tree
  (`clonePlacementsPatch`, `internal/anime/editor_service.go:191`). This change is about
  the metric that should have caught it, not the bug.
- **Repairing the seven historical truncations.** The detector's query *is* the recovery
  list; acting on it is an operational decision, not a code change.

---

## 4. Approach

### 4.1 Ordering, and why it is this order

1. **Slice A — truncation detector.** Zero new instrumentation: the base/desired snapshot
   pair is already persisted. It is the only deliverable here that would have caught the
   actual bug. Highest value per unit of work by a wide margin.
2. **Slice B — derived changed fields.** Turns A from a heuristic into a precise
   declared-versus-actual comparison, and closes P-4.
3. **Slice C — closed vocabulary, honest domains, coverage ratio.** Makes aggregation
   meaningful. Pointless before B, because the dimension would still have nothing true to
   group.
4. **Slice D — dimension-carrying emission API.** Largest blast radius (41 call sites),
   lowest payoff until A through C land. Widening a pipe nobody fills buys nothing.

### 4.2 The central design decision (detail in `design.md`)

Changed fields are **derived once at `insertAnimeChangedOutbox`**
(`internal/sync/write_base_finalize.go:32-33`), not passed by producers.

That function runs inside the finalize transaction, where `operation` holds **both**
`BaseSnapshotJSON` and `DesiredSnapshotJSON`. It is the single choke point every committed
write passes through. The three services that publish (`EditorService.publishCommitted`
`editor_service.go:218`, `ScheduleService` `schedule_service.go:216`, `WriteService`
`write_service.go:255`) each receive only the desired payload and therefore *cannot*
compute the diff locally without new plumbing.

Deriving beats declaring: a declared list can be forgotten — that is precisely how this
broke, in three duplicated `publishCommitted` methods. A derived list cannot.

### 4.3 The metrics, each tied to a decision

| Metric | Definition | Decision it enables |
| --- | --- | --- |
| **Silent collection truncation** | Committed writes that reduced a collection field (`days`, `genres`, `studios`) from non-empty to empty while that field was absent from the patch | Ship or roll back, plus a bounded recovery list — the query *is* the list |
| **Real-entity event coverage** | Percentage of committed anime writes that emitted a matching runtime event, excluding synthetic entity IDs | Below 100 percent means the write path has silent branches; instrument before shipping |
| **Undeclared mutation rate** | Committed writes where a field changed but is absent from the changed-field list | After slice B this is **structurally zero**; a non-zero value means the derivation itself regressed |

Coverage and truncation are **ratios and correctness assertions**, not counts, so
tracer-bullet traffic cannot inflate them.

### 4.4 What to stop measuring

Raw event counts per domain. `websocket` leads with 1694 events and none of them would have
helped. A dashboard reading "368 anime events, all healthy" reports on a tracer bullet while
real user data is being destroyed. Until slice C lands, `anime` domain event counts MUST NOT
appear on any dashboard.

---

## 5. Rollback plan

| Slice | Rollback boundary | Risk if reverted |
| --- | --- | --- |
| A | New check file plus its test only; no production code touched | None — the detector disappears, behavior unchanged |
| B | `anime_changed_outbox.changed_fields_json` column is additive and nullable; the drain treats absent as empty, which is today's behavior exactly | None — reverting restores the current empty-envelope behavior |
| C | `EventType` constants are additive; call sites migrate to them one at a time. The tracer-bullet domain change is local to `internal/tracerbullet/runner.go` | Low — a partially-migrated vocabulary is no worse than today's free text |
| D | Per-call-site; each migrated site is independently revertible | Low |

Slice B is the only one touching a schema. It is additive and nullable by design so that a
revert needs no down-migration.

## 6. Affected modules

- `internal/sync` — `write_base_finalize.go`, `write_base_lifecycle.go`, `schema*.go`, `changelog_recorder.go`
- `internal/events` — `event.go` (`AnimeChangedEvent`)
- `internal/logger` — `logger.go` (vocabulary), `fanout.go` / `mem.go` / `stdout.go` (slice D)
- `internal/tracerbullet` — `runner.go`
- `internal/observability/eventlog` — read side only, for the coverage query
- `tools/` — new truncation check (slice A)
