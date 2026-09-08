# Verify Report — mobile-log-ingestion

Date: 2026-09-08
Verified by: the orchestrating agent directly, not delegated
(`CLAUDE.md` #3 requires final verification to be performed by the
orchestrator itself).

## Result: PASS

All four work units are implemented, committed on `dev`, and every gate ran
green. 42 of 42 tasks are complete.

## Commits

| Unit | Commit | Changed lines | Mutation score |
| --- | --- | --- | --- |
| 1 Storage | `867caa4` | 1035 | 0.98 |
| 2 Validation | `2b5d826` | 852 | 1.00 |
| 3 Endpoint | `4eba67a` | 395 | 1.00 |
| 4 Contract + docs | `7168d33` | 419 | n/a — see below |

Unit 4 produced no mutants and that is correct, not a coverage gap: its only
production change is a struct field declaration with a doc comment, which has
no executable branch to mutate.

## Requirement coverage

Each spec requirement mapped to the tests that hold it.

| Requirement | Tests |
| --- | --- |
| Authenticated Ingest With Closed-Vocabulary Validation | `TestSyncDiagnosticsRequiresBearerToken`, `TestSyncDiagnosticsUsesTokenDeviceIDNotBody`, `TestValidateRejectsOffVocabularyValue`, `TestValidateRejectsUnknownField`, `TestValidateRejectsTopLevelTriggerSourceLocalMutation`, `TestValidateAcceptsPreviousTriggerSourceLocalMutation` |
| Shape-Constrained Fields Are Bounded, Not Enumerated | `TestValidateAcceptsDigitLeadingErrorFingerprint`, `TestValidateNativeErrcodeByteBounds`, `TestValidateRejectsAdversarialPayload` |
| `recent_events` And `previous_cycle` Wire Shape | `TestValidateRecentEventsCapAt32`, `TestValidateRecentEventsReserializedDropsInjectedField`, `TestValidateRejectsMissingPreviousCycleKey`, `TestValidateAcceptsExplicitNullPreviousCycle`, `TestValidateAcceptsPreviousCycleWithOnlyOutcome`, `TestInsertReportPreviousCycleFieldsNullable` |
| `degraded` Records What Is Absent | `TestValidateRejectsMissingDegradedKey`, `TestValidateRejectsNonStringDegradedValue` |
| Insert Is Idempotent By `cycle_id` | `TestInsertReportDuplicateCycleIDReturnsDuplicateAndNoSecondRow`, `TestSyncDiagnosticsDuplicateAcks204` |
| Write Budget Bounds The Database Call, Not The Response | `TestInsertReportShedsUnderHeldConnection`, `TestSyncDiagnosticsShedReturns503WithRetryAfter`, `TestSyncDiagnosticsShedNeverReturns204` |
| Retention Caps Table Growth | `TestPrunesOnFirstWriteOfProcess`, `TestPrunesOnCadenceNotOnEveryWrite`, `TestRetentionHoldsRowCountUnderSustainedWrites` |
| Reconcile Compatibility And Documentation | `TestReconcileStillAcceptsClientTelemetry`, `TestReconcileResponseUnchanged` |
| Cutover Signal Is A Floor, Not A Census | none — documentation only, see below |

**Two requirements are deliberately untested, and both are correct as such:**

- *Cutover Signal Is A Floor, Not A Census* defines how to read a delivery
  metric. It constrains a human's interpretation, not code behaviour.
- The `degraded` **absence invariant and shed ordering** are a two-sided
  contract about what the CLIENT does before sending. The bridge cannot
  observe the difference between a shed piece and an absent one, which is
  precisely why the invariant is worded as "absent, shed or never present".
  What is testable here — the key being required and the value being a member
  or null — is tested.

## Evidence

- `go test ./...` — full suite, 0 failures.
- `powershell -File scripts/lint.ps1 -Profile all` — `0 issues.` on **both**
  profiles. A bare `golangci-lint run` is not sufficient here and reports
  clean while the gate fails; see the note in `lefthook.yml`.
- Full pre-commit gate ran on each of the four commits, exit 0, nothing
  skipped with `--no-verify`.
- `go run ./tools/checkopenapi` — passed. **See the defect below: this gate
  proves far less than it appears to.**
- `go run ./tools/checkgofilesize` — passed. `internal/api/handlers/sync_handler_test.go`
  now sits at 410 effective lines, over the 400 warning threshold and under
  the 500 hard limit. Warning only; worth splitting if it grows.

## The load-bearing test

`TestInsertReportShedsUnderHeldConnection` implements the full four-step
sequence: hold the single shared connection, assert `ErrWriteBudget` with
elapsed in range, **release the holder**, then **re-check the table and assert
the shed row never landed**. Steps 3 and 4 are the whole point — a
response-deadline implementation also returns at the budget and passes both a
status assertion and an elapsed assertion, and diverges only after the holder
releases. Verified present and intact in the committed code.

## Defect found during verification, recorded and NOT fixed here

`tools/checkopenapi/main.go:12` extracts routes with
`regexp.MustCompile("mux\\.Handle(?:Func)?\\(\"([^\"]+)\"")`, which matches
only a string literal as the first argument. `internal/api/router.go`
registers everything through a `[]route{...}` table and calls
`mux.HandleFunc(route.path, route.handler)` — a variable.

Measured: the gate sees **one** route (`/ws`) and is blind to **twelve**,
including `/api/devices/pair`, `/api/animes`, `/api/status`,
`/api/sync/reconcile`, `/api/seasons/active/ratings` and this change's own
`/api/sync/diagnostics` — every REST endpoint mobile consumes. It has passed
since `router.go` moved to a table because it has nothing to check.

This matters beyond the tool: the rule that wire-adjacent changes MUST be
announced in `docs/openapi.yaml` exists because there are real mobile
consumers, and it has had no enforcement behind it for the whole REST surface.

Out of scope here. The fix is not a wider regex — that would be as brittle as
what it replaces — but a Go test in `internal/api` that walks the actual route
table and asserts each path appears in `docs/openapi.yaml`, which cannot drift
from the registration mechanism.

## Known limits of this change

- **Necessary but not sufficient.** The ack protects the client's re-mergeable
  event ring. It does not protect the post-mortem, whose loss window changes
  shape rather than closing. Only the mobile-side durable outbox closes that,
  and this endpoint is its prerequisite, not its substitute. That outbox has
  since shipped on the mobile side.
- **No MCP read tool.** The data is queryable in SQL but not through the
  operator's actual instrument — the same failure shape that motivated this
  change. Follow-on: `device-sync-diagnostics-read`.
- **Not released.** All four units are on `dev`. A release exists only after
  `dev` merges to `main` and a tag ships an installer, so mobile still
  receives `404` until then. Its outbox preserves rows on `404`, so nothing is
  lost that the queue cap would not have evicted anyway.

## Next

`sdd-archive`.
