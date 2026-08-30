# Tasks: Decision-Grade Metrics (SDD-64)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 620-820 |
| Review budget | 800 lines (raised by the user on 2026-08-30) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | A truncation detector -> B derived changed fields -> C closed vocabulary + honest domains + coverage -> D dimension-carrying emission API |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |
| Decision needed before apply | Yes — slice D alone touches 41 call sites |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Rollback boundary | Lines |
|---|---|---|---|---|---|
| A | Silent-truncation detector over already-persisted write operations | PR 1 | `go test ./tools/checktruncation` | `tools/checktruncation/` | 120-160 |
| B | Derive changed fields at outbox insert; carry into event and changelog | PR 2 | `go test ./internal/sync -run "Test(ChangedFields\|Outbox\|Finalize)"` | `internal/sync/{write_base_finalize.go,write_base_lifecycle.go,schema*.go}`, `internal/events/event.go` | 220-300 |
| C | Closed event-type vocabulary, explicit tracer-bullet domains, coverage query | PR 3 | `go test ./internal/logger ./internal/tracerbullet ./internal/observability/eventlog` | `internal/logger/logger.go`, `internal/tracerbullet/runner.go`, `internal/observability/eventlog/` | 180-240 |
| D | Dimension-carrying convenience methods or call-site migration | PR 4 | `go test ./...` | `internal/logger/{fanout.go,mem.go,stdout.go}` plus migrated call sites | 100-320 |

Slice A is independently shippable and carries the whole value of the change's first
decision. Slices C and D are droppable tails if the budget runs out.

---

## Phase 1: Slice A — silent collection truncation detector

- [x] 1.1 RED `tools/checktruncation/detector_test.go`: `TestReportsCoverOnlySaveThatEmptiedDays` — seed a fixture write operation with a base snapshot holding three days and a desired snapshot holding none, with no other field differing; assert the detector reports it, naming entity, field, and commit time. Command: `go test ./tools/checktruncation`.
- [x] 1.2 RED same file: `TestDoesNotReportIntentionalClear` — a write that empties days *and* differs in no other way must be distinguished from one where clearing days was the intent; assert the intentional case is not reported.
- [x] 1.3 RED same file: `TestUntouchedCollectionsReportNothing` — no qualifying rows, detector succeeds with zero findings.
- [x] 1.4 GREEN create `tools/checktruncation/detector.go`: read committed rows from `anime_write_operations`, compare collection lengths across `base_snapshot_json` and `desired_snapshot_json` for `days`, `genres`, `studios`.
- [x] 1.5 GREEN create `tools/checktruncation/main.go`: CLI entry returning a non-zero exit on findings, printing one line per finding so the output is directly usable as a recovery list.
- [x] 1.6 MUTATE the "field was not part of the intent" condition MUST die. **`ditto staged` could not run**: it spends >10 minutes copying the untracked `frontend/dist` and `frontend/wailsjs` into its worktree and never emits a mutant. Fell back to hand-mutation per the documented fallback; six valid mutants, all killed — see 1.9.
- [x] 1.7 REFACTOR confirm effective line count stays at or under 400 per file (`go run ./tools/checkgofilesize`).
- [x] 1.8 REFACTOR drop the `internal/sync` import that was only providing a default database path. A check tool that imports the domain it checks drags that whole package graph into its build; `-db` is now required and `go list -deps` shows the tool as a leaf.
- [x] 1.9 **Vocabulary guard (unplanned, found by running the tool against a real pre-migration database).** The `.ignore/bridge-db-backup-pre-sdd56-*` snapshot stores Spanish keys (`dias`, `activo`, `portada`), so the detector found nothing and printed "no silent collection truncations found" — a clean result for the wrong reason, which is precisely the defect this change exists to eliminate. `Analyze` now fails when no committed operation carries any known collection field. Verified: live database reports 8 findings (exit 1), pre-migration backup refuses with exit 2.
- [x] 1.10 MUTATE hand-mutation results, all six valid mutants killed: intentional-clear discrimination removed -> `TestDoesNotReportIntentionalClear`; `len(base) > 0` weakened to `>= 0` -> `TestAlreadyEmptyCollectionIsNotATruncation`; desired-side presence guard dropped -> `TestFieldMissingFromDesiredIsNotATruncation`; vocabulary guard removed -> `TestUnrecognisedVocabularyIsAnErrorNotACleanRun`; empty-run exemption removed -> `TestAnalyseEmptyRunIsNotAVocabularyFailure`; `carriesKnownCollection` forced true -> `TestUnrecognisedVocabularyIsAnErrorNotACleanRun`. Two of those tests exist **only** because the mutation step exposed the gap.

## Phase 2: Slice B — derived changed fields

- [x] 2.1 RED `internal/sync/changed_fields_test.go`: `TestDerivesSingleChangedField`, `TestDerivesEmptiedCollection`, `TestNoOpWriteDerivesEmptyList`, `TestReorderedCollectionIsNotAChange` — table-driven over base/desired JSON pairs. Assert the empty case yields an empty list, never nil. Command: `go test ./internal/sync -run TestDerives`.
- [x] 2.2 GREEN add `changed_fields_json TEXT NULL` to `anime_changed_outbox` through the existing migration path (`internal/sync/schema_tables.go:22` registers it as create-only, so follow the `vocabulary_migration_tables.go` precedent rather than editing the create DDL alone).
- [x] 2.3 GREEN create the derivation helper in `internal/sync`: shallow top-level comparison over the two canonical snapshots, returning a sorted, stable, non-nil list.
- [x] 2.4 GREEN wire it into `insertAnimeChangedOutbox` (`internal/sync/write_base_finalize.go:32-33`) — the transaction already holds both snapshots on `operation`.
- [x] 2.5 RED then GREEN `internal/sync/write_base_lifecycle_test.go`: the outbox drain (`write_base_lifecycle.go:190`) reads `changed_fields_json` and populates `events.AnimeChangedEvent.ChangedFields`; a NULL column yields an empty list, matching today's behavior exactly.
- [x] 2.6 RED then GREEN assert end to end that `changelog.changed_fields_json` is no longer `[]` for a real single-field write — this is the row the incident produced, and it is the regression that matters.
- [x] 2.7 MUTATE run `ditto staged`. Mutants that make the derivation return nil, return every field, or skip the empty-collection case MUST die.
- [x] 2.8 **Correction to this task as originally written.** It said "verify no producer signature changed". That was too absolute and it is wrong: deriving the value at the outbox insert is decision D-1, but *carrying* it to the published event necessarily widens the transport. Verified in production wiring — `newAnimeWriteDeps` (`app_runtime_services.go:221-226`) does **not** set `Publisher`, so `publishCommitted` falls through to `PublishCommitted` and the outbox drain (`internal/anime/store/outbox.go:38`) is the live publication path. D-1's seam is therefore correct. The remaining wiring widens `PublishChanged`/`PublishCommitted` from 3 to 4 arguments plus the `committedAnimePublisher` interface. The distinction that still holds, and that matters: no producer *decides* the value, it only forwards a value the transaction derived.
- [x] 2.9 Widen the transport: `AnimeChangedOutboxEvent.ChangedFields`, `PublishChanged`, `PublishCommitted`, `committedAnimePublisher`, and the three `publishCommitted` methods. **Exceeds the 400-line review budget on its own — confirm delivery strategy before starting (see 4.1).**

## Phase 3: Slice C — closed vocabulary, honest domains, coverage

- [x] 3.1 RED `internal/logger/event_type_test.go`: assert the declared constants exist and that the four sync spellings currently in the tree (`sync`, `sync.reconcile`, `sync.changelog`, `reconcile`) collapse to their intended buckets. Write expected values as literals, never by referencing the constant under test.
- [x] 3.2 GREEN declare the `EventType` vocabulary as typed constants in `internal/logger/logger.go`; migrate the 15 existing `Logf` call sites onto them.
- [x] 3.3 RED then GREEN the vocabulary guard: a test that scans production `Fields{...EventType: ...}` literals and fails on any value outside the declared set. Prove it fails by introducing one free-text value, then remove it.
- [x] 3.4 RED `internal/tracerbullet/runner_test.go`: `TestRecordUsesDeclaredDomainNotMessagePrefix` — a message containing `": "` must not influence the recorded domain.
- [x] 3.5 GREEN change `Runner.record` (`internal/tracerbullet/runner.go:79-84`) to take an explicit domain; drop the `strings.SplitN` domain derivation. Re-read `openspec/specs/tracer-bullet-wiring` and confirm no scenario there constrains event labelling; record the confirmation in the verify report.
- [x] 3.6 GREEN mark tracer-bullet events as synthetic so rollups can exclude them; add the exclusion to the coverage query.
- [x] 3.7 RED then GREEN the coverage measure: committed real-entity anime writes that emitted a matching runtime event, over committed real-entity anime writes. Assert a seeded silent write path lowers it and that synthetic traffic does not raise it.
- [x] 3.8 MUTATE run `ditto staged`. The mutant that removes the synthetic-entity exclusion MUST die — that exclusion is the whole point of the ratio.

### Slice C notes

- **P-3 was wrong and is corrected in `proposal.md` section 1.4.** The claimed "four spellings for one area" came from a grep that included test files and non-emission matches. The real production vocabulary is uniformly `domain.verb` with exactly ONE outlier: `"notification"` in `internal/notification/log_forward.go:55`, now `"notification.forwarded"`. The event-type work is therefore prevention against future drift, not cleanup of present damage. Said plainly rather than left standing.
- **Deviation from task 3.2 as written, with reason.** The plan said "typed constants". Implemented as a SHAPE guard (`domain.verb`) instead, because `internal/download` emits its event types through a wrapper that takes the value as a parameter and generates 15+ `download.*` values at its call sites. A closed const registry would fight that design for no gain; the shape rule enforces what actually matters for grouping.
- **The guard is cache-safe, verified.** `TestEmittedEventTypesFollowTheDomainVerbShape` reads source files at runtime, which raised the question of whether Go's test cache would serve a stale PASS after unrelated source drifts. It does not: the cache tracks files a test opens and invalidates on change. Confirmed by priming the cache (second run reported `(cached)`), introducing the drift, and watching an un-forced run still FAIL.
- **The stage is data, the domain is a contract.** The tracer bullet no longer parses its own prose at all: `record` takes the stage as a parameter, the sink still gets the `"stage: message"` sentence the Transactions view renders, and the log entry carries the stage as `Metadata["stage"]` under the fixed `tracer-bullet` domain.
- MUTATE (hand-run): domain-from-stage reintroduced -> `TestRunnerDoesNotDeriveDomainFromMessageProse`; synthetic entity id dropped -> `TestRunnerMarksItsEntriesSynthetic`; event type dropped -> same; vocabulary drift reintroduced -> the shape guard. **One self-inflicted false negative worth recording**: a `perl -0pi` substitution without `/g` replaced the first occurrence in the file, which was in a comment, not the code � the mutant never applied and read as SURVIVED. Always diff to prove the edit landed.

### Task 3.7 notes � and ditto works, it was never broken

- **The `ditto staged` "stall" was a usage error, corrected.** `docs/mutation-testing.md` line 72 already said it: ditto takes ONE test command and does not derive it, so the default `./...` runs the whole ~45-package suite once per mutant, sequentially. Line 46 carries the working invocation. Bare `ditto staged` was run without reading the document `CLAUDE.md` rule 17 points at. Note rule 16 states the command as bare `ditto staged`, which is what was followed and is incomplete.
- **Working invocation for this repo:** `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./<owning-package>/"`. Keep `-json`: without it a mutant that never compiled returns reason `unknown`, which counts as a KILL, and the score is the one number that does not move either way.
- **What the MUTATE step actually bought here, run properly:** first pass **0.31** (36 mutants, 11 killed). It found the CLI decision logic entirely unasserted, and then found that the synthetic-entity filter on the EVENT side of `ComputeCoverage` was **dead logic** � removing it left all twelve tests passing, because excluding synthetic entities from the denominator already makes a synthetic observation unreachable. Simplified rather than tested. Final **0.91**.
- Three survivors remain, all inside `func main()`'s flag wiring (`-threshold` default, the post-`run` error branch). A test cannot call `main`; these are the documented not-a-real-gap category.
- **Measured against the live database: 0.00 coverage, 0 of 32 written anime emitted an `anime.write` event.** That is Finding 1 of the debugging report as a number rather than a narrative, and it confirms the code reading: the live publication path is the outbox drain, which does not log.

## Phase 4: Slice D — dimension-carrying emission API

- [x] 4.1 Decision gate: re-forecast before starting. Slice D touches 41 call sites; confirm `delivery_strategy` with the current budget before any edit.
- [~] 4.2 CANCELLED � REFACTOR switch `tools/checktruncation` from structural intent inference to the derived changed-field set from slice B. Its three test scenarios must pass unchanged — the contract is the same, only the intent source is exact now.
- [x] 4.3 RED `internal/logger/fanout_test.go` and siblings: assert a dimension supplied through a convenience method reaches the entry, for each of the three `Logger` implementations.
- [x] 4.4 GREEN remove the hard-coded `Fields{}` from the nine sites (`fanout.go:42,47,52,57`, `mem.go:37,42,47,52`, `stdout.go:27,32,37,42`), keeping the existing four-method signatures working for every current caller.
- [x] 4.5 GREEN migrate the highest-value printf call sites onto dimensions, prioritising `Warnf` (19 sites) since warnings are the ones a health rollup reads.
- [x] 4.6 MUTATE run `ditto staged`.
- [x] 4.7 REFACTOR `go run ./tools/checkgofilesize` and full `go test ./...`.

### Slice D notes

- **Task 4.2 is cancelled, with reason.** The plan said switching `checktruncation` to the derived changed-field set would turn its structural inference "into a precise declared-vs-actual comparison". That is wrong, twice over. First, the derived set is computed FROM the two snapshots, so declared and actual are the same value by construction and there is nothing to compare � the derivation eliminates the discrepancy rather than exposing it. Second, and decisively: the derived list only exists on rows written after slice B, so a detector reading it would go blind to every historical row � which is exactly where the eight real findings live. The detector keeps computing its own diff. Follow-up if exact intent is ever needed: persist the patch's own `Present`/`Clear` flags, which are the only true statement of intent and are currently discarded at the service boundary.
- **Task 4.4 as written was not implementable and the intent was served differently.** It said "remove the hard-coded `Fields{}` from the nine sites, keeping the existing four-method signatures working". Those two clauses contradict: `Infof(domain, format string, args ...any)` has nowhere to put a dimension without changing its signature. Rather than double the API with `InfofWith`-style siblings, the call sites that HAVE a dimension move to `Logf`, and the four convenience methods stay as the deliberate no-dimension path. `Logf` already existed for exactly this.
- **A real defect was found while auditing the call sites.** `internal/api/handlers/websocket_handler.go:105` called `Logger.Warnf("websocket incoming message failed for %s: %v", device.DeviceID, err)`. The signature is `Warnf(domain, format string, args ...any)`, so the whole sentence was passed as the DOMAIN and the device id as the format string. Every such entry landed in `runtime_events` with a prose domain and a message that was just an id plus format residue. Same defect class as the tracer bullet deriving a domain from prose, and invisible for the same reason: nothing asserts a domain. Fixed by extracting three emitters into `websocket_logging.go`, each declaring its domain, entity id, and `domain.verb` event type.
- MUTATE via `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/api/handlers/"`: 4 mutants, 3 killed, score 0.75. **One survivor accepted with reason**: `websocket_handler.go:100` inverting `err != nil` in `serveWebSocketMessages`. Killing it needs a live `*websocket.Conn` and there is no websocket test harness in this repo; the branch is a one-line call to `logIncomingWebSocketMessageFailure`, which is itself fully tested, and the mutant's effect is logging on success � noisy, not corrupting. Building a socket harness for it is not proportionate.

## Phase 5: Documentation and closure

- [x] 5.1 Update `docs/reports/debugging-metrics-report.md` with a short status header noting which findings this change closed and that Finding 2 was a producer gap, not a storage gap.
- [x] 5.2 Mark `docs/mcp-event-visibility-report.md` as historical, naming the three fixes that landed and where (drift record in `proposal.md` section 2).
- [x] 5.3 Append one lesson with `node scripts/log-lesson.mjs "..."` — the lesson is that a declared field list nobody is forced to fill will be empty, so derive it where both states are already in hand.
- [x] 5.4 Announce the wire-adjacent change: `AnimeChangedEvent.ChangedFields` becomes populated for the first time. Mobile consumers read this envelope; note it in `docs/openapi.yaml` even though no field shape changes.
- [x] 5.5 Final verification by the orchestrating agent itself, then create the commit — commit-time hooks are part of the verification boundary.

### Slice B notes

- **A test double with the old signature silently disables the feature, it does not fail loudly.** `startupRecoveryWriter.PublishCommitted` still had the 3-argument shape, so `s.writer.(committedAnimePublisher)` stopped matching and `publishCommitted` fell through to doing nothing. `TestAppStartupRecoversStagedWritesBeforeEvents` caught it, but note that `WriteService.RecoveryConfigured()` gates on the same assertion: a stale double there turns recovery off rather than erroring.
- **MUTATE, hand-run again (`ditto staged` still stalls copying `frontend/dist`).** Three wiring mutants, one of which SURVIVED at first and exposed a real gap: `unmarshalDerivedChangedFields` returning nil for a NULL column killed nothing, because every existing test stored `"[]"` and none exercised the pre-migration NULL branch -- the exact compatibility the design promises. Added `TestWriteOperationOutboxReadsPreMigrationRowAsEmptyList`; the mutant now dies. Final: finalize-stores-empty-instead-of-derivation -> the two finalize tests; drain-drops-changed-fields -> `TestDrainOutboxDeliversDerivedChangedFields`; NULL-decodes-to-nil -> the pre-migration test.
- **Consumer announcement done as part of this unit** (task 5.4), not deferred: `AnimeChange.changed_fields` and the `anime_changed` WebSocket notice have shipped as `[]` since they were introduced and now carry values. Shape is unchanged; the note is in `docs/openapi.yaml` under 2026-08-30.
