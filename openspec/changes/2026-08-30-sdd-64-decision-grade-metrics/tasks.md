# Tasks: Decision-Grade Metrics (SDD-64)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 620-820 |
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

- [ ] 2.1 RED `internal/sync/changed_fields_test.go`: `TestDerivesSingleChangedField`, `TestDerivesEmptiedCollection`, `TestNoOpWriteDerivesEmptyList`, `TestReorderedCollectionIsNotAChange` — table-driven over base/desired JSON pairs. Assert the empty case yields an empty list, never nil. Command: `go test ./internal/sync -run TestDerives`.
- [ ] 2.2 GREEN add `changed_fields_json TEXT NULL` to `anime_changed_outbox` through the existing migration path (`internal/sync/schema_tables.go:22` registers it as create-only, so follow the `vocabulary_migration_tables.go` precedent rather than editing the create DDL alone).
- [ ] 2.3 GREEN create the derivation helper in `internal/sync`: shallow top-level comparison over the two canonical snapshots, returning a sorted, stable, non-nil list.
- [ ] 2.4 GREEN wire it into `insertAnimeChangedOutbox` (`internal/sync/write_base_finalize.go:32-33`) — the transaction already holds both snapshots on `operation`.
- [ ] 2.5 RED then GREEN `internal/sync/write_base_lifecycle_test.go`: the outbox drain (`write_base_lifecycle.go:190`) reads `changed_fields_json` and populates `events.AnimeChangedEvent.ChangedFields`; a NULL column yields an empty list, matching today's behavior exactly.
- [ ] 2.6 RED then GREEN assert end to end that `changelog.changed_fields_json` is no longer `[]` for a real single-field write — this is the row the incident produced, and it is the regression that matters.
- [ ] 2.7 MUTATE run `ditto staged`. Mutants that make the derivation return nil, return every field, or skip the empty-collection case MUST die.
- [x] 2.8 **Correction to this task as originally written.** It said "verify no producer signature changed". That was too absolute and it is wrong: deriving the value at the outbox insert is decision D-1, but *carrying* it to the published event necessarily widens the transport. Verified in production wiring — `newAnimeWriteDeps` (`app_runtime_services.go:221-226`) does **not** set `Publisher`, so `publishCommitted` falls through to `PublishCommitted` and the outbox drain (`internal/anime/store/outbox.go:38`) is the live publication path. D-1's seam is therefore correct. The remaining wiring widens `PublishChanged`/`PublishCommitted` from 3 to 4 arguments plus the `committedAnimePublisher` interface. The distinction that still holds, and that matters: no producer *decides* the value, it only forwards a value the transaction derived.
- [ ] 2.9 Widen the transport: `AnimeChangedOutboxEvent.ChangedFields`, `PublishChanged`, `PublishCommitted`, `committedAnimePublisher`, and the three `publishCommitted` methods. **Exceeds the 400-line review budget on its own — confirm delivery strategy before starting (see 4.1).**

## Phase 3: Slice C — closed vocabulary, honest domains, coverage

- [ ] 3.1 RED `internal/logger/event_type_test.go`: assert the declared constants exist and that the four sync spellings currently in the tree (`sync`, `sync.reconcile`, `sync.changelog`, `reconcile`) collapse to their intended buckets. Write expected values as literals, never by referencing the constant under test.
- [ ] 3.2 GREEN declare the `EventType` vocabulary as typed constants in `internal/logger/logger.go`; migrate the 15 existing `Logf` call sites onto them.
- [ ] 3.3 RED then GREEN the vocabulary guard: a test that scans production `Fields{...EventType: ...}` literals and fails on any value outside the declared set. Prove it fails by introducing one free-text value, then remove it.
- [ ] 3.4 RED `internal/tracerbullet/runner_test.go`: `TestRecordUsesDeclaredDomainNotMessagePrefix` — a message containing `": "` must not influence the recorded domain.
- [ ] 3.5 GREEN change `Runner.record` (`internal/tracerbullet/runner.go:79-84`) to take an explicit domain; drop the `strings.SplitN` domain derivation. Re-read `openspec/specs/tracer-bullet-wiring` and confirm no scenario there constrains event labelling; record the confirmation in the verify report.
- [ ] 3.6 GREEN mark tracer-bullet events as synthetic so rollups can exclude them; add the exclusion to the coverage query.
- [ ] 3.7 RED then GREEN the coverage measure: committed real-entity anime writes that emitted a matching runtime event, over committed real-entity anime writes. Assert a seeded silent write path lowers it and that synthetic traffic does not raise it.
- [ ] 3.8 MUTATE run `ditto staged`. The mutant that removes the synthetic-entity exclusion MUST die — that exclusion is the whole point of the ratio.

## Phase 4: Slice D — dimension-carrying emission API

- [ ] 4.1 Decision gate: re-forecast before starting. Slice D touches 41 call sites; confirm `delivery_strategy` with the current budget before any edit.
- [ ] 4.2 REFACTOR switch `tools/checktruncation` from structural intent inference to the derived changed-field set from slice B. Its three test scenarios must pass unchanged — the contract is the same, only the intent source is exact now.
- [ ] 4.3 RED `internal/logger/fanout_test.go` and siblings: assert a dimension supplied through a convenience method reaches the entry, for each of the three `Logger` implementations.
- [ ] 4.4 GREEN remove the hard-coded `Fields{}` from the nine sites (`fanout.go:42,47,52,57`, `mem.go:37,42,47,52`, `stdout.go:27,32,37,42`), keeping the existing four-method signatures working for every current caller.
- [ ] 4.5 GREEN migrate the highest-value printf call sites onto dimensions, prioritising `Warnf` (19 sites) since warnings are the ones a health rollup reads.
- [ ] 4.6 MUTATE run `ditto staged`.
- [ ] 4.7 REFACTOR `go run ./tools/checkgofilesize` and full `go test ./...`.

## Phase 5: Documentation and closure

- [ ] 5.1 Update `docs/reports/debugging-metrics-report.md` with a short status header noting which findings this change closed and that Finding 2 was a producer gap, not a storage gap.
- [ ] 5.2 Mark `docs/mcp-event-visibility-report.md` as historical, naming the three fixes that landed and where (drift record in `proposal.md` section 2).
- [ ] 5.3 Append one lesson with `node scripts/log-lesson.mjs "..."` — the lesson is that a declared field list nobody is forced to fill will be empty, so derive it where both states are already in hand.
- [ ] 5.4 Announce the wire-adjacent change: `AnimeChangedEvent.ChangedFields` becomes populated for the first time. Mobile consumers read this envelope; note it in `docs/openapi.yaml` even though no field shape changes.
- [ ] 5.5 Final verification by the orchestrating agent itself, then create the commit — commit-time hooks are part of the verification boundary.
