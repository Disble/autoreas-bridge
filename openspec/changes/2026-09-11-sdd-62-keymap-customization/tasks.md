# Tasks: Keymap Customization (SDD-62)

Change: `2026-09-11-sdd-62-keymap-customization`
Inputs: `proposal.md`, `design.md`, `explore.md` (this folder),
`specs/keymap-customization/spec.md` (**7 requirements / 18 scenarios**),
`specs/keyboard-shortcuts/spec.md` delta (**3 MODIFIED requirements**).

> **Drift note (CLAUDE.md #2 — code wins).** `proposal.md` R-1 and `design.md` §9 both record
> `openspec/specs/keyboard-shortcuts/spec.md` as **not existing** ("SDD-61 is unarchived"). That is
> now stale: `openspec/changes/archive/2026-09-10-sdd-61-keyboard-shortcuts/` exists, and
> `openspec/specs/keyboard-shortcuts/spec.md` is live on disk with all 7 requirements, matching the
> 3 headings this change's delta modifies verbatim. **R-1 is resolved** — the hard ordering
> dependency held and archive order was correct. No task in this file is blocked by it.

> **Re-read confirmed (design.md §9's own instruction).** Every file in `frontend/src/shared/keyboard/`
> cited by `design.md` was re-read from disk during this phase. All cited `file:line` anchors
> (`dispatch.helpers.ts:99-100`, `registry.helpers.ts:40-41`, `use-notification-keyboard-scope.ts:28`,
> `keyboard.types.ts`, `keyboard.constants.ts`, `keyboard-scope.helpers.ts`) match the design exactly —
> no further drift found. `internal/desktop/app_api_address.go` (the Go precedent design D5 cites) was
> also re-read: its `GetAPIAddress`/`SetAPIAddress` pair is 25 lines of pure accessor logic plus 47
> lines of unrelated `resolveAPIAddr`/`storedAPIAddr` startup-resolution logic that **Keymap has no
> equivalent for** (D5: Go stays a dumb pipe, no resolution). Slice 62c's Go estimate is priced off the
> 25-line accessor shape, not the full 96-line file.

---

## Task-Planning Notes (read before Slice 1)

**A. Method for the bottom-up estimate below.** Production figures start from `design.md` §5's
per-file table (already declaration-level). Test figures are NOT that table's numbers verbatim —
`design.md` §5 does not price tests separately from production for every file, and the orchestrator's
brief plus this repo's own SDD-61 evidence both state that under-costs tests. Test lines are priced
per file **kind**, off measured SDD-61 ratios: pure helper/type/constant files ≈ **1.2-1.3x** their
production lines (SDD-61 Slice 1's chord/scope primitives were never flagged as over forecast); a
React hook or store-wiring file ≈ **1.3-1.6x** (SDD-61 Slice 3 actual 514 vs. forecast 390-420, a
+23-32% miss concentrated in hook tests); a rendered component ≈ **1.3-1.8x**, because a single
component test file in this repo (`ShortcutsHelpDialog.test.tsx`) was NOT 200+ lines on its own —
SDD-61 Slice 4's entire 543-line actual included a 161-line ADR plus four production files plus their
tests, so a bare "200+ lines per component test" assumption was rejected as ungrounded during this
estimate. Go is priced at the orchestrator's own measured **~2.3x** (`app_api_address_test.go` 223
lines over 96 lines of production, though Keymap's Go surface is far smaller than that file — see the
note above). Every slice adds **50-80 lines of prose** for its own `tasks.md` entry, per
`sdd-attempt`'s measured 673-vs-597 gap on an SDD-61 slice.

**B. Why 12 slices, not 6.** `proposal.md` §5 forecast 6 slices and flagged two (62d, 62e) as already
over budget, asking `sdd-tasks` to sub-split them. Re-costing **every** file in `design.md` §5
individually — not just the two flagged slices — shows the true bottleneck is broader: S-1 alone
(`keymap.types.ts` + `keymap.helpers.ts` + the `CommandBinding` split) already lands near 450-500 once
its own tests are priced honestly, and S-5 (the panel) is **four** natural file-boundaries
(types/constants/helpers → row component → panel structure → the mandatory loading/error triad), not
two. Splitting at real file/consumer boundaries, using the "colocated test counts as a fallow
consumer" rule the orchestrator named, keeps every slice at **one clean git-revertible unit** instead
of forcing an arbitrary line-count cut through a single component. The result is smaller slices than
`proposal.md` guessed, not bigger — every one of the 12 sits at 260-475, none over 500, most in the
300-470 band the orchestrator asked for.

**C. Two file's are touched across non-adjacent slices, deliberately (SDD-61 precedent: `AppLayout.tsx`
touched twice).**
- `keyboard.types.ts`: Slice 1 (62a) extracts `CommandBinding`; Slice 4 (62d) adds `overrides` /
  `isKeymapLoaded` to `KeyboardStoreState`. Unrelated edits to unrelated declarations in the same file.
- `use-keymap-panel.ts` and `KeymapPanel.tsx` and `KeymapBindingRow.tsx`: created read-only in Slices
  7/6, then incrementally wired for capture (62i), conflict/save (62j), and recovery (62k). Each of
  those three later slices is a small, focused diff to an already-shipped file — not a rewrite.

**D. Interim state, stated explicitly (design.md §8's own suggested split).** Slice 7 (62g) ships
`KeymapPanel.tsx` with the map rendering first but **without** the accessible loading/error triad —
that lands one slice later, in Slice 8 (62h), which is `stacked-to-main` immediately after it. This is
never a released end state: the two slices merge to `dev` back-to-back in the same chain, mirroring
`design.md`'s own explicit suggestion ("62d into 'map + tab entry' and 'the three states'"). Do not
treat 62g's interim render as the shipped feature.

**E. The two mandatory verification obligations named by the orchestrator are explicit tasks, not
folded into general MUTATE cleanup:**
1. **Go-cannot-parse guard** — task **3.3** (Slice 62c): `internal/settings/keymap_test.go` round-trips
   a document that is neither valid JSON nor a valid chord and asserts byte-identical return.
2. **Non-empty binding-list assertion** — task **8.3** (Slice 62h): a registry-level test pinning that
   `listAllBindings()` (`KEYBOARD_COMMANDS` + `SCOPED_COMMAND_BINDINGS`) is never empty, which is what
   makes D11's "resolved-empty is unreachable, no `AirisEmptyState`" claim safe rather than assumed.

**F. Threat Matrix: N/A.** `design.md` §7 records zero routing/shell/subprocess/VCS/process-integration
surface. No threat-matrix RED tasks are owed (identical reasoning to SDD-61's own Note D).

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | **~4,150** across 12 slices (see per-slice table) — materially above `proposal.md`'s ~2,410, per Note A/B above |
| 400-line budget risk | **High** in aggregate; **Low** per slice (every slice ≤ 475) |
| Chained PRs recommended | Yes |
| Suggested split | Twelve chained PRs (62a → 62l), each independently shippable |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` (cached at session start; `dev` is this repo's trunk-for-work, CLAUDE.md #19b) |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

`auto-chain` resolves `Decision needed before apply` to `No`: `stacked-to-main` was already cached at
session start, so `sdd-apply` proceeds directly with Slice 62a.

### Per-Slice Line Forecast

| Slice | Content | Prod | Test | Prose | Total | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|---|---|
| 62a | Keymap resolution core: `CommandBinding` split, `keymap.types.ts`, `keymap.helpers.ts` (`effectiveChord`/`resolveKeymap`/`parseKeymap`/`serializeKeymap`/`pruneKeymap`) | 170 | 205 | 60 | **435** | `bun --cwd="frontend" run test -- keymap` | `git revert`; nothing imports the new files outside their own tests |
| 62b | Scoped metadata + hazard + shadow: `keymap.constants.ts`, `findChordHazard`, `registry.helpers.ts` widened + `findShadowedBindings` | 125 | 150 | 60 | **335** | `bun --cwd="frontend" run test -- keymap registry` | `git revert`; widened params are source-compatible, existing suites still pass |
| 62c | Go persistence: `settings.Keymap`/`SetKeymap`, `appSettingsStore` port, `App.GetKeymap`/`SetKeymap`, `PreferencesSource` pair | 58 | 225 | 60 | **343** | `go test ./internal/settings/... ./internal/desktop/...` | `git revert`; orphaned `app_settings` row is inert (`Get` treats missing as unset) |
| 62d | Override seam wiring: store field, dispatcher, help dialog, loader hook, `SCOPED_COMMAND_BINDINGS` adoption | 116 | 140 | 60 | **316** | `bun --cwd="frontend" run test -- keyboard notification` | `git revert`; **coupled** — must include `use-notification-keyboard-scope.ts` in the same revert (design §8) |
| 62e | Panel primitives: `keymap-panel.types.ts`, `.constants.ts`, `.helpers.ts` | 180 | 216 | 60 | **456** | `bun --cwd="frontend" run test -- keymap-panel` | `git revert`; only colocated tests import them |
| 62f | `KeymapBindingRow` component | 120 | 130 | 60 | **310** | `bun --cwd="frontend" run test -- KeymapBindingRow` | `git revert`; only its own test imports it |
| 62g | `KeymapPanel`: map renders first + `PREFERENCES_ROUTE_TABS` entry (interim, no triad yet — Note D) | 187 | 190 | 60 | **437** | `bun --cwd="frontend" run test -- KeymapPanel` + `bun --cwd="frontend" run render:smoke` | `git revert`, or drop the one `PREFERENCES_ROUTE_TABS` entry |
| 62h | Loading/empty/error triad + non-empty registry guard | 70 | 160 | 50 | **280** | `bun --cwd="frontend" run test -- KeymapPanel keymap-panel` | `git revert`; panel falls back to the pre-triad interim render |
| 62i | Chord capture control (`use-chord-capture.ts`, Rebind wiring) | 105 | 280 | 60 | **445** | `bun --cwd="frontend" run test -- use-chord-capture KeymapBindingRow` | `git revert`; Rebind button reverts to inert |
| 62j | Bind-time conflict/shadow surfacing + persist-then-publish write path | 85 | 220 | 60 | **365** | `bun --cwd="frontend" run test -- use-keymap-panel` | `git revert`; save path reverts to non-functional, capture still records |
| 62k | Recovery: per-binding revert + whole-keymap reset | 70 | 200 | 60 | **330** | `bun --cwd="frontend" run test -- use-keymap-panel KeymapPanel` | `git revert`; rebinding still works, only recovery affordances are lost |
| 62l | Documentation: ADR-019 correction, ADR-020, skill + CLAUDE.md #23, learning-log | 335 | — | 40 | **375** | N/A — documentation only, no runtime harness | `git revert`; zero behavior change |
| | **Total** | **1,626** | **2,116** | **710** | **~4,152** | | |

**No slice exceeds 475.** The aggregate is high because there are twelve of them, exactly what
`stacked-to-main` chaining exists for — not because any single slice is oversized.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Keymap resolution core, invisible to the app | PR 1 (62a) | `bun --cwd="frontend" run test -- keymap.helpers` | `bun --cwd="frontend" run test -- keymap` | `git revert`; inert |
| 2 | Scoped metadata + hazard + shadow detection | PR 2 (62b) | `bun --cwd="frontend" run test -- registry.helpers` | `bun --cwd="frontend" run test -- keymap registry` | `git revert`; source-compatible widening |
| 3 | Go persistence, unreachable from the frontend UI | PR 3 (62c) | `go test ./internal/settings/... -run Keymap` | `go test ./internal/settings/... ./internal/desktop/...` | `git revert`; orphaned row is inert |
| 4 | Override seam goes live: dispatcher + overlay resolve overrides, `Alt+R` reads from the shared constant | PR 4 (62d) | `bun --cwd="frontend" run test -- dispatch.helpers` | `bun --cwd="frontend" run test -- keyboard notification` | `git revert` (coupled with the notification hook) |
| 5 | Panel primitives, unmounted | PR 5 (62e) | `bun --cwd="frontend" run test -- keymap-panel.helpers` | `bun --cwd="frontend" run test -- keymap-panel` | `git revert`; inert |
| 6 | `KeymapBindingRow`, unmounted | PR 6 (62f) | `bun --cwd="frontend" run test -- KeymapBindingRow` | same | `git revert`; inert |
| 7 | Panel reachable, map renders first | PR 7 (62g) | `bun --cwd="frontend" run test -- KeymapPanel` | `bun --cwd="frontend" run render:smoke` | `git revert` or drop the tab entry |
| 8 | Panel is accessible: loading/error states, registry guard | PR 8 (62h) | `bun --cwd="frontend" run test -- KeymapPanel` | same | `git revert` |
| 9 | Chord capture live, nothing persisted yet | PR 9 (62i) | `bun --cwd="frontend" run test -- use-chord-capture` | `bun --cwd="frontend" run test -- KeymapBindingRow` | `git revert` |
| 10 | Rebinding actually saves, with conflict/shadow surfacing | PR 10 (62j) | `bun --cwd="frontend" run test -- use-keymap-panel` | `bun --cwd="frontend" run render:smoke` | `git revert` |
| 11 | Recovery: reset + per-binding revert | PR 11 (62k) | `bun --cwd="frontend" run test -- use-keymap-panel` | same | `git revert` |
| 12 | Docs: ADR-019 correction, ADR-020, skill, CLAUDE.md #23 | PR 12 (62l) | N/A — documentation | N/A | `git revert` |

---

## Slice 62a — Keymap Resolution Core

**Leaves the app working because:** every new file is unreferenced outside its own test; the
`CommandBinding` extraction widens `keyboard.types.ts` source-compatibly (`CommandDefinition` still has
every field it had before).
**Forecast:** 435 lines. Closes spec requirements **"The Keymap Document Is Versioned And Degrades
Safely"** (parse half) and **"Override Resolution Is Keyed By Command Id"** (fully).

### 1.1 Infrastructure

- [x] **1.1.1** [GREEN] Modify `frontend/src/shared/keyboard/keyboard.types.ts`: extract
  `CommandBinding` (`id`, `scope`, `chord`, `label`, `section`), make `CommandDefinition extends
  CommandBinding` adding `enabled?`/`run` (design §2 D3). No RED — a type-only edit changes no runtime
  behavior; the four existing suites importing `CommandDefinition` must still compile unchanged.
- [x] **1.1.2** [GREEN] Create `frontend/src/shared/keyboard/keymap.types.ts`: `KeymapOverrides`,
  `KeymapDocument` (`{ version: 1; bindings: KeymapOverrides }`). JSDoc on every declaration (CLAUDE.md
  frontend #6). No RED, same reasoning as 1.1.1.

### 1.2 Implementation

- [x] **1.2.1** [RED] Write `frontend/src/shared/keyboard/__tests__/keymap.helpers.test.ts` —
  `effectiveChord`/`resolveKeymap`: an id with a stored override resolves to it; an id with no override
  keeps its declared chord (spec "Override Resolution..." scenarios 1-2); an orphaned override (id not
  in the command array) never resurrects a match and the orphan itself is untouched by resolution
  (scenario 3); a no-op override (chord equals the declared default) still resolves correctly.
- [x] **1.2.2** [RED] Extend the same file — `parseKeymap` degrade matrix, one case each: `''`, garbage
  JSON, `null`, an array, a mismatched `version`, `bindings` missing, `bindings` not an object, a
  non-string chord value. Every case asserts `{}` returned and **no throw** (spec "The Keymap Document
  Is Versioned..." scenario "A malformed document degrades to no overrides").
- [x] **1.2.3** [RED] Extend the same file — `pruneKeymap` drops an orphaned id and a no-op override,
  keeps a real override; `serializeKeymap({})` returns `''` (so an empty document clears the stored
  row, per D3/`SetKeymap("")`).
- [x] **1.2.4** [GREEN] Implement `frontend/src/shared/keyboard/keymap.helpers.ts`: `effectiveChord`,
  `resolveKeymap`, `parseKeymap`, `serializeKeymap`, `pruneKeymap`, verbatim signatures from
  `design.md` §3. No registry import, no DOM — lands in the `node` Vitest project automatically
  (`vite.config.ts`'s `nodeTestInclude`).

### 1.3 Testing & Verification

- [x] **1.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, **isolated to this slice's own
  files** (`keyboard.types.ts`, `keymap.types.ts`, `keymap.helpers.ts` and their tests) — the
  repo-blended score hid survivors in three separate SDD-61 slices; do not trust it alone here.
- [x] **1.3.2** [VERIFY] `bun --cwd="frontend" run test -- keymap`; `bun run typecheck`; `bunx eslint`
  over every touched/created file. Confirm `git status --porcelain` shows only this slice's files.
- [ ] **1.3.3** [GATE] Left to the orchestrator (CLAUDE.md #3/#4) — `git commit`, full pre-commit gate,
  timeout ≥ 300000 ms.

**Rollback:** `git revert`. `keymap.types.ts`/`keymap.helpers.ts` are imported by nothing outside their
own tests; `CommandBinding` reverts to `CommandDefinition`'s original inline shape.

---

## Slice 62b — Scoped Metadata, Hazard, Shadow Detection

**Leaves the app working because:** `SCOPED_COMMAND_BINDINGS` has no consumer yet (adopted in 62d);
`findDuplicateBindings`/`findDuplicateCommandIds`'s widened parameter type is source-compatible, so
all four existing SDD-61 suites calling them with `CommandDefinition[]` keep passing unchanged.
**Forecast:** 335 lines. Closes the **conflict half** of spec requirement "Bind-Time Conflicts Block On
Duplicates And Warn On Cross-Scope Shadowing" (the pure detection logic; wiring it at bind time is
Slice 62j) and lays the groundwork for the keyboard-shortcuts delta's "Mark All As Read..." requirement
(the shared-declaration half; adoption is Slice 62d).

### 2.1 Infrastructure

- [ ] **2.1.1** [GREEN] Modify `frontend/src/shared/keyboard/keymap.types.ts`: add `ChordHazard` (union
  of `'browser-zoom' | 'unverified-delivery'`) and `ShadowedBinding` (`chord`, `scopedIds`,
  `globalIds`). No RED, type-only.

### 2.2 Implementation

- [ ] **2.2.1** [RED] Write `frontend/src/shared/keyboard/__tests__/keymap.constants.test.ts`:
  `SCOPED_COMMAND_BINDINGS['notification-center.mark-all-read']` matches `{ id, scope:
  'notification-center', chord: 'alt+r', label, section: 'Notifications' }` exactly (this is what
  R-6/62d's regression test will pin against). `KEYMAP_DOCUMENT_VERSION === 1`.
- [ ] **2.2.2** [GREEN] Implement `frontend/src/shared/keyboard/keymap.constants.ts`:
  `SCOPED_COMMAND_BINDINGS` (`as const satisfies Readonly<Record<string, CommandBinding>>`, design §2
  D3), `KEYMAP_DOCUMENT_VERSION`, `BROWSER_ZOOM_CHORDS`, `UNVERIFIED_DELIVERY_PATTERN`.
- [ ] **2.2.3** [RED] Extend `frontend/src/shared/keyboard/__tests__/keymap.helpers.test.ts`:
  `findChordHazard` — every `BROWSER_ZOOM_CHORDS` entry returns `'browser-zoom'`; any `alt+*` chord
  returns `'unverified-delivery'`; `?` returns `null`; a chord matching both families (none exist
  today, but assert the precedence rule stated in `design.md` §2 D9's table) resolves to the documented
  family.
- [ ] **2.2.4** [GREEN] Extend `frontend/src/shared/keyboard/keymap.helpers.ts`: `findChordHazard`.
- [ ] **2.2.5** [RED] Write/extend `frontend/src/shared/keyboard/__tests__/registry.helpers.test.ts`:
  `findShadowedBindings` reports a chord claimed by both a global and a scoped command as one shadow
  entry naming both id lists; it **never** reports a same-scope collision (that stays
  `findDuplicateBindings`'s job — spec scenario "A cross-scope shadow is saved with a warning" implies
  the two functions must never both fire for the same candidate). Also add one case asserting
  `findDuplicateBindings`/`findDuplicateCommandIds` still return the same result as before over the
  real `KEYBOARD_COMMANDS` array now that their parameter is `readonly CommandBinding[]` (source-compat
  regression, design §2 D3).
- [ ] **2.2.6** [GREEN] Modify `frontend/src/shared/keyboard/registry.helpers.ts`: widen
  `findDuplicateBindings`/`findDuplicateCommandIds`/`collectDuplicateIds`'s parameter type to `readonly
  CommandBinding[]`; add `findShadowedBindings`, grouping by chord alone and reporting only groups
  spanning more than one scope (design §2 D8).

### 2.3 Testing & Verification

- [ ] **2.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice's
  staged files.
- [ ] **2.3.2** [VERIFY] `bun --cwd="frontend" run test -- keymap registry`; `bun run typecheck`;
  `bunx eslint`. Confirm the four pre-existing `registry.helpers.test.ts` cases from SDD-61 still pass
  unmodified (widening did not require touching them).
- [ ] **2.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. `SCOPED_COMMAND_BINDINGS`/`findShadowedBindings` have no consumer to strand.

---

## Slice 62c — Go Persistence

**Leaves the app working because:** the new `App.GetKeymap`/`SetKeymap` bindings exist and are
unit-tested, but the frontend does not call them yet (Slice 62d's loader is the first real caller).
**Forecast:** 343 lines. Closes spec requirement **"Persistence Is One Document Under One Settings Key,
Opaque To The Backend"** fully, including its opaque-bytes-round-trip scenario, and the "unreadable
document degrades to no overrides" half of "The Keymap Document Is Versioned And Degrades Safely" that
the backend is responsible for (returning `""` for a missing/cleared row).

### 3.1 Infrastructure

- [ ] **3.1.1** [GREEN] Modify `internal/desktop/app.go`: add `Keymap(ctx) (string, error)` and
  `SetKeymap(ctx, document string) error` to the `appSettingsStore` interface (lines ~150-159), beside
  the existing four pairs. No RED — an interface addition alone has no runtime behavior.

### 3.2 Implementation

- [ ] **3.2.1** [RED] Write `internal/settings/keymap_test.go`: `Keymap`/`SetKeymap` round-trip a
  document over `t.TempDir()` + real SQLite (per `go-testing`); a missing row returns `""`;
  `SetKeymap("")` clears an existing row back to `""`. **Mandatory obligation — the opaque-bytes guard
  (Note E.1)**: persist a string that is deliberately neither valid JSON nor a valid chord (e.g.
  `` `{not json: alt++` ``) and assert `Keymap` returns it **byte-identical**. This is the deterministic
  guard that stops a future Go-side chord validator (design §2 D5.3).
- [ ] **3.2.2** [GREEN] Modify `internal/settings/store.go`: add `const keyKeymap = "keyboard.keymap"`
  and `Keymap`/`SetKeymap` methods delegating to the existing `Get`/`Set`, **no `TrimSpace`** (unlike
  `SetAPIAddr` — trimming is a content transformation on a document Go must not interpret, design §2
  D5). Doc comment on `SetKeymap` names `normalizeChord` (TypeScript) as the sole authority on chord
  grammar and states the prohibition explicitly, per design §2 D5.2.
- [ ] **3.2.3** [RED] Write `internal/desktop/app_keymap_test.go`: `App.GetKeymap` with a nil
  `settingsStore` returns `""`; `App.SetKeymap` with a nil store returns `"settings store unavailable"`;
  a store error surfaces its `.Error()` string; success returns `"ok"`; a value round-trips through both
  bound methods unchanged (injected fake port, per `app_preferences_test.go`'s existing pattern).
- [ ] **3.2.4** [GREEN] Modify `internal/desktop/app_preferences.go`: add `GetKeymap`/`SetKeymap`
  bound methods, nil-tolerant like every neighbor (`GetDownloadsRoot`/`SetDownloadsRoot` shape, not
  `SetAPIAddress`'s — no validation, no `TrimSpace`, Keymap is opaque).
- [ ] **3.2.5** [RED] Extend
  `frontend/src/infrastructure/preferences-source/__tests__/preferences-source.helpers.test.ts` (create
  if absent): `getKeymap`/`setKeymap` guarded by `waitForBindings(() => hasGoBinding('GetKeymap' |
  'SetKeymap'))`, degrading to `''` on read and `'runtime unavailable'` on write when the binding is
  absent — identical shape to every existing method in the file.
- [ ] **3.2.6** [GREEN] Modify `frontend/src/infrastructure/preferences-source/preferences-source.types.ts`
  (add `getKeymap`/`setKeymap` to `PreferencesSource`) and `preferences-source.helpers.ts` (implement
  both, importing `GetKeymap`/`SetKeymap` from `../../../wailsjs/go/desktop/App` — **apply-time gotcha**:
  `tsc` fails on this import until `wails dev`/`wails build` regenerates the gitignored bindings).

### 3.3 Testing & Verification

- [ ] **3.3** [VERIFY — mandatory obligation, Note E.1] Confirm `internal/settings/keymap_test.go`'s
  opaque-bytes case is present and green; re-run it once more standalone
  (`go test ./internal/settings/... -run TestKeymap -v`) and paste the pass line into the apply report.
- [ ] **3.3.1** [MUTATE] Go: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command
  "go test -count=1 -json ./internal/settings/"`, then again with `./internal/desktop/` — **the owning
  package named, never `./...`** (CLAUDE.md #16). Frontend:
  `bun --cwd="frontend" run test:mutation:staged`, isolated to `preferences-source.*`.
- [ ] **3.3.2** [VERIFY] `go test ./internal/settings/... ./internal/desktop/...`; `go vet ./...`;
  `gofmt -l .` empty. `bun run typecheck` (expected to fail until Wails bindings regenerate locally —
  record that as an apply-time step, not a defect). `bunx eslint` on the two frontend files.
- [ ] **3.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. The `app_settings["keyboard.keymap"]` row, if ever written during manual
testing, is orphaned harmlessly — `Get` treats a missing row as unset and nothing else reads the key.

---

## Slice 62d — Override Seam Wiring

**Leaves the app working because:** with zero overrides ever written (Slice 62j is the first real
writer), `resolveKeymap`/`effectiveChord` are identity functions — every command still resolves to its
shipped chord. `Alt+R` keeps firing exactly as before, now sourced from `SCOPED_COMMAND_BINDINGS`.
**Forecast:** 316 lines. Closes: the "reload restores overrides" half of "Persistence..." (the loader
proves the read path), the keyboard-shortcuts delta's **"Scope Stack Resolves...rebound chord"**
scenario, **"Mark All As Read...enumerable without the panel mounted"** scenario (adoption), and
**"Shortcuts Help Dialog...overridden chord matches dispatcher"** scenario.

### 4.1 Infrastructure

- [ ] **4.1.1** [GREEN] Modify `frontend/src/shared/keyboard/keyboard.types.ts`:
  `KeyboardStoreState` gains `readonly overrides: KeymapOverrides` and `readonly isKeymapLoaded:
  boolean`. No RED, type-only (Note C — second, unrelated edit to this file after 62a).
- [ ] **4.1.2** [GREEN] Modify `frontend/src/shared/keyboard/keyboard.constants.ts`: `keyboardStore`'s
  initial state gains `overrides: {}` and `isKeymapLoaded: false`.

### 4.2 Implementation

- [ ] **4.2.1** [RED] Extend `frontend/src/shared/keyboard/__tests__/keyboard-scope.helpers.test.ts`:
  `setKeymapOverrides` publishes into the store; `resetKeyboardStore` clears both `overrides` and
  `isKeymapLoaded` back to their initial values.
- [ ] **4.2.2** [GREEN] Modify `frontend/src/shared/keyboard/keyboard-scope.helpers.ts`: add
  `setKeymapOverrides(overrides)`; extend `resetKeyboardStore` to clear the two new fields.
- [ ] **4.2.3** [RED] Extend `frontend/src/shared/keyboard/__tests__/dispatch.helpers.test.ts`: an
  override on a global command makes the dispatcher fire on the new chord and **not** the old one, with
  no `preventDefault()` call on the now-unbound chord (spec keyboard-shortcuts scenario "A rebound
  command fires on its new chord and not its old one"); an override on a **scoped** command applies
  inside its frame too.
- [ ] **4.2.4** [GREEN] Modify `frontend/src/shared/keyboard/dispatch.helpers.ts`: `resolveCommand`
  gains a **required** fourth `overrides: KeymapOverrides` parameter (design §2 D2 — required, not
  optional-with-default, so every call site is a compile error until updated); compares via
  `effectiveChord` in both the frame loop and the global fallback. `dispatchKeyboardEvent` destructures
  `overrides` from the same `getKeyboardState()` call it already makes at line ~99.
- [ ] **4.2.5** [RED] Extend
  `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/__tests__/ShortcutsHelpDialog.test.tsx`: an
  overridden command displays its overridden chord (spec keyboard-shortcuts scenario "An overridden
  chord displays identically to what the dispatcher now answers to"). **R-8 cross-surface test**: set
  one override via `setKeymapOverrides`, assert `dispatchKeyboardEvent` resolves it **and** the dialog
  displays it, in one test with two assertions.
- [ ] **4.2.6** [GREEN] Modify `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/use-shortcuts-help-dialog.ts`:
  read `overrides` from `useKeyboardStore`; resolve `commands` (and frame commands) through
  `resolveKeymap` before grouping into sections.
- [ ] **4.2.7** [RED] Write `frontend/src/shared/keyboard/__tests__/use-keymap-overrides.test.ts`:
  `''` from the source resolves to `{}`; a valid serialized document resolves to its overrides; garbage
  resolves to `{}`; a rejected promise resolves to `{}` — **`isKeymapLoaded` becomes `true` in all four
  cases** (D11: a rejection must never strand the panel on a permanent skeleton). Use `renderHook` with
  an injected fake `PreferencesSource`.
- [ ] **4.2.8** [GREEN] Create `frontend/src/shared/keyboard/use-keymap-overrides.ts`: loads the
  persisted document once via `preferencesSource.getKeymap()`, parses it with `parseKeymap`, publishes
  via `setKeymapOverrides`, and always sets `isKeymapLoaded: true` in a `finally`-equivalent path
  regardless of outcome.
- [ ] **4.2.9** [GREEN] Modify
  `frontend/src/shared/keyboard/ui/KeyboardDispatcherListener/KeyboardDispatcherListener.tsx`: call
  `useKeymapOverrides()` beside the existing `useKeyboardDispatcher()`; update its JSDoc to say it now
  holds two keyboard-runtime concerns (design §2 D11).
- [ ] **4.2.10** [RED] Extend
  `frontend/src/features/notifications/ui/NotificationCenterPanel/__tests__/use-notification-keyboard-scope.test.ts`
  — **R-6 guard**: assert the registered command's `chord` equals
  `SCOPED_COMMAND_BINDINGS['notification-center.mark-all-read'].chord`, not a hardcoded literal, so a
  future edit to the shared constant that the hook silently stops reading turns this test red.
- [ ] **4.2.11** [GREEN] Modify
  `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-keyboard-scope.ts`:
  spread `SCOPED_COMMAND_BINDINGS['notification-center.mark-all-read']` and add the two closures
  (`enabled`, `run`) instead of the inline `chord: 'alt+r'` literal (design §2 D3).

### 4.3 Testing & Verification

- [ ] **4.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice's
  staged files — the dispatcher is the hot path and the most mutation-sensitive file in the change.
- [ ] **4.3.2** [VERIFY] `bun --cwd="frontend" run test -- keyboard notification`;
  `bun --cwd="frontend" run render:smoke`; `bun run typecheck`; `bunx eslint`.
- [ ] **4.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. **Coupled** (design §8): revert `use-notification-keyboard-scope.ts` in the
**same** commit, because `SCOPED_COMMAND_BINDINGS` reverts with the rest of this slice and the hook
must not reference a symbol that no longer exists.

---

## Slice 62e — Panel Primitives: Types, Constants, Helpers

**Leaves the app working because:** no file outside this slice's own colocated tests imports any of
these — the tests are the fallow-recognized consumer (a colocated test counts as a consumer; fallow
infers test roots under `src/`, per the orchestrator's stated rule).
**Forecast:** 456 lines. No spec requirement fully closes here; this is shared infrastructure for
Slices 62f-62k.

### 5.1 Infrastructure

- [ ] **5.1.1** [GREEN] Create `frontend/src/shared/keyboard/ui/KeymapPanel/keymap-panel.types.ts`:
  the panel's props shape, `use-keymap-panel`'s return shape, `use-chord-capture`'s return shape (all
  `readonly`, CLAUDE.md frontend #5; JSDoc every declaration). No RED, type-only.

### 5.2 Implementation

- [ ] **5.2.1** [GREEN] Create `frontend/src/shared/keyboard/ui/KeymapPanel/keymap-panel.constants.ts`:
  `KEYMAP_ROW_CLASS` (shared between the real row and its skeleton, so heights cannot drift —
  `autoreas-theme` skill's loading-state contract), `KEYMAP_SKELETON_ROW_COUNT`, panel copy strings. A
  plain `const` goes to `.constants.ts`, never `.helpers.ts` (`dharness/role-file-shape`). No RED, plain
  data with no branching logic.
- [ ] **5.2.2** [RED] Write
  `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/keymap-panel.helpers.test.ts`:
  `listAllBindings()` returns `KEYBOARD_COMMANDS` concatenated with `Object.values(SCOPED_COMMAND_BINDINGS)`
  — asserted by length and by the scoped entry's presence, never re-listed by hand; the section-grouping
  helper groups by `section` preserving insertion order, matching `toShortcutSections`'s existing
  grouping shape but operating over `CommandBinding[]` (not `CommandDefinition[]`, since a panel row
  needs no `run`/`enabled`).
- [ ] **5.2.3** [GREEN] Implement
  `frontend/src/shared/keyboard/ui/KeymapPanel/keymap-panel.helpers.ts`: `listAllBindings`, the
  section-grouping helper (design §3 — "the registry-assembling helper lives where its only consumer
  is").

### 5.3 Testing & Verification

- [ ] **5.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice.
- [ ] **5.3.2** [VERIFY] `bun --cwd="frontend" run test -- keymap-panel`; `bun run typecheck`;
  `bunx eslint`; confirm `fallow audit` passes with only colocated-test consumers (no dead-export
  rejection — Note B/E precedent from SDD-61 Slice 1).
- [ ] **5.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. No mounted consumer to strand.

---

## Slice 62f — `KeymapBindingRow` Component

**Leaves the app working because:** the component renders nothing until `KeymapPanel` mounts it
(Slice 62g); its own test is its fallow consumer until then.
**Forecast:** 310 lines. No spec requirement fully closes here (contributes to "The Shortcuts Panel
Renders The Complete Map First..." once mounted in 62g).

### 6.1 Infrastructure

- [ ] **6.1.1** [GREEN] Create
  `frontend/src/shared/keyboard/ui/KeymapBindingRow/keymap-binding-row.types.ts`: `readonly` props
  (`binding`, `effectiveChord`, `hazard`, `isOverridden`, `scopeNote`, `onRebind`, `onRevert`). No RED.

### 6.2 Implementation

- [ ] **6.2.1** [RED] Write
  `frontend/src/shared/keyboard/ui/KeymapBindingRow/__tests__/KeymapBindingRow.test.tsx`: renders the
  label and the effective chord (formatted via `formatChord`); renders a hazard `Chip` only when
  `hazard === 'browser-zoom'`, never for `'unverified-delivery'` (that is the one-legend case, handled
  by the panel, not the row); renders the scope note only for a scoped binding ("while the Notification
  Center is open"); `Rebind` and `Revert` buttons are present and call their respective `onRebind`/
  `onRevert` callbacks — `Revert` disabled when `isOverridden` is `false`.
- [ ] **6.2.2** [GREEN] Implement
  `frontend/src/shared/keyboard/ui/KeymapBindingRow/KeymapBindingRow.tsx`: dumb component, HeroUI
  primitives only, `KEYMAP_ROW_CLASS` from `keymap-panel.constants.ts` on its root element so the
  skeleton row (Slice 62h) shares its height. No Wails calls, no business logic (frontend architecture
  constraint #1).

### 6.3 Testing & Verification

- [ ] **6.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice.
- [ ] **6.3.2** [VERIFY] `bun --cwd="frontend" run test -- KeymapBindingRow`; `bun run typecheck`;
  `bunx eslint`.
- [ ] **6.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. No mounted consumer to strand.

---

## Slice 62g — `KeymapPanel`: Map Renders First + Tab Entry

**Leaves the app working because:** the panel becomes reachable at `Settings → Shortcuts`, rendering
the complete map first, though without the accessible loading/error states (Note D — completed in
62h, same stacked chain, immediately after).
**Forecast:** 437 lines. Begins closing spec requirement **"The Shortcuts Panel Renders The Complete
Map First..."** — the "map is the first block, includes the scoped binding" scenario is fully provable
here; the loading/error scenarios are 62h's.

### 7.1 Infrastructure

- [ ] **7.1.1** [GREEN] Create
  `frontend/src/shared/keyboard/ui/KeymapPanel/use-keymap-panel.ts` (partial — rows derivation only):
  reads `overrides`/`isKeymapLoaded` from `useKeyboardStore`, computes effective rows via
  `resolveKeymap(listAllBindings(), overrides)` grouped by section. No persistence, no capture, no
  conflict logic yet (those are Slices 62i-62k).

### 7.2 Implementation

- [ ] **7.2.1** [RED] Write
  `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/KeymapPanel.test.tsx`: the complete binding
  map — including the Notification Center's scoped command with its scope note — is the panel's
  **first** visible block, above any reset/legend affordance (spec scenario "The map is the first
  block, and includes the scoped binding"). Assert row order matches section grouping. This test seeds
  the store's `isKeymapLoaded` to `true` directly (`setKeymapOverrides`/store setup), since the
  accessible unresolved-state gate does not exist until 62h.
- [ ] **7.2.2** [GREEN] Implement `frontend/src/shared/keyboard/ui/KeymapPanel/KeymapPanel.tsx`
  (partial): renders the map via `KeymapBindingRow` for each effective row, reset-to-defaults button
  and hazard legend stubbed as static placeholders (wired in 62h/62k). Strict colocation, no barrel
  (ADR-011, ADR-015).
- [ ] **7.2.3** [GREEN] Modify `frontend/src/shared/preferences/preferences-route.constants.ts`: append
  one `PREFERENCES_ROUTE_TABS` entry (`id: 'shortcuts'`) **last**, after Startup — tab order is array
  order (`PreferencesRoute.tsx`), and the confirmed product decision only constrains order *inside* the
  panel (proposal.md §12.1).

### 7.3 Testing & Verification

- [ ] **7.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice.
- [ ] **7.3.2** [VERIFY] `bun --cwd="frontend" run test -- KeymapPanel`;
  `bun --cwd="frontend" run render:smoke` (the panel is a **tab inside `/settings`**, an existing route
  — **no** `ROUTE_MARKERS` entry is owed; record its absence as correct, per R-11); `bun run typecheck`;
  `bunx eslint`.
- [ ] **7.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`, or drop the one `PREFERENCES_ROUTE_TABS` entry to make the tab unreachable
without touching the panel's own files.

---

## Slice 62h — Loading/Empty/Error Triad + Registry Guard

**Leaves the app working because:** this slice only adds states to an already-shipped panel; the map
content path is unchanged.
**Forecast:** 280 lines. Fully closes spec requirement **"The Shortcuts Panel Renders The Complete Map
First, With Mandatory Loading And Error States"** (the loading and error scenarios).

### 8.1 Infrastructure

*(none — this slice only modifies existing files)*

### 8.2 Implementation

- [ ] **8.2.1** [RED] Extend `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/KeymapPanel.test.tsx`:
  while `isKeymapLoaded === false`, the panel exposes an announced region
  (`getByRole('status', { name })`, `aria-live="polite"`, `aria-labelledby` pointing at an `sr-only`
  span per CLAUDE.md frontend #14) and renders **no real binding row** — assert the negative explicitly,
  not just that the skeleton appears (spec scenario "The loading state announces itself and shows no
  real row"). A failed load (`use-keymap-overrides` degrades to `{}` but a distinct load-failure signal
  is surfaced — see 8.2.2) renders the error `Alert`, never a skeleton or an empty state (spec scenario
  "A failed load or save shows the error state").
- [ ] **8.2.2** [GREEN] Modify `frontend/src/shared/keyboard/ui/KeymapPanel/use-keymap-panel.ts`: gate
  the content branch on `isKeymapLoaded` (never on row count — a refetching surface keeps previous
  rows), surface a load-error flag distinct from "loaded with zero overrides."
- [ ] **8.2.3** [GREEN] Modify `frontend/src/shared/keyboard/ui/KeymapPanel/KeymapPanel.tsx`: render
  `KEYMAP_SKELETON_ROW_COUNT` skeleton rows sharing `KEYMAP_ROW_CLASS` with the real row (measured by
  `frontend/scripts/layout-fixtures/loading-skeletons-fixture.tsx` — add this panel's skeleton to that
  fixture) inside the accessible status region; render the error `Alert` on a failed load or save;
  never render both the loading region and a real row simultaneously.
- [ ] **8.3** [RED then GREEN — mandatory obligation, Note E.2] Write
  `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/keymap-panel.helpers.test.ts` (extend): assert
  `listAllBindings()` is **never empty** — this is the deterministic guard for D11's "resolved-empty is
  unreachable by construction, `AirisEmptyState` here would be dead code" claim. No production change
  needed if 5.2.3 already guarantees it; if this test can fail (e.g., a future refactor makes the list
  computable-empty), that is a real gap this task exists to catch, not a false positive to suppress.

### 8.3 Testing & Verification

- [ ] **8.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice.
- [ ] **8.3.2** [VERIFY] `bun --cwd="frontend" run test -- KeymapPanel keymap-panel`;
  `bun --cwd="frontend" run render:smoke`; `bun --cwd="frontend" run layout:fixtures` (or the project's
  equivalent skeleton-height check, per `autoreas-theme`); `bun run typecheck`; `bunx eslint`.
- [ ] **8.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. The panel falls back to Slice 62g's interim always-rendered map — no
user-visible regression beyond losing the accessible states this slice added.

---

## Slice 62i — Chord Capture Control

**Leaves the app working because:** the `Rebind` button starts a real capture, but nothing persists it
yet (Slice 62j is the first writer) — pressing a key while armed records a candidate chord in local
state only.
**Forecast:** 445 lines. Fully closes spec requirement **"Chord Capture Records By Listening And Never
Triggers A Shortcut"**.

### 9.1 Infrastructure

*(covered by 5.1.1's `keymap-panel.types.ts` — `use-chord-capture`'s return shape already declared
there)*

### 9.2 Implementation

- [ ] **9.2.1** [RED] Write
  `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/use-chord-capture.test.ts`: arming then
  pressing `Ctrl+1` records `'ctrl+1'` as the candidate chord (spec scenario "A captured keypress is
  recorded as the candidate chord"); `Escape` cancels and disarms with no chord recorded, checked
  **before** normalization; a bare modifier press (`normalizeChord` returns `null`) keeps the control
  armed with nothing recorded; blur while armed disarms; `event.preventDefault()` is called on **every**
  keydown while armed, including for a chord that will not end up recorded; `event.nativeEvent.isComposing
  === true` is ignored (mirrors the dispatcher's own IME guard).
- [ ] **9.2.2** [GREEN] Implement
  `frontend/src/shared/keyboard/ui/KeymapPanel/use-chord-capture.ts`: the armed/record/cancel/blur
  state machine (design §2 D7). `preventDefault()` called first and unconditionally in the control's own
  `onKeyDown`, which is the entire suppression mechanism — no dispatcher change, no scope frame.
- [ ] **9.2.3** [RED] — **mandatory obligation R-4**. Write
  `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/KeymapBindingRow.capture-suppression.test.tsx`:
  mount `KeymapBindingRow` with its `Rebind` control armed **alongside** `KeyboardDispatcherListener`
  and a real dispatcher-mounted test command bound to `?`; fire a real `?` keydown and a real `alt+1`
  keydown into the armed capture control; assert **no command ran** for either chord and the help
  overlay did not open. Mirrors `KeyboardDispatcherListener.react-aria.test.tsx`'s technique exactly —
  a real event, never a mocked one.
- [ ] **9.2.4** [GREEN] Modify
  `frontend/src/shared/keyboard/ui/KeymapBindingRow/KeymapBindingRow.tsx`: wire the `Rebind` button to
  `use-chord-capture`'s `arm()`; while armed, render the recorded/candidate state instead of the static
  effective chord.

### 9.3 Testing & Verification

- [ ] **9.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice.
- [ ] **9.3.2** [VERIFY] `bun --cwd="frontend" run test -- use-chord-capture KeymapBindingRow`;
  `bun run typecheck`; `bunx eslint`. Confirm 9.2.3's suppression test asserts the **negative**
  explicitly (command did NOT run), not merely that capture succeeded.
- [ ] **9.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. `Rebind` reverts to inert; no persisted state to clean up.

---

## Slice 62j — Bind-Time Conflict/Shadow Surfacing + Persist-Then-Publish

**Leaves the app working because:** this is the first slice where a rebind actually saves; every
change before it was either read-only or recorded-but-discarded.
**Forecast:** 365 lines. Fully closes spec requirement **"Bind-Time Conflicts Block On Duplicates And
Warn On Cross-Scope Shadowing"** (the wiring half — pure detection shipped in 62b) and the "A saved
keymap survives an application reload" scenario of "Persistence...".

### 10.1 Infrastructure

*(none — modifies files created in 62e/62f/62g)*

### 10.2 Implementation

- [ ] **10.2.1** [RED] Extend
  `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/use-keymap-panel.test.ts` (create if this is
  its first test): a candidate rebind colliding with another command **in the same scope** is refused,
  the colliding command's label is surfaced to the caller, and the store's `overrides` is **unchanged**
  (spec scenario "A same-scope duplicate is refused"); a candidate rebind whose chord is already claimed
  by a **different-scope** command saves successfully and surfaces a non-blocking shadow warning naming
  the precedence rule (spec scenario "A cross-scope shadow is saved with a warning"). **D6 — persist
  then publish**: on a successful `setKeymap` call, `overrides` updates only in the success branch; on a
  failed write, the store is untouched and the failure's status string is surfaced (mirrors
  `use-auto-start-panel.ts`'s `isAutoStartSaved` success-branch pattern).
- [ ] **10.2.2** [GREEN] Modify `frontend/src/shared/keyboard/ui/KeymapPanel/use-keymap-panel.ts`: build
  the candidate (`pruneKeymap({ ...overrides, [id]: chord }, ALL_BINDINGS)`), resolve it, run
  `findDuplicateBindings` (refuse + name labels, do not save) then `findShadowedBindings` (save, then
  return a warning), call `preferencesSource.setKeymap(serializeKeymap(candidate))`, and only on `'ok'`
  call `setKeymapOverrides(candidate)` (design §2 D6, §4.2 sequence diagram).
- [ ] **10.2.3** [GREEN] Modify `frontend/src/shared/keyboard/ui/KeymapBindingRow/KeymapBindingRow.tsx`:
  display a refusal message naming the colliding command, or a shadow warning, returned from the
  panel's save callback.
- [ ] **10.2.4** [GREEN] Modify `frontend/src/shared/keyboard/ui/KeymapPanel/KeymapPanel.tsx`: surface a
  save-failure toast/`Alert` when `setKeymap` returns a non-`'ok'` status string.

### 10.3 Testing & Verification

- [ ] **10.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice.
- [ ] **10.3.2** [VERIFY] `bun --cwd="frontend" run test -- use-keymap-panel`;
  `bun --cwd="frontend" run render:smoke`; `bun run typecheck`; `bunx eslint`.
- [ ] **10.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. Capture (62i) still records a candidate chord; only the save path stops
working, so a rebind attempt is a no-op rather than a broken write.

---

## Slice 62k — Recovery: Per-Binding Revert + Whole-Keymap Reset

**Leaves the app working because:** this is the last functional slice; every prior slice already
leaves the app in a working state, this one only adds the two recovery affordances.
**Forecast:** 330 lines. Fully closes spec requirement **"Recovery Is Always Reachable By Pointer
Alone"**.

### 11.1 Infrastructure

*(none — modifies files created in 62e/62f/62g/62j)*

### 11.2 Implementation

- [ ] **11.2.1** [RED] Extend
  `frontend/src/shared/keyboard/ui/KeymapPanel/__tests__/use-keymap-panel.test.ts`: activating
  reset-to-defaults with **only** `userEvent.click` (no keyboard chord anywhere in the test) restores
  every shipped chord, calling `setKeymap('')` and `setKeymapOverrides({})` (spec scenario
  "Reset-to-defaults restores every shipped chord using only pointer input"); activating one binding's
  revert with only `userEvent.click` restores that command's shipped chord while leaving every other
  override unchanged (spec scenario "Per-binding revert restores one command's shipped chord using only
  pointer input").
- [ ] **11.2.2** [GREEN] Modify `frontend/src/shared/keyboard/ui/KeymapPanel/use-keymap-panel.ts`: add
  `resetToDefaults()` (`setKeymap('')` + `setKeymapOverrides({})`) and `revertBinding(id)` (delete `id`
  from the current overrides, then the same persist-then-publish path as 62j).
- [ ] **11.2.3** [GREEN] Modify
  `frontend/src/shared/keyboard/ui/KeymapBindingRow/KeymapBindingRow.tsx`: wire the already-present
  `Revert` button (enabled only when `isOverridden`, per 6.2.1) to `revertBinding(id)`.
- [ ] **11.2.4** [GREEN] Modify `frontend/src/shared/keyboard/ui/KeymapPanel/KeymapPanel.tsx`: wire the
  reset-to-defaults button (previously a static placeholder from 7.2.2) and render the hazard legend
  ("`alt+` delivery is unverified in the packaged build" — design §2 D9) below the map, never above it.

### 11.3 Testing & Verification

- [ ] **11.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice.
- [ ] **11.3.2** [VERIFY] `bun --cwd="frontend" run test -- use-keymap-panel KeymapPanel`;
  `bun --cwd="frontend" run render:smoke`; `bun run typecheck`; `bunx eslint`. Confirm 11.2.1's two
  tests use **zero** keyboard events — grep the test file for `fireEvent.keyDown`/`userEvent.keyboard`
  and confirm no hits inside those two cases.
- [ ] **11.3.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. Rebinding (62j) still works; only the two recovery affordances disappear —
a user with a bad keymap would need to clear the `app_settings` row manually (D9's storage-level escape
hatch, `SetKeymap("")`, remains available even without the UI button).

---

## Slice 62l — Documentation

**Leaves the app working because:** documentation-only, zero runtime file touched.
**Forecast:** 375 lines. Closes the user mandate (D10 of `explore.md` §6) to update and document the
architecture as part of the change, and the success-criteria checklist items in `proposal.md` §11
covering ADR-019/ADR-020/skill/CLAUDE.md/learning-log.

### 12.1 Implementation

- [ ] **12.1.1** Modify `docs/adr/019-keyboard-command-registry.md`: header gains `- **Amended**:
  2026-09-11 by ADR-020 (keymap override seam)`; §1's remapping table row gains the scoped-command
  exception naming `SCOPED_COMMAND_BINDINGS`; "Alternatives considered" gains one sentence (019 made
  remapping *possible*, SDD-62 shipped it); Consequences gains the three call sites that must resolve
  through overrides (design §2 D12, exact four edits).
- [ ] **12.1.2** Create `docs/adr/020-keymap-override-seam.md`: the store-read seam (D1), `effectiveChord`
  vs. per-keystroke resolution (D2), Go-as-opaque-pipe (D5), capture-by-listening (D7),
  duplicates-block/shadows-warn (D8), advisory-not-blocking hazards (D9), each with its rejected
  alternatives, condensed from `design.md` §2 (~260 lines, matching ADR-019's own 161-line precedent
  scaled to six decisions instead of four).
- [ ] **12.1.3** Modify `.claude/skills/keyboard-shortcuts/SKILL.md`: the "Known limits" row for
  remapping becomes "shipped"; add a section on overrides and `SCOPED_COMMAND_BINDINGS`; bump the
  skill's version.
- [ ] **12.1.4** Modify `CLAUDE.md` (and the corresponding `AGENTS.md` note 23): amend with the override
  seam — the shortcuts panel exists, the dispatcher/overlay resolve through overrides, Go persists an
  opaque document.
- [ ] **12.1.5** Append one line via `node scripts/log-lesson.mjs "<the lesson>"` (never by hand,
  CLAUDE.md #17) — the specific lesson is chosen at apply time from whatever actually cost cycles
  during this chain (mirrors SDD-61's own task 4.3.4 precedent), not pre-selected here.

### 12.2 Verification

- [ ] **12.2.1** [VERIFY] `grep -rn "normalizeChord\|parseChord\|ChordGrammar" internal/` — zero hits,
  confirming no Go file parses a chord (spec/design invariant, R-9).
- [ ] **12.2.2** [VERIFY] Re-read ADR-019's amended text against `design.md` §2 D12's four-edit list;
  confirm all four landed verbatim.
- [ ] **12.2.3** [GATE] Left to the orchestrator.

**Rollback:** `git revert`. Zero behavior change.

---

## Requirement → Task Coverage Matrix

### `keymap-customization` (new capability)

| Spec Requirement | Scenarios | Closed by |
|---|---|---|
| The Keymap Document Is Versioned And Degrades Safely | 3 | 1.2.1-1.2.4 (parse/degrade), 3.2.1-3.2.2 (backend round-trip + missing row) |
| Override Resolution Is Keyed By Command Id | 3 | 1.2.1, 1.2.4 |
| Persistence Is One Document Under One Settings Key, Opaque To The Backend | 3 | 3.2.1-3.2.4 (round-trip, opaque-bytes guard, clear), 10.2.1-10.2.2 (reload-survives) |
| The Shortcuts Panel Renders The Complete Map First, With Mandatory Loading And Error States | 3 | 7.2.1-7.2.2 (map first), 8.2.1-8.2.3 (loading/error) |
| Chord Capture Records By Listening And Never Triggers A Shortcut | 2 | 9.2.1-9.2.4 |
| Bind-Time Conflicts Block On Duplicates And Warn On Cross-Scope Shadowing | 2 | 2.2.5-2.2.6 (pure detection), 10.2.1-10.2.2 (wired) |
| Recovery Is Always Reachable By Pointer Alone | 2 | 11.2.1-11.2.4 |

### `keyboard-shortcuts` (MODIFIED delta)

| Spec Requirement | Scenarios | Closed by |
|---|---|---|
| The Scope Stack Resolves Commands Innermost-First, Gated By `enabled()` (rebind scenario added) | 4 (1 new) | 4.2.3-4.2.4 |
| "Mark All As Read" Is Route-Scoped To The Notification Center, Never Global (enumerable-without-mount scenario added) | 3 (1 new) | 2.2.1-2.2.2 (declaration), 4.2.10-4.2.11 (adoption) |
| The Shortcuts Help Dialog Renders Content Derived From The Registry (overridden-chord scenario added) | 2 (1 new) | 4.2.5-4.2.6 |

---

## Conventions Applied Throughout (not repeated per task)

- Mandatory JSDoc on every declaration, including private ones (CLAUDE.md frontend #6).
- Every `*Props` interface property `readonly` (CLAUDE.md frontend #5).
- No `index.ts` barrels; concrete-path imports only (ADR-011).
- Strict colocation: `.tsx`, `use-*.ts`, `*.helpers.ts`, `*.types.ts`, `*.constants.ts`, colocated
  `__tests__/` (ADR-015). A plain `const` (Set, RegExp, object map) goes in `.constants.ts`, never
  `.helpers.ts` (`dharness/role-file-shape`).
- Every implementation task follows RED → GREEN → MUTATE → REFACTOR (CLAUDE.md #16); MUTATE is run
  manually per slice (`bun --cwd="frontend" run test:mutation:staged` isolated to the slice's own
  staged files; `ditto staged` for Go, owning package always named) — apply does not commit, so
  `lefthook.yml`'s commit-time hook is not the only place MUTATE runs.
- Go stays a dumb pipe: no Go file parses a chord or JSON-validates the keymap document (R-9, pinned by
  Slice 62c's opaque-bytes guard).
- `git commit` is the orchestrator's action, never the apply phase's (CLAUDE.md #3/#4). Every `[GATE]`
  task above says so explicitly.
- No file in this change is forecast to approach 400 effective lines on its own; every file estimate in
  `design.md` §5 tops out at ~180.
