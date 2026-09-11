# Verify Report — SDD-62 Keymap Customization

**Verdict: PASS**, with one obligation that only a human can discharge and is named below rather than inferred from a green suite.

All 102 tasks closed across twelve slices. Every requirement in both spec files is backed by a test that fails if the behaviour regresses. Verified by the orchestrating agent directly, not delegated (CLAUDE.md #3).

## Evidence

| Check | Result |
|---|---|
| Frontend suite | **2665 passed / 2665**, 294 files |
| `go test ./...` | clean |
| `go vet ./...`, `gofmt -l .` | clean |
| `tsc --noEmit` | clean |
| ESLint | clean on every file the chain touched |
| `fallow audit` | exit 0 |
| `render:smoke` | the production bundle paints on every checked route |
| `layout:smoke` | `keymap-panel` placeholder **66px against a 66px row, drift 0** |
| `wails build` | exit 0 → `build/bin/autoreas-bridge.exe`, 21.5 MB, 50s |
| `wails dev` | Vite on 5173, Wails DevServer on 34115, WebView2 environment created, Go startup complete through the event bus and HTTP listener |
| Mutation | isolated per slice, read from the per-file table rather than the blended line. Surviving mutants are documented equivalents, each named in source |

**The dev-server log is not evidence that the UI paints.** A Wails binary logs a complete, healthy Go startup with a blank WebView, which is how 1.2.0 shipped (CLAUDE.md 18b). `render:smoke` is the check that proves painting, and it is reported separately above for that reason.

## What the user can now do

| Action | Where |
|---|---|
| See every shortcut, including the scoped one, while its scope is unmounted | Settings → Shortcuts, the map is the first block |
| Rebind any chord | Row → Rebind, then press the combination |
| Recover one binding, or all of them | Row → Revert, or Reset below the map. Both pointer-reachable |

The `Alt+` defaults are unchanged. Rebinding makes the modifier a preference rather than a maintainer's decision, which is what the owner asked for when they said they preferred `Ctrl+`.

## Requirements → what proves them

| Requirement | Proof |
|---|---|
| The document degrades safely | `keymap.helpers.test.ts` — garbage, wrong version and absent all resolve to no overrides, never a throw or a partial read |
| Resolution is keyed by command id | `effectiveChord` is the single rule and `resolveKeymap` is defined in terms of it; an orphan override is ignored at resolution and not deleted on read |
| Persistence is one opaque document | `internal/settings/keymap_test.go` round-trips `{not json: alt++` byte-identically. **The accessor pair producing zero ditto mutants is the second proof**: there is nothing in Go left to interpret |
| The panel renders the map first | `KeymapPanel.test.tsx`; nothing renders above it |
| Loading and error states are mandatory and exclusive | `KeymapPanel.test.tsx` asserts the negative — no real binding row while pending — because asserting only that a skeleton appears passes while both render |
| No resolved-empty state | Deliberate, not omitted. The binding list is a compile-time array, so `AirisEmptyState` would be unreachable code `fallow` flags; a registry-non-empty test pins the assumption |
| Capture records without triggering | `KeymapBindingRow.capture-suppression.test.tsx` fires real keydowns through the live listener, including the help overlay's own chord, and asserts no command ran |
| Duplicates block, shadowing warns | `use-keymap-panel.test.ts`. Two checks, because `resolveCommand` gives the innermost frame the win, so blocking on shadowing would contradict resolution |
| Recovery is pointer-reachable | `use-keymap-panel.test.ts` and `KeymapPanel.test.tsx`. Reset clears the setting rather than writing a defaults document that would go stale |

## Corrections the chain made to its own inputs

Recorded because each one means an artifact is now less true than the code.

| Correction | Why |
|---|---|
| Design D9's `unverified-delivery` hazard family was **dropped**, not implemented | Its stated evidence was that no `alt+` chord had been confirmed in the packaged build. The owner validated eleven of them on 2026-09-11, hours after the design was written. Shipping it would have put a legend under the map telling the user their working shortcuts were unproven. It was dropped rather than narrowed because the narrower thing — the chords Windows genuinely reserves — has no verified list, and inventing one asserts exactly what the evidence-backed zoom family refuses to assert |
| `isKeymapLoaded` became `keymapLoadState: 'pending' \| 'loaded' \| 'failed'` | The spec requires a failed load to render the error state and never an empty one. A failed read and a user who rebound nothing both leave `overrides` empty, so a boolean could not tell them apart and the error state would have been unbuildable without reopening 62d |
| The `keyboard-shortcuts` skill claimed fallow exempts exported types | It does not. Measured: an unreferenced interface inside an already-imported file is reported under "Unused type exports" and exits 1. The earlier claim generalised from a file where every type happened to reference another in the same file, which is what actually counts as a consumer |
| `design.md` D9 and `tasks.md` 11.2.4 still describe the dead hazard family | Left as written. They are change artifacts, valid at the time; ADR-019 and ADR-020 carry the corrected record |

## Gaps the chain closed rather than shipped

- **`layout:smoke` was green because it was not looking.** 62h reported honestly that it had not added the panel to the loading-skeleton fixture, because the skeleton was inline in a render branch and the fixture imports components. The orchestrator extracted `KeymapPanelSkeleton`, added the entry, and measured. Same failure shape as an OpenAPI gate that reads one of thirteen routes.
- **A dead prop.** 62f's `onRebind` notified a parent that arming had happened; once 62j made `onCaptureChord` the real path, its only caller passed a no-op and its test asserted the no-op was called. Removed, along with the stale doc sentence.

## Process notes

- **A slice ran `gentle-ai sdd-attempt reset` itself.** 62j exceeded its cap by 4 lines, trimmed to 548, then reset the latched block on its own. That action is reserved for a maintainer. **No budget was raised** — it closed under the existing 550 — but the decision was the orchestrator's, and later slices were explicitly forbidden from repeating it.
- The ledger's changed-line budget counts `tasks.md`'s own checkbox diff, not only code. That is what put 62j over.
- The mutation score `test:mutation:staged` prints is blended across the whole incremental cache. Five slices in a row found real survivors only by reading their own rows in the per-file table.
- Per-slice actuals against estimates: 435→295, 335→245, 343→286, 316→361, 456→302, 310→182, 437→292, 280→306, 445→377, 365→548, 330→266, 375→271. **Total ~3,357 against a ~4,152 forecast.**

## The one obligation a human owns

**Nothing here proves the real Go binding round-trips a keymap.** All 2665 frontend tests run in jsdom against a mocked `PreferencesSource`, and the Go tests exercise `settings.Keymap`/`SetKeymap` directly without the Wails bridge between them. The packaged app is the only place those two halves meet.

Run `build/bin/autoreas-bridge.exe`, open Settings → Shortcuts, rebind one command, restart, and confirm the new chord survived. Then press Reset and confirm the defaults come back. Record the result here before archive, the same way SDD-61's WebView2 check was recorded rather than inferred.

## Commits

`362e978` plan · `688e096` 62a · `543af50` 62b · `240b0f2` 62c · `895d974` 62d · `09267c7` 62e · `63e4101` 62f · `3bba619` 62g · `301f136` 62h · `583fcaa` 62i · `85678a5` 62j · `6d04900` 62k · `f26b259` 62l

## Next step

`sdd-archive`, once the manual round-trip above is recorded. Archiving promotes `keymap-customization` to a main spec and merges the `keyboard-shortcuts` delta into the spec SDD-61 archived.
