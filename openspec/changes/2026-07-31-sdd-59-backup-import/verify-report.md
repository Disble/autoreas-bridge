# Verify Report — SDD-59 Backup Import

### Verdict

PASS

Verified by the orchestrating agent directly, not delegated (AGENTS.md "Delegation and
Verification Guardrails"). Covers all four slices: 59a (verify/preview/apply core), 59b
(owner-side import functions + restore point), 59c (Wails binding), 59d (frontend import section).

## Gates (run by the orchestrator, actual output)

| Gate | Result |
|---|---|
| `go build ./...` | Clean |
| `go test ./...` (cache cleared) | All packages pass |
| `go vet ./...` | Clean |
| `gofmt -l .` | Empty |
| **`scripts/lint.ps1 -Profile all`** | **0 issues** (both passes) — this is the real gate, a superset of `golangci-lint run` adding `dlinter` and `gocognit` |
| `go run ./tools/checkgofilesize` | "Go file size check passed." |
| `go run ./tools/checkarchitecture` | Clean |
| `bun --cwd=frontend run test` | 164 files / **1379 tests** passed |
| `bun --cwd=frontend run validate` | 0 errors (5 pre-existing warnings in untouched files) |
| `git diff docs/openapi.yaml` | Empty — unchanged, as specified |

## Architecture invariant verified independently

`go list` on `./internal/backup/` returns **zero `autoreas-bridge/...` imports** after adding
verification, preview, apply, and version notes. The package still knows no table, column, or
domain type. No linter enforces this — it is convention-held and was checked by hand.

The seam remained a function type plus an `ImportGroup` struct. No `Registry`, no
`RestorePointMaker` port, no `Importer` interface, no `checkarchitecture` rule was reintroduced.
`CreateRestorePoint` lives in `internal/sync`, which owns the database handle.

## Mutation verification

Orchestrator-verified personally:

| Guard | Test | Mutation | Result |
|---|---|---|---|
| Omission is not deletion | `TestAbsentGroupIsLeftUntouched` | `if !ok {` → `if !ok && false {` in `Apply`'s loop | FAILED as required |
| Restore-point abort | `TestRestorePointFailureAbortsWithZeroGroupWrites` | Deleted the error return after `CreateRestorePoint` | FAILED as required — "expected an error when the restore point fails" |

Note: a first attempt at the omission mutation hit the `ok` in `Preview` instead of `Apply` and
broke compilation. A mutation that does not compile proves nothing; it was redone surgically.

Agent-verified, reported with exact failure messages:

| Guard | Mutation | Result |
|---|---|---|
| `TestConfirmWithoutMatchingPreviewIsRefused` | Deleted the checksum comparison | FAILED |
| Frontend double-confirm in-flight guard | Deleted the guard | FAILED |
| Frontend confirm-requires-preview guard | Deleted the guard | FAILED |
| `summarizeImportPreview` absent-groups branch | Deleted the branch | FAILED — untouched groups rendered as carried |

Every mutation was reverted and the suite re-confirmed green.

## The Wails finding — a real bug caught during implementation

**Wails v2 discards a bound method's resolved struct whenever that method also returns a
non-nil `error`.** The frontend promise rejects with the error's string message only.

Design.md specified `ConfirmBackupImport (BackupImportResult, error)`, which is correct — but
returning `applyErr` as the Go error on a **partial group failure** would have dropped
`RestorePointPath`, `FailedGroup`, and the committed/unattempted breakdown on precisely the case
where the user needs them most, contradicting the spec's requirement that a failed import make
the restore point available.

Resolution: once the restore point exists, `ConfirmBackupImport` returns a **nil** Go error and
reports partial/total apply failure through `BackupImportResult.ErrorMessage` / `FailedGroup`.
A real Go error is reserved for gate failures *before* the restore point exists — no matching
preview, checksum mismatch, restore-point creation failure — where there is nothing structured
to report. Recorded in `docs/learning-log.md` as a rule for any future binding that must return
partial-outcome plus failure detail together.

## Spec conformance

- Preview writes nothing and creates no restore point.
- Apply is unreachable without a matching preview (checksum-matched pending state, cleared on
  every confirm so a second confirmation cannot replay against a changed database).
- Newer `formatVersion` refused with zero writes and no restore point.
- **Omission is not deletion** — a group absent from the manifest is left completely untouched.
- **A group present with `recordCount: 0` does empty its table** — the complement, kept distinct.
- Full refresh per group in its own transaction; never one shared `*sql.Tx`.
- Import streams; neither `ListSnapshots` nor `ReplaceBaseline` is used.
- Restore point created after confirm, before the first group commit; its failure aborts with
  zero group writes.
- On group failure: remaining groups abandoned, DB usable, restore point path surfaced, no
  auto-restore.
- Desktop only: no REST route, no WS event, `openapi.yaml` unchanged.

## Drift recorded (code wins)

1. `ConfirmBackupImport` error semantics — see the Wails finding above. Design.md's signature
   stands; the error *policy* changed for a verified runtime reason.
2. `@heroui/react` at this repo's pinned version has no `Divider` export. The established
   separator convention is a plain element with the `border-divider` Tailwind token.
3. Two hooks narrowed their `BackupSource` parameter to `Pick<...>` aliases in their own
   `*.types.ts` (dlinter forbids inline type aliases in hooks) after widening `BackupSource`
   broke the existing export hook's test fake.
4. `backup.Apply` already re-verifies the bundle on every call, so the binding needs no separate
   re-verification step.

## Known repo issues surfaced, not fixed here

- `fallow audit` exits 1 on pre-existing repo debt independent of this change. The only finding
  naming a file created here is a structural clone-detection match on `backup-source.types.ts`
  — a flat readonly-field DTO whose shape coincidentally matches unrelated interfaces
  (`SelectionRow`, `NetworkDetailViewModel`); the same pattern appears ~40x pre-change. Reported
  honestly rather than forced into an artificial fix.
- One genuine duplicate was caught and fixed during implementation: a `BackupImportGroupDTO`
  duplicating the existing `BackupGroupResultDTO`. This is the same class of defect that reached
  verification in SDD-58.
- `HosterPriorityEditor.tsx` still uses `react-aria-components`' `useDragAndDrop` (native HTML5
  DnD), forbidden by AGENTS.md rule 11 for WebView2 — why hoster reorder is broken and why
  `download_hoster_priority` remains out of backup scope.
- `AGENTS.md` references `docs/sdd-tree.md` and `docs/autoreas-bridge-design-doc.md`; an ESLint
  rule references `docs/dlinter-vitest-mock-hygiene-proposal.md`. None of the three exist.
