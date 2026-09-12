# Verify Report — SDD-67 Keymap In Backups

**Verdict: PASS**, with one obligation only a human can discharge, named below rather than inferred
from a green suite. Verified by the orchestrating agent directly, not delegated (CLAUDE.md #3).

The keymap now travels in backup bundles as a fourth group, `keyboard_keymap`, and a restored keymap
reaches the running dispatcher without a restart. All 42 tasks closed across three slices.

## Evidence

| Check | Result |
|---|---|
| `go test ./...` | clean |
| `go vet ./...`, `gofmt -l` | clean |
| Frontend suite | **2672 passed / 2672**, 296 files |
| golangci-lint, both profiles | 0 issues |
| `fallow audit` | exit 0 |
| `checkgofilesize` | passed, baseline still `files: []` |
| `render:smoke` | the production bundle paints on every checked route |
| `git diff --stat -- docs/openapi.yaml` | empty — desktop-only Wails surface, no wire change |
| `wails build` | exit 0 → `build/bin/autoreas-bridge.exe`, 21 MB, 18s |
| `wails dev` | starts and serves; see the caveat below |
| Mutation | `internal/settings` 1.00; `internal/desktop` and the constants file report 0 mutants, legitimately — a struct-literal wiring line and a Stryker-skipped `.constants.ts` |

**`wails dev` caveat, stated rather than glossed.** Two runs both compiled, generated bindings, served
assets on 34115/5174 and exited 0 with no error — but from a backgrounded launch the WebView2 window
closes immediately, so the app's own Go runtime never logs past `Serving assets`. I could not observe
the event bus and HTTP listener lines that SDD-62's report recorded. That is a limitation of how this
session can launch a GUI process, not a finding about the change. It also does not weaken the
verdict, because per CLAUDE.md 18b a healthy Go startup log was never the proof that the UI paints —
`render:smoke` is, and it passed.

## Requirements → what proves them

| Requirement | Proof |
|---|---|
| Export carries the document verbatim | `backup_export_test.go`. Present-but-empty needs no branch: `backup.Export` creates the data entry and appends the `ContextEntry` **before** consulting the count, so `return 0, nil` yields a present group with `recordCount: 0` by construction of the seam |
| Import writes only its own key | `TestImportingKeymapOnlyBundleLeavesOtherAppSettingsKeysUntouched`. It cannot pass vacuously: it fails if the snapshot captured zero rows, and it requires the keymap to actually have changed, so a no-op import cannot pass by leaving everything alone. It never names the other keys |
| A present-but-empty group resets to defaults | `TestImportKeymapHandlesUpsertResetOpaqueBytesAndRejection`'s zero-records row. Zero records is `SetKeymap(ctx, "")`, never a skip |
| An absent group leaves the keymap untouched | `TestImportedKeymapGroupOutcomesByPresence` |
| An unknown group is ignored with a warning | `TestPreviewOfKeymapCarryingBundleOnAnOlderImportGroupsSliceReportsItAsUnknown`, driven through `importGroups()[:3]` to simulate a pre-SDD-67 build. No `formatVersion` change |
| A restored keymap reaches the running dispatcher | `use-backup-import.keymap-refresh.test.ts`, the only proof that matters and the one the plan refused to accept as "a loader was called" |
| An importer modifies only its declared footprint | `app_backup_import_footprint_test.go`, plus its deliberate inversion |
| Go owns no chord grammar | `ValidateKeymap`/`ImportKeymap` decode the envelope and never read `Document`; the opaque row round-trips `{not json: alt++` |

## What the orchestrator verified by breaking production, not by reading diffs

Every claim below was re-run here, not taken from a slice's report. Each file ended at zero diff.

| Break | Result |
|---|---|
| `use-backup-import.ts`: disable the reload guard | The e2e proof fails with a real diff — the store still holds `command-a`. The requirement's only genuine proof is non-vacuous |
| `backup_import.go`: `count > 1` → `count > 2` | Killed by the rejection row alone |
| `use-backup-import.ts`: `.some()` → `.every()` | Still killed by the multi-group case, proving the redundant sole-group case's removal did not resurrect it |
| `use-keymap-overrides.ts`: delete the loader call | Fails 2 of the 3 surviving hook tests |
| `use-keymap-overrides.ts`: `[source]` → `[]` | Fails **only** the re-render test — which is exactly why that case stays and the three deleted outcome cases were provably redundant |
| `backup_import.go`: `SetKeymap(document)` → `document+"-BROKEN"` | The footprint guard fails naming the exact field: `footprint field "keyboard.keymap": want "state-a", got "state-a-BROKEN"` |
| Delete the real `keyboard_keymap` entry from the declared-footprint map | Both the guard and its inversion fail; the inversion reports `[keyboard_keymap synthetic_undeclared_group]` where it expected only the synthetic one |

**The footprint guard's two-state step is load-bearing and was proved so, not asserted.** A
deliberately broken no-op importer run through the guard *with* the mutate-to-B step FAILS; the same
broken importer run *without* it — state A throughout, which is what "export from the live DB and
import back into it" looks like — PASSES vacuously. The fixture also updates the same primary keys
rather than inserting rows, because a distinct key would satisfy "everything outside the footprint is
unchanged" by construction.

## The over-engineering episode, and the rule it changed

Slice 2 landed at 884 changed lines against a 600 cap. **The orchestrator classified that as
legitimate test volume and stopped the chain for a maintainer decision. Both halves were wrong**, and
the repository maintainer corrected them: the cap already counts the strict-TDD and mutation tests, so
"the tests were the miss" is priced in and cannot explain an overrun — what remains is
over-engineering, which is refactored, and the SDD continues rather than blocking.

The diff held exactly that. One setup→act→assert shape hand-copied four times where a table belonged;
`Partial`-override builders written for a single call site; a mocked positive case re-proving wiring
the end-to-end test already proved through the real observable. The first cleanup pass then introduced
its own — a `checkCount bool` beside a `wantCount int`, a seven-argument positional helper, and a
twelve-line comment restating four row names — and was sent back.

**Measured outcome, and it corrects the rule as first written:** 864 lines of test code became 813, a
real 51 removed with every mutant re-verified as still dying, while the changed-line count moved only
884 → 881. The metric counts insertions **plus** deletions, so removing lines from existing files
registers as deletions and cannot bring a landed slice's number down. Judge such a refactor by
`wc -l`; **the cap is a pre-commit discipline — the lines must not be written, not removed later.**
That also separates two acts the orchestrator had fused: the refactor discharges the engineering debt,
and a maintainer reset is what lets the next work unit open. Recorded in CLAUDE.md #22, AGENTS.md →
"Sizing a Change", and the learning log (`0f8d32c`, `fcd665f`).

Slice 3 was planned under the corrected rule and closed at 503 against 800 on the first attempt.

## Corrections this chain made to its own inputs

Recorded because each one means an artifact was less true than the code.

| Correction | Why |
|---|---|
| The export scenario said the exported line "MUST equal the persisted document, byte for byte" | It contradicted design D1's envelope, and not harmlessly: a raw line cannot carry an arbitrary opaque document at all, since the round-trip already pinned in `internal/settings` persists `{not json: alt++`, which is not valid JSONL. The envelope is what makes "verbatim" achievable — the *document* survives unchanged, not the *line* being the document. Corrected in slice 1 |
| ADR-020 claimed a keymap "does not travel with a backup bundle" | Made false by this change. **Struck, not narrowed**, because its reasoning was wrong twice over: it justified the outcome by where the value is *stored* ("`app_settings` is machine-local"), when the question is whether the *value* is machine-local — and a chord preference is not. Storage location was never the argument; the exclusion list simply happened to be drawn at the table |
| ADR-010 §A: "the table ends up holding exactly the bundle's records" | False the moment a group is not a table. Amended in place, with the asymmetry noted: the other half, "omission is not deletion", *was* already tested |
| ADR-010's scope-guard test name | Stale after slice 2's rename. Its neighbouring prediction — that a fourth import group costs one function pair plus one line — turned out exactly right, which is recorded next to the fix |
| `CHANGELOG.md` had no entry for SDD-62 at all | The whole keymap-customization feature shipped without reaching the changelog. Added here alongside SDD-67's |

## Process notes

- A verification run of `internal/desktop` failed once, mid-refactor. It was not the change: the test
  ran against a half-written file while an agent was editing. Confirmed by re-running the exact
  command and the full suite, both clean. Recorded because a failure explained only by a plausible
  hypothesis is not a verified failure.
- Per-slice actuals against forecast: 271 against 180-260, 884 against 330-460, 503 against 270-390.
  The middle one is the finding above; the other two landed where planned.

## The one obligation a human owns

**Nothing here proves a real bundle round-trips through the packaged app.** Every frontend test runs
in jsdom against a mocked source, and the Go tests exercise the import groups directly without the
Wails bridge between them. This inherits SDD-62's still-open obligation and adds its own.

Run `build/bin/autoreas-bridge.exe`, rebind a command under Settings → Shortcuts, export a backup,
press Reset to defaults, then import that backup and confirm the rebound chord comes back **and
works immediately, without restarting**. Record the result here before archive, the way SDD-61's
WebView2 check was recorded rather than inferred.

## Commits

`b736aaa` proposal · `503c4b8` spec+design · `188c699` tasks · `269073f` slice 1 · `10ad152` slice 2 ·
`0f8d32c` sizing rule · `83ecde9` slice 2 refactor · `fcd665f` metric correction · `96fd930` slice 3 ·
`6c29b41` changelog

## Next step

`sdd-archive`. Archiving promotes `backup-keymap-group` to a main spec and merges the
`backup-import-export` delta into the spec SDD-59 archived.
