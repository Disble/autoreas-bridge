# Design: Decision-Grade Metrics (SDD-64)

Change: `2026-08-30-sdd-64-decision-grade-metrics`
Depends on: `proposal.md`, `specs/observability/spec.md`

---

## 1. The shape of the problem

Two logging patterns coexist in Bridge. Naming them is the whole design, because every
decision below follows from which one a given signal belongs to.

| | Narrative log | State-transition record |
| --- | --- | --- |
| Package | `internal/logger` to `eventlog` | `internal/sync/write_base_store.go` |
| Table | `runtime_events` | `anime_write_operations` |
| Payload | a formatted sentence | the state itself (base + desired snapshot) |
| Answers | "what was the app saying" | "what changed, from what, to what" |
| Aggregatable | only by domain and level | by any field of the state |

The narrative log is well built — ports and adapters (`Logger` plus `EntrySink`), a
composite fan-out (`FanoutLogger`), a decorator (`InstrumentedBus`), a bounded non-blocking
queue with retention. The plumbing is not the defect. The **emission contract** is:
`Logf(domain, level string, fields Fields, format string, args ...any)` makes the payload a
sentence and the dimensions optional.

A decision needs two things a sentence cannot provide: a **dimension** (a closed set to
group by) and a **denominator** (a ratio, not a count). This change adds both, and it adds
them where the state already lives rather than by emitting more prose.

---

## 2. Decision D-1 — derive changed fields, never declare them

**Decision.** Compute the changed-field set inside `insertAnimeChangedOutbox`
(`internal/sync/write_base_finalize.go:32-33`), persist it on the outbox row, and carry it
through the drain into `events.AnimeChangedEvent.ChangedFields`.

**Why not ask producers to set it.** That is the current design, and it is why the field is
empty. Six producers construct `AnimeChangedEvent`; none passes `ChangedFields`:

```
internal/anime/editor_service.go:220
internal/anime/schedule_service.go:218
internal/anime/writer.go:164
internal/anime/writer.go:195
internal/anime/write_service.go:257
internal/tracerbullet/runner.go:42
```

Three of those sit in near-identical `publishCommitted` methods duplicated across
`EditorService`, `ScheduleService`, and `WriteService`. Each receives only the desired
payload — the base snapshot is not in scope at that point — so none of them *can* compute
the diff without new plumbing. Adding a seventh place to remember is a design that fails the
same way a seventh time.

**Why the outbox insert is the right seam.** It is the single choke point every committed
write passes through, and it runs inside the finalize transaction where `operation` already
holds both `BaseSnapshotJSON` and `DesiredSnapshotJSON`
(`internal/sync/write_base_store.go:36,142`). The two states the diff needs are already in
hand, in the same transaction, exactly once per commit.

**Consequence worth stating.** Once derived, "declared" and "actual" are the same value by
construction. The report's proposed *undeclared mutation rate* stops being a discrepancy to
monitor and becomes an invariant. That is a better outcome than measuring the gap: the gap
cannot open.

### 2.1 Flow

```
EditorService/ScheduleService/WriteService
  |  desired payload only
  v
WriteBaseStore.Finalize (write_base_store.go:172)
  |
  +-- finalizeWriteOperation (write_base_store.go:235)
        |  transaction holds BaseSnapshotJSON + DesiredSnapshotJSON
        |
        +-- updateWriteOperationStatus  -> status = committed
        |
        +-- insertAnimeChangedOutbox    <== DERIVE changed_fields HERE
              |  INSERT ... changed_fields_json
              v
        outbox drain (write_base_lifecycle.go:190)
              |  reads changed_fields_json
              v
        AnimeChangedEvent{ChangedFields: ...}
              |
              v
        ChangelogRecorder (changelog_recorder.go:56)
              |
              v
        changelog.changed_fields_json  -- no longer []
```

### 2.2 Schema

`anime_changed_outbox` gains one column:

```sql
changed_fields_json TEXT NULL
```

Additive and nullable on purpose. The drain treats `NULL` and absent as an empty list, which
is byte-for-byte today's behavior, so a revert needs no down-migration. `anime_changed_outbox`
is registered through `indexedCreateOnlyTable` (`internal/sync/schema_tables.go:22`), so the
column is added through the existing migration path rather than by editing the create DDL
alone — see task 2.2.

### 2.3 What "changed" means

Top-level snapshot field comparison, using the canonical JSON the operation already stores.
Collections compare by value, not by identity, so a reordered list is not a change. The
comparison is deliberately shallow: the metric this feeds asks "was this field part of the
write's intent", not "what inside it moved".

---

## 3. Decision D-2 — the truncation detector is a query, not an instrument

**Decision.** Slice A ships a check that reads `anime_write_operations` and reports
committed writes that emptied a collection field outside the write's intent. No production
code changes.

**Why first.** It is the only deliverable here that would have caught the actual incident,
and it requires nothing new: the base/desired pair is already persisted. On the production
database the equivalent query returned eight rows spanning six weeks, seven of which had
already been silently repaired by rescheduling.

**Why a check and not a dashboard.** The decision it enables is binary — ship or roll back —
and its output doubles as the recovery list. A number on a dashboard would have to be read
by someone; a check fails.

**Before slice B** the detector infers intent structurally (base non-empty, desired empty,
and no other field changed). **After slice B** it compares against the derived changed-field
set, which is exact. The check is written so that the second form replaces the first without
changing its contract — task 4.2.

---

## 4. Decision D-3 — close the event-type vocabulary before widening the API

**Decision.** Declare `EventType` as typed constants in `internal/logger`. Migrate the 15
existing `Logf` call sites onto them. Do **not** yet change the four convenience methods.

**Why.** `EventType` today is a free-text string with no declaration anywhere. Emitted values
include `sync`, `sync.reconcile`, `sync.changelog`, and `reconcile` — four spellings for one
area. Grouping by that field partitions nothing.

**Why not fix the convenience methods at the same time.** `Infof`/`Warnf`/`Errorf`/`Debugf`
hard-code `Fields{}` at nine sites across three implementations
(`fanout.go:42,47,52,57`, `mem.go:37,42,47,52`, `stdout.go:27,32,37,42`), and 26 of 41
production call sites use them. Widening that API before there is a vocabulary to put in it
produces 26 diffs that fill a dimension with free text — the same defect, at more call
sites. Slice D runs last for this reason.

**Guard.** A closed vocabulary that nothing enforces drifts back to free text. The
deterministic guard is a test asserting every `Fields.EventType` literal in production code
resolves to a declared constant — task 3.3. Per repo convention this is a real guard, not a
documentation note.

---

## 5. Decision D-4 — the tracer bullet stops naming domains

**Decision.** `Runner.record` (`internal/tracerbullet/runner.go:79-84`) takes an explicit
domain parameter instead of splitting the message on `": "` and using `parts[0]`.
Tracer-bullet events carry a synthetic-entity marker that health rollups exclude.

**Why.** Today the `anime` domain in `runtime_events` is *entirely* produced by this split:
`"anime: publishing anime.changed for tracer-bullet-anime"` becomes `domain=anime`. All 368
`anime` events in the incident database came from here. A dashboard reading "368 anime
events, all healthy" was reporting on a demonstration harness while real user data was being
destroyed.

Deriving a structural field from prose is the defect. Prose changes for readability reasons;
a domain is a contract.

**Scope note.** `openspec/specs/tracer-bullet-wiring` owns the tracer bullet's behavior. This
change alters *how it labels its events*, not what it publishes or in what order, so the
tracer-bullet spec is unaffected. Verified against its scenarios in task 3.5.

---

## 6. Decision D-5 — coverage is a ratio over writes

**Decision.** Real-entity event coverage is
`committed anime writes that emitted a matching runtime event / committed anime writes`,
excluding synthetic entity IDs on both sides.

**Why a ratio.** The denominator is what makes it decision-grade. A count of anime events
went *up* during the incident. The ratio was 0 percent: 468 committed writes, 0 matching
events. A count can be inflated by a tracer bullet; a ratio over real writes cannot.

**What it decides.** Below 100 percent means the write path has branches that commit
silently. That is a "instrument before shipping" signal, and it points at which branch.

**Dependency.** This needs D-1 (entity IDs on events) and D-4 (synthetic exclusion) to be
meaningful, which is why it sits in slice C rather than slice A.

---

## 7. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| The outbox migration touches a create-only table registered in the bootstrap chain | Medium | Additive nullable column through the existing migration path; drain treats absent as empty, so old rows and a revert both behave exactly as today |
| Deriving changed fields adds work inside the finalize transaction | Low | Shallow top-level comparison over JSON the transaction already holds; no extra query, no extra read |
| Slice D's 41 call sites exceed the review budget on their own | Medium | Slice D is last and independently sliceable per call site; `ask-on-risk` will surface it at tasks time |
| A closed vocabulary drifts back to free text | Medium | Deterministic guard test (task 3.3), not a convention note |
| The bugfix in flight touches `internal/anime/editor_service.go` | Low | No slice of this change edits that file; slice B works in `internal/sync` |

## 8. Testing strategy

Strict TDD is on for this repo, and the cycle here is RED, GREEN, MUTATE, REFACTOR.

- Slice B's derivation is a pure function over two JSON snapshots — table-driven unit tests,
  then `ditto staged` for the MUTATE step.
- The truncation detector's scenarios (reported, not reported, clean) are the three that
  matter; a mutant that inverts the "field was in the intent" condition must die.
- The vocabulary guard is itself the deterministic check for D-3; it must fail when a free
  text event type is introduced, and that failure must be proven by writing one.
- Never assert against the production constant being pinned. Expected event-type values are
  written as literals in tests, per repo convention.
