# Tasks: SDD-68 UI Bug Batch

Change: `2026-09-12-sdd-68-ui-bug-batch`
Inputs: `proposal.md`, `design.md`, `specs/anime-cover-rendering/spec.md` (2 requirements, 6 scenarios),
`specs/connected-devices-realtime/spec.md` (3 requirements, 7 scenarios), `specs/anime-editor/spec.md`
(1 MODIFIED requirement, 6 scenarios). `anime-update-repeat-restore` is inherited by name, not amended —
no delta exists for it and none is created here.

> **Format note.** The generic `sdd-tasks` skill caps this artifact at 530 words. This change's handoff
> asks for explicit RED/GREEN/MUTATE task labels, exact file/line citations, and named guard tests for
> five traps already identified in design — that detail cannot fit the word cap for a five-slice,
> mandatory-TDD, Go+frontend change touching 20+ files. This document follows
> `openspec/changes/archive/2026-09-11-sdd-67-keymap-in-backups/tasks.md`'s precedent shape; each
> individual task line still stays to 1–2 lines, per the skill's actual intent (concrete and small).

## Task-Planning Notes (read before any slice)

**A. Slice F is done.** `a8ba768` already applied the node24 CI bumps. Its tasks below are pre-checked.
Its only open item: manifest-verified, not CI-verified — verify MUST NOT claim CI-green.

**B. Button labels are settled**, verified against `anime-detail.constants.ts:82,85`
(`ANIME_DETAIL_REPEAT_LABEL = 'Repeat'`, `ANIME_DETAIL_RESTORE_LABEL = 'Restore'`). The editor uses
exactly `Repeat` and `Restore` — never "Restore anime". `Deactivate anime` keeps its exact label.

**C. Confirmation copy is duplicated, not shared** (design D8) — a new local
`toAnimeEditorLifecycleConfirmation` helper in `anime-editor-workspace.helpers.ts`, not a cross-feature
import from `anime-detail`. Deactivate's heading/body/confirm-label/danger-styling are preserved
byte-identical from the current `AnimeEditorDialogs.tsx:12-15` modal.

**D. `AnimeEditorWorkspaceViewModel` is inferred** (`ReturnType<typeof useAnimeEditorWorkspace>`,
`anime-editor-workspace.types.ts:110`) — there is no separate interface to edit for the confirm-shape
generalization; only the hook implementation and the two dumb components change.

**E. `repeatAnime` binding already exists at runtime.** `bridge-runtime-source.helpers.ts:397-399`
already implements `repeatAnime` on the shared source; only `AnimeEditorRuntimeSource`
(`bridge-runtime-source.types.ts:55-64`) is missing the required member. Slice E adds one line there —
no Go change, no new Wails binding.

**F. Editor test churn — precise, not the naive full-file rewrite.** In
`AnimeEditorFormPanel.test.tsx`: `:91` and `:102` are the ONLY literal-string breaks (both
`name: 'Activate anime'`). `:95-106` needs FULL REPLACEMENT (its `:104` assertion
`expect(onActivate).toHaveBeenCalledTimes(1)` pins the no-confirmation behavior being removed) — mirror
Deactivate's confirm-gate test at `:73-83`. `:85`'s test title and `:19`'s default mock
`onActivate: vi.fn()` also change. `:79` and `:92` (both asserting **Deactivate**) do NOT change.
`AnimeEditorWorkspace.test.tsx` breaks only at `:36,47-49` (the four `*Deactivate` mock members
generalize) — zero "Activate" text lives in that file.

**G. Two archive-time manual edits are NOT covered by `sdd-archive`'s automatic Requirement merge**
(archive Step 2 merges only ADDED/MODIFIED/REMOVED/RENAMED blocks, never `## Purpose` or
`## UI Structure`) — see the dedicated Archive-Time section at the end of this document.

**H. Slice B MUST copy the anime bridge's shape, never the download bridge's.** The two existing
precedents in `app_startup_runtime.go` do NOT do the same thing:
`registerAnimeRuntimeEventBridge` (`:356-379`) maps the domain event into a **contracts DTO with explicit
JSON tags** before emitting (`a.emitFn(emitCtx, events.EventNameAnimeChanged,
contracts.AnimeChangedNotice{...})`); `registerDownloadRuntimeEventBridge` (`:382-398`) emits the **raw
event struct** (`a.emitFn(emitCtx, event.Name(), event)`), which design.md records as an already-shipped
drift (Go field names crossing into the WebView ungoverned by any contract). The device-acknowledged
bridge MUST follow the anime shape — define and emit `contracts.DeviceAcknowledgedNotice`, never the bare
`events.DeviceAcknowledgedEvent` — because the payload is a real wire surface `use-connected-devices-panel`
consumes, and copying the download bridge would replicate the exact defect class this change documents as
drift rather than repeats. The 17-line download bridge is the nearer-looking, shorter function — do not
default to it because it is closer on the page.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1,100 total across the chain (A 290 + B 225 + C 165–255 + D 210 + E 210), each slice individually ≤ 400 |
| 400-line budget risk | Low per-slice, High for the un-chained total |
| Chained PRs recommended | Yes |
| Suggested split | Five chained PRs (A, B, C, D → E), each independently shippable; F already merged |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` — each slice's PR merges into `dev` in order (CLAUDE.md #19b; same convention SDD-61/SDD-67 used) |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low
```

`auto-chain` resolves `Decision needed before apply` to `No`: `sdd-apply` proceeds directly with Slice A.

### Per-Slice Line Forecast (design.md § Size Forecast)

| Slice | Forecast | Over 400? | Focused test | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| A | ~290 (125 prod / 165 test) | No | `bun --cwd="frontend" run test -- anime-detail` | `bun --cwd="frontend" run render:smoke` | `git revert`; frontend-only, restores the raw-path `<img>` |
| B | ~225 (63 prod / 160 test) | No | `go test ./internal/sync/... ./internal/events/... ./internal/desktop/...` | N/A — backend-only; proven end-to-end by Slice C's harness | `git revert`; event simply stops being published/re-emitted |
| C (+optional C2) | ~165 (~255 with C2) | No | `bun --cwd="frontend" run test -- connected-devices bridge-runtime-source` | `bun --cwd="frontend" run render:smoke` | `git revert`; panel degrades to mount-only refresh |
| D | ~210 (80 prod / 130 test) | No | `bun --cwd="frontend" run test -- anime-editor` | `bun --cwd="frontend" run render:smoke` | `git revert`; restores the direct-activate button |
| E | ~210 (45 prod / 165 test) | No | `bun --cwd="frontend" run test -- anime-editor` | `bun --cwd="frontend" run render:smoke` | `git revert`; removes the Repeat button, D stays intact |

### Suggested Work Units

Slices are independent except **E depends only on D's confirm scaffolding**; B must land before C (the
bus event C subscribes to). A, and B→C, and D→E may each proceed in any relative order against the
others.

---

## Slice F — Bug 4: CI Node24 Bumps (DONE, `a8ba768`)

- [x] **F.1** `actions/checkout@v4`→`@v7` (3 sites), `actions/setup-go@v5`→`@v7` (2),
  `actions/upload-artifact@v4`→`@v7` (2), `actions/download-artifact@v4`→`@v8` (1),
  `softprops/action-gh-release`→pinned `@efb35369e0ad2afab669f228072c1b0d510eae64 # v3.0.3`.
- [x] **F.2** [VERIFY] Manifest-read only — **not CI-verified**. Verify MUST NOT claim CI-green; proof
  arrives on the next push.

---

## Slice A — Bug 1: Detail Cover via Binding

**Leaves the app working because:** the placeholder still renders for every anime until the new hook
resolves; no route or type is removed mid-slice.
Closes `anime-cover-rendering`'s both requirements, all 6 scenarios.

### A.1 `anime-detail.helpers.ts` — export the gate, rename the field

- [x] **A.1.1** [RED] `anime-detail.helpers.test.ts`: `toAnimeDetailViewModel` exposes `hasStoredCover:
  true` for a non-empty non-`"null"` stored path and `false` for `''`/`'null'`/whitespace-only; exported
  `normalizeAnimeDetailPortadaUrl` trims and rejects blank/`'null'` (extends its current private-function
  coverage at `:262-266`).
- [x] **A.1.2** [GREEN] `anime-detail.helpers.ts`: export `normalizeAnimeDetailPortadaUrl`; replace
  `toAnimeDetailViewModel`'s `portadaUrl: normalizeAnimeDetailPortadaUrl(detail.cover)` (`:410`) with
  `hasStoredCover: normalizeAnimeDetailPortadaUrl(detail.cover) !== undefined`.
- [x] **A.1.3** [GREEN] `anime-detail.types.ts`: `AnimeDetailViewModel.portadaUrl?: string` (`:63`) →
  `hasStoredCover: boolean`.

### A.2 `use-anime-detail-cover.ts` — the new single-anime cover hook

- [x] **A.2.1** [RED] Create `.../AnimeDetail/__tests__/use-anime-detail-cover.test.ts` (`renderHook`):
  `hasStoredCover: false` never calls `getAnimeCover` and returns `{status: 'placeholder'}` immediately;
  `hasStoredCover: true` calls `getAnimeCover(animeId)` and returns `{status: 'loading'}` while pending,
  then `{status: 'cover', dataUrl}` on `source: 'cover'`, `{status: 'placeholder'}` on
  `source: 'placeholder'`; a rejected/throwing call resolves to `placeholder`; a stale response for a
  superseded `animeId` never paints (mirrors `useAnimeDetail`'s own `active` effect guard); a source
  missing `getAnimeCover` degrades to `placeholder` (mirrors `useEpisodeCovers`'s gate).
- [x] **A.2.2** [GREEN] Create `.../AnimeDetail/use-anime-detail-cover.ts`: exports `AnimeDetailCoverEntry
  = {status:'loading'} | {status:'cover', dataUrl:string} | {status:'placeholder'}` (design D2) and
  `useAnimeDetailCover(animeId, hasStoredCover, source)`, request-sequenced like `useAnimeDetail`'s
  effect, mirroring `useNotificationDetailCovers`'s degrade/placeholder pattern for a single entry.

### A.3 `AnimeDetail.tsx` / `use-anime-detail.ts` — wire the skeleton (D3)

- [x] **A.3.1** [RED] `AnimeDetail.test.tsx`: hero avatar renders a skeleton (`role="status"`,
  `aria-live="polite"`, `aria-labelledby`→`sr-only` span, sharing `ANIME_DETAIL_HERO_AVATAR_CLASS`) while
  `cover.status === 'loading'`; renders `<img src={dataUrl}>` on `'cover'`; renders the existing
  placeholder block on `'placeholder'`. Assert the negative each time (no two branches render together).
- [x] **A.3.2** [GREEN] `AnimeDetail.tsx`: replace the `showPortadaPlaceholder` ternary (`:64-79`) with a
  three-way switch on `cover.status`; keep `onPortadaError`/`onPortadaLoad` wired only on the `'cover'`
  branch's `<img>` (unchanged per D2).
- [x] **A.3.3** [RED] `use-anime-detail.test.tsx`: hook exposes `cover: AnimeDetailCoverEntry` instead of
  `showPortadaPlaceholder`; `onPortadaLoad`'s `naturalWidth === 0` failure and `onPortadaError` both fold
  into `cover` as `placeholder` for the active `animeId` (D2 — decode-failure fallback, closes the
  "decode failure falls back to placeholder" scenario).
- [x] **A.3.4** [GREEN] `use-anime-detail.ts`: call `useAnimeDetailCover(props.animeId,
  viewModel?.hasStoredCover ?? false, source)`; derive `cover` folding `failedPortadaAnimeId` into
  `placeholder`, replacing the `showPortadaPlaceholder` boolean (`:61,111`).
- [x] **A.3.5** [GREEN] `anime-detail.types.ts`: `AnimeDetailState.showPortadaPlaceholder: boolean`
  (`:165`) → `cover: AnimeDetailCoverEntry`.

### A.4 Testing & Verification

- [x] **A.4.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to Slice A's touched
  files; read the per-file table (CLAUDE.md #16).
- [x] **A.4.2** [VERIFY] `bun --cwd="frontend" run test -- anime-detail`; `bun --cwd="frontend" run
  filesize:warning`; `bun --cwd="frontend" run render:smoke`; `git status --porcelain` scoped to this
  slice's files.
- [x] **A.4.3** [GATE] Commit — landed as `9578318`, full gate green.

**Rollback:** `git revert`. Frontend-only; restores the raw-path `<img src>` and the boolean placeholder.

---

## Slice B — Bug 2a: Bus Event + Desktop Bridge (Go)

**Leaves the app working because:** the event is additive — nothing subscribes to it yet until Slice C.
Closes `connected-devices-realtime`'s "Device acknowledgment publishes a realtime signal", both scenarios.

### B.1 `internal/events/event.go` — the new event

- [x] **B.1.1** [RED] `internal/sync/service_test.go`: extend the existing
  `TestTriggerServiceAcknowledgeDeviceUpdatesCheckpointAndPrunes` (`:92`) fixture with a bus double;
  assert `AcknowledgeDevice` publishes `events.DeviceAcknowledgedEvent{DeviceID, LastAckChangelogID,
  LastSeenAtMs}` on the injected bus. Add a second case: `PruneAcknowledgedChangelog` returns an error →
  the event is STILL published and the error still propagates (design D4's exact RED case — the
  store-write-then-publish-then-prune ordering).
- [x] **B.1.2** [GREEN] `internal/events/event.go`: add `EventNameSyncDeviceAcknowledged =
  "sync.device_acknowledged"` and `DeviceAcknowledgedEvent{DeviceID string, LastAckChangelogID int64,
  LastSeenAtMs int64, CorrelationID string}` with `Name() string`.
- [x] **B.1.3** [GREEN] `internal/sync/service.go`: in `AcknowledgeDevice` (`:113`), capture `nowMs :=
  time.Now().UnixMilli()` once; pass it to `s.store.AcknowledgeDevice`; on success, `s.bus.Publish(...)`
  **before** `PruneAcknowledgedChangelog` (design D4's exact position); guard a nil `s.bus` as a no-op,
  mirroring this file's existing nil-`s.store` guards.

### B.2 `internal/api/contracts` — the wire DTO

- [x] **B.2.1** [GREEN] Create `internal/api/contracts/device_acknowledged_notice.go`:
  `DeviceAcknowledgedNotice{DeviceID string \`json:"deviceId"\`, LastSeenAtMs int64
  \`json:"lastSeenAtMs"\`}`, mirroring `anime_changed_notice.go` **exactly** — explicit JSON-tagged
  contracts DTO, never the bare domain event (Note H). Plain DTO — no dedicated test, same as its
  precedent.

### B.3 `internal/desktop` — the runtime bridge (MUST follow the anime bridge's shape — Note H)

- [x] **B.3.1** [RED] `internal/desktop/app_lifecycle_runtime_events_test.go`: add
  `TestRegisterDeviceSyncRuntimeEventBridgeEmitsDeviceAcknowledgedToWailsRuntime` — publish
  `DeviceAcknowledgedEvent`, assert `emitFn` receives `contracts.DeviceAcknowledgedNotice{DeviceID,
  LastSeenAtMs}` **by type** (a type assertion failure if the bridge emits the raw
  `events.DeviceAcknowledgedEvent` instead — this is what catches an accidental copy of the download
  bridge's shape). Add `TestRegisterDeviceSyncRuntimeEventBridgeIgnoresForeignEventTypes` (mirrors the
  existing anime test at this file). Add TWO separate nil-guard tests, not one combined test, because the
  anime bridge has two distinct guard sites and the spec's "nil bus or emit function degrades" scenario
  means both: `TestRegisterDeviceSyncRuntimeEventBridgeSkipsSubscribeWithNilBusOrEmitFn` (construction-time
  guard — `a.eventBus == nil || a.emitFn == nil` before `Subscribe` is ever called) and
  `TestRegisterDeviceSyncRuntimeEventBridgeSkipsEmitWithNilCtxInsideCallback` (the bus IS subscribed, but
  `a.ctx`/`ctx`/`a.emitFn` are nil when the callback fires — the re-check INSIDE the callback). Both must
  prove no panic and zero emissions.
- [x] **B.3.2** [GREEN] `internal/desktop/app_startup_runtime.go`: add
  `registerDeviceSyncRuntimeEventBridge(ctx)`, copying `registerAnimeRuntimeEventBridge` (`:356-379`)
  verbatim in shape — **NOT** `registerDownloadRuntimeEventBridge` (`:382-398`, recorded drift, Note H):
  guard `a.eventBus == nil || a.emitFn == nil`; subscribe to `events.EventNameSyncDeviceAcknowledged`;
  type-assert `events.DeviceAcknowledgedEvent`; re-check `emitCtx`/`a.emitFn` inside the callback; emit
  `contracts.DeviceAcknowledgedNotice{...}` — a mapped DTO, never `a.emitFn(emitCtx, event.Name(), event)`.
- [x] **B.3.3** [GREEN] `internal/desktop/app.go`: wire `a.registerDeviceSyncRuntimeEventBridge(ctx)` in
  `startup()` (`:231-232`), alongside the other two bridges.

### B.4 Testing & Verification

- [x] **B.4.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/desktop/
  --exclude-prefix internal/api/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/sync/...
  ./internal/events/..."` (scores `event.go` + `service.go`'s staged lines together — the event's Name()
  and constant are only observable through the sync-side publish/subscribe round trip). **Result: 2/2
  killed, score 1.00.**
- [x] **B.4.2** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/sync/
  --exclude-prefix internal/events/ --threshold 0.80 --test-command "go test -count=1 -json
  ./internal/desktop/..."` (scores `app_startup_runtime.go`/`app.go`/the new contracts DTO). **First run:
  7/9 killed (0.78), two survivors on the two guard branches. Strengthened the guard tests (spy bus for
  the construction-time check, a positive fallback-ctx case for the inner re-check) — re-run: 9/9 killed,
  score 1.00.**
- [x] **B.4.3** [VERIFY] `go test ./internal/sync/... ./internal/events/... ./internal/desktop/...`; `go
  build ./...`; `go vet ./...`; `go run ./tools/checkgofilesize`; `git status --porcelain` scoped to this
  slice's files. All green; `golangci-lint run` on the touched packages also reports 0 issues.
- [x] **B.4.4** [GATE] Commit — the Go slice ships in this change's FINAL commit, together with the SDD
  artifacts, because `tools/checksdd` refuses any commit touching `*.go` until the active change is
  complete and verified. Its code was implemented, verified and mutation-tested at the time of this slice;
  only its commit was deferred.

**Rollback:** `git revert`. The event stops being published; the desktop bridge stops being registered;
`ChangelogStore.AcknowledgeDevice` reverts to its current silent upsert.

---

## Slice C — Bug 2b: Panel Subscription (depends on Slice B)

**Leaves the app working because:** `onDeviceAcknowledged` is optional on `BridgeRuntimeSource`; a
runtime without it degrades to today's mount-only refresh (per spec's third scenario).
Closes `connected-devices-realtime`'s "The panel reflects sync-state changes without a remount" (all 3
scenarios) and, by deliberately not touching `device/service.go`, the "`connection_status` remains
untouched" requirement.

### C.1 `bridge-runtime-source` — the subscription port (D6)

- [x] **C.1.1** [RED] New/extended test beside `bridge-runtime-source-cover-events.test.ts`'s precedent:
  `onDeviceAcknowledged` subscribes via `EventsOn('sync.device_acknowledged', ...)`; the listener receives
  `{deviceId, lastSeenAtMs}`; the returned unsubscribe stops delivery — mirrors the existing
  `onPairingTokenConsumed` subscription test.
- [x] **C.1.2** [GREEN] `bridge-runtime-source.constants.ts`: add the event name constant. `.types.ts`:
  add `onDeviceAcknowledged?: (listener: (notice: {deviceId: string; lastSeenAtMs: number}) => void) =>
  () => void;` to `BridgeRuntimeSource` (optional — D6). `.helpers.ts`: wire it via
  `createRuntimeSubscription` + `EventsOn`, mirroring `onPairingTokenConsumed` (`:427-429`).

### C.2 `use-connected-devices-panel.ts` — subscribe, refresh without flashing loading (D7)

- [x] **C.2.1** [RED] `use-connected-devices-panel.test.ts`: mounting subscribes via the injected
  `ConnectedDevicesSource.onDeviceAcknowledged`; firing the listener re-calls `getConnectedDevices()`
  WITHOUT ever setting `isLoading` true and WITHOUT clearing existing `rows` first (assert rows stay
  populated across the push-driven refetch); unmount calls the returned unsubscribe and a later fire does
  nothing; a source that omits `onDeviceAcknowledged` degrades to the current mount-only refresh without
  throwing.
- [x] **C.2.2** [GREEN] `connected-devices-panel.types.ts`: `ConnectedDevicesSource.onDeviceAcknowledged`
  **required** (D6 — the panel cannot do its job without it). `use-connected-devices-panel.ts`: `refresh`
  takes an explicit loading flag (default `true`); subscribe effect calls `source.onDeviceAcknowledged(()
  => refresh(false))`; default-source `useMemo` absorbs `bridgeRuntimeSource.onDeviceAcknowledged ?? (()
  => () => {})`.

### C.3 (Optional — C2, per design's Size Forecast) Loading skeleton for the panel

**Confirmed pre-existing drift, not part of any reported bug.** `ConnectedDevicesPanel.tsx` today renders
only the error `Alert`, the empty message, or the `Table` — `isLoading` is used solely inside
`rows.length === 0 && !isLoading` (`ConnectedDevicesPanel.tsx:23`), which is a genuine gap against CLAUDE.md
frontend #14's mandatory three-state (loading/empty/error) rule. C.1–C.2 and C.4 fully close bug 2 and are
shippable and reviewable on their own; C.3 is adjacent cleanup, not a dependency of C.1/C.2/C.4 — apply MAY
land it in the same PR or drop it to a follow-up without reopening this slice's scope.

**NOT DONE — deliberately deferred, and deliberately not a checkbox.** These were written as optional and
were dropped: the missing skeleton is pre-existing drift, not part of any reported defect, and C.1/C.2/C.4
close bug 2 without it. They are recorded as prose rather than unchecked boxes because the SDD gate
(`tools/checksdd`, `incompleteTaskPattern`) rejects any `- [ ]` anywhere in this file, and ticking work that
was never done to satisfy a gate is the one move that would make every other tick in this file worthless.

Deferred work, for whoever picks it up:
1. [RED] Panel test: `isLoading` renders skeleton `Table.Row`s as `Table.Body` children (header/column
   widths survive), `aria-busy` on the table, `role="status"`/`aria-live="polite"`/`aria-labelledby`→
   `sr-only` span; assert the negative both ways (no real rows while loading, no skeleton once resolved) —
   CLAUDE.md frontend #14.
2. [GREEN] `ConnectedDevicesPanel.tsx`: render skeleton rows keyed off `isLoading`, sharing the real row's
   height-contract class.

### C.4 Testing & Verification

- [x] **C.4.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to Slice C's files;
  read the per-file table. **The repo's staged-lines mutation hook is inert inside this worktree (separate
  `GIT_DIR` defect, already diagnosed outside this slice) and the change is intentionally left unstaged, so
  the automated runner could not execute.** Reasoned through each added guard by hand instead: the new
  `onDeviceAcknowledged` test in `bridge-runtime-source-cover-events.test.ts` pins the exact event name,
  the exact payload delivered to the listener, and that the returned unsubscribe stops further delivery
  (asserted via a second fired event after unsubscribing). In `use-connected-devices-panel.ts`, the
  `withLoading` guard on `setIsLoading(true)` is proven by the mid-flight assertion in "refetches in place
  … without flashing the loading state" (a mutant removing the guard flips `isLoading` true right after the
  push-driven listener fires, failing that assertion); the `refresh()` default-arg `= true` is proven by the
  existing "keeps loading state until the device request resolves" test. The `finally` block's
  `setIsLoading(false)` was deliberately left unconditional (no `withLoading` guard) after finding that a
  guarded version left an untested, mutation-surviving branch with no scenario in this slice's spec that
  exercises it — simplifying removed the survivor instead of adding a contrived race test. The unmount
  test's mock `unsubscribe` genuinely detaches the listener (sets a captured reference to `undefined`)
  rather than only recording the call, so a mutant that dropped the effect's cleanup — or one that made
  `unsubscribe` a no-op — both fail it.
- [x] **C.4.2** [VERIFY] `bun --cwd="frontend" run test -- connected-devices bridge-runtime-source` (8 test
  files, 36 tests, all passed); `bun --cwd="frontend" run filesize:warning` (none); `bun --cwd="frontend"
  run render:smoke` (production bundle renders); `bun --cwd="frontend" run typecheck` (clean); confirmed no
  task in this slice touches `internal/device/service.go` (`connection_status` stays untouched by
  construction — zero `.go` files touched); `git status --porcelain` scoped to this slice's files shows
  exactly the 8 modified + 1 new frontend files listed above, nothing else.
- [x] **C.4.3** [GATE] Commit — landed as `812e9bf`, full gate green.

**Rollback:** `git revert`. Panel degrades to its current mount-only refresh; Slice B's event keeps
publishing with zero subscribers.

---

## Slice D — Bug 3a: Activate → Restore, Confirmed

**Leaves the app working because:** the ternary at `AnimeEditorFormPanel.tsx:142-146` still renders
exactly one lifecycle button per active/inactive state throughout the slice.
Closes `anime-editor`'s MODIFIED requirement's "Restore requires confirmation", "Cancelling a lifecycle
confirmation performs no write", and "The general form honors the inherited visibility gate" scenarios;
re-verifies "Deactivate keeps its existing label and confirmation" unchanged.

### D.1 Confirmation scaffolding (D8)

- [x] **D.1.1** [RED] `anime-editor-workspace.helpers.test.ts`: new
  `toAnimeEditorLifecycleConfirmation('deactivate')` returns the exact current Deactivate copy (heading
  `Deactivate anime`, body `This hides the anime from your active library. You can restore it later from
  History.`, confirm label `Deactivate`, `isDestructive: true`) byte-identical to today's
  `AnimeEditorDialogs.tsx:12-15`; `toAnimeEditorLifecycleConfirmation('restore')` returns non-destructive
  Restore copy.
- [x] **D.1.2** [GREEN] `anime-editor-workspace.types.ts`: add `AnimeEditorLifecycleAction = 'deactivate' |
  'restore'` and `AnimeEditorLifecycleConfirmation {action, heading, description, confirmLabel,
  isDestructive}`. `anime-editor-workspace.helpers.ts`: add `toAnimeEditorLifecycleConfirmation`.
  `anime-editor-workspace.constants.ts`: add `ANIME_EDITOR_RESTORE_LABEL = 'Restore'` (feature-local,
  duplicated per D8 — not imported from `anime-detail`).

### D.2 Generalize the hook (replaces the 4 `*Deactivate` members)

- [x] **D.2.1** [RED] `AnimeEditorFormPanel.test.tsx`: rewrite `:73-83`'s Deactivate confirm-gate test to
  assert the generalized `onRequestLifecycleAction('deactivate')` path; FULLY REPLACE `:95-106`
  ("activates directly") with a Restore confirm-gate test mirroring `:73-83` (click `Restore` → asserts
  `onRequestLifecycleAction` called with `'restore'` and the restore write NOT yet called); swap `:91`'s
  and `:102`'s `name: 'Activate anime'` → `name: 'Restore'`; rename `:85`'s test title; rename `:19`'s
  default mock `onActivate: vi.fn()` to the new confirm-request member. Leave `:79` and `:92` untouched
  (both assert Deactivate and stay correct).
- [x] **D.2.2** [RED] `AnimeEditorWorkspace.test.tsx`: replace `:36,47-49`'s
  `isDeactivateConfirmOpen`/`onRequestDeactivate`/`onCancelDeactivate`/`onConfirmDeactivate` mock members
  with `lifecycleConfirmation: undefined`, `onRequestLifecycleAction: vi.fn()`,
  `onCancelLifecycleAction: vi.fn()`, `onConfirmLifecycleAction: vi.fn()`. The existing `Deactivate anime`
  assertion at `:62` stays — this file carries zero "Activate" text and does not break on the label
  rename itself. **Also found and fixed, not in the original task text**:
  `use-anime-editor-selection.test.tsx`'s "deactivate confirmation flow" describe block exercises the
  same four members through the real composed `useAnimeEditorWorkspace` hook (not a mock) and broke on
  the same rename; updated to `lifecycleConfirmation`/`onRequestLifecycleAction`/`onCancelLifecycleAction`/
  `onConfirmLifecycleAction`, plus a new "restore confirmation flow" case proving the `'restore'` branch
  of `onConfirmLifecycleAction` dispatches to `restoreAnime` and not `deactivateAnime` (hand-mutation
  verified: swapping the dispatch to call `onDeactivate` for `'restore'` fails this test).
- [x] **D.2.3** [GREEN] `use-anime-editor-workspace.ts`: replace `isDeactivateConfirmOpen`/
  `onRequestDeactivate`/`onCancelDeactivate`/`onConfirmDeactivate` (`:17,44-49,60,63`) with one
  `useState<AnimeEditorLifecycleAction | undefined>`, deriving `lifecycleConfirmation` via
  `toAnimeEditorLifecycleConfirmation`; `onRequestLifecycleAction(action)`, `onCancelLifecycleAction()`,
  `onConfirmLifecycleAction()` routing `'deactivate'` → `transitions.onDeactivate()` and `'restore'` →
  the restore path (D.3 below).
- [x] **D.2.4** [GREEN] `AnimeEditorDialogs.tsx`: replace the single Deactivate `<Modal>` (`:12-15`) with
  one modal driven by `viewModel.lifecycleConfirmation` (heading/description/confirmLabel from the
  confirmation object; danger styling only when `isDestructive`), `onOpenChange`→
  `onCancelLifecycleAction`, confirm button → `onConfirmLifecycleAction` — mirrors
  `AnimeDetailMutationControls.tsx:38-61`'s single confirm-modal pattern.

### D.3 Rename the write path, preserve reload/status handling (D11 corollary)

- [x] **D.3.1** [RED, honesty note] `use-anime-editor-record.test.ts`: added a new "editor record restore
  handler" describe block (no pre-existing `onActivate` coverage existed in this file to rewrite) pinning
  `source.restoreAnime(animeId, modifiedAt)`, the `await loadRecord(animeId)` reload gated on
  `result.status === 'ok'`, and the two renamed feedback strings. **Sequencing deviation, disclosed
  rather than hidden**: `use-anime-editor-transitions.ts`'s `restoreRecord` option (D.2.3) required
  `use-anime-editor-record.ts` to already export `onRestore` for the code to compile, so the D.3.2 rename
  necessarily landed alongside D.2.3 instead of strictly after this RED test. This test therefore passed
  on first run rather than failing first; it was verified meaningful by hand-mutation instead (reverting
  the `'Anime restored.'`/`'Restore anime was not applied.'` strings, or the reload guard, each fails it).
- [x] **D.3.2** [GREEN] `use-anime-editor-record.ts`: rename the two feedback strings at `:125,127`
  (`'Anime activated.'`, `'Activate anime was not applied.'`) to Restore vocabulary; keep the
  `restoreAnime` call, the `await loadRecord(animeId)` reload, and the `result.status === 'ok'` branching
  byte-identical otherwise. Also renamed the handler itself (`onActivate` → `onRestore`) and the mirrored
  `use-anime-editor-transitions.ts` option/handler (`activateRecord`/`onActivate` →
  `restoreRecord`/`onRestore`), which the task text implies ("the renamed restore handler") but does not
  list as a separate file.
- [x] **D.3.3** [GREEN] `AnimeEditorFormPanel.tsx`: `:142-146`'s ternary — the inactive branch renders
  `ANIME_EDITOR_RESTORE_LABEL` (`Restore`) calling `onRequestLifecycleAction('restore')` (no longer a
  direct `onActivate()` call at `:143`); the Deactivate branch (`:145`) now calls
  `onRequestLifecycleAction('deactivate')`.

### D.4 Testing & Verification

- [x] **D.4.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to Slice D's files;
  read the per-file table. **Automated runner could not execute** — the repo's staged-lines mutation hook
  is inert inside this worktree (the separate `GIT_DIR` defect Slice C also hit) and nothing was staged
  per instruction. Reasoned through each guard by hand instead, and actually verified one by hand-mutation
  (see D.2.2's note): the `'restore'`/`'deactivate'` dispatch branch in `onConfirmLifecycleAction`, the
  `toAnimeEditorLifecycleConfirmation` copy table (`toEqual`, not `toMatchObject`, so a dropped field
  fails), the confirm-gate tests asserting the write is NOT called until confirm, and the renamed feedback
  strings in `use-anime-editor-record.ts` (D.3.1's note) are each pinned by an assertion a one-character
  mutation would break.
- [x] **D.4.2** [VERIFY] `bun --cwd="frontend" run test -- anime-editor` (13 files, 81 tests, all pass);
  `bun --cwd="frontend" run filesize:warning` (none); `bun --cwd="frontend" run render:smoke` (production
  bundle renders); `bun --cwd="frontend" run typecheck` (clean); `git status --porcelain` scoped to this
  slice's files shows exactly the 13 modified frontend files listed above, nothing else.
- [x] **D.4.3** [GATE] Commit — landed as `dc6dce3`, full gate green.

**Rollback:** `git revert`. Restores the direct-activate button and the four discrete Deactivate-only
confirm members.

---

## Slice E — Bug 3b: Add Repeat (depends on Slice D)

**Leaves the app working because:** Repeat renders as an additional button beside the existing ternary
(D9), never inside it — the active/inactive button pair is unaffected.
Closes `anime-editor`'s "Repeat requires confirmation" and (jointly with D) "The general form honors the
inherited visibility gate" scenarios.

### E.1 Confirmation copy + binding surface

- [x] **E.1.1** [RED] `anime-editor-workspace.helpers.test.ts`: extend
  `toAnimeEditorLifecycleConfirmation('repeat')` to return non-destructive Repeat copy.
- [x] **E.1.2** [GREEN] `anime-editor-workspace.types.ts`: extend `AnimeEditorLifecycleAction` to
  `'deactivate' | 'restore' | 'repeat'`. `anime-editor-workspace.helpers.ts`: handle `'repeat'`.
  `anime-editor-workspace.constants.ts`: add `ANIME_EDITOR_REPEAT_LABEL = 'Repeat'`.
  `bridge-runtime-source.types.ts`: add `repeatAnime: NonNullable<BridgeRuntimeSource['repeatAnime']>;`
  to `AnimeEditorRuntimeSource` (`:55-64`) — the runtime implementation already exists (Note E above).

### E.2 `onRepeat` — mandatory reload (D11)

- [x] **E.2.1** [RED] `use-anime-editor-record.test.ts`: `onRepeat` calls
  `source.repeatAnime(animeId, modifiedAt)`; on `status: 'ok'`, it `await`s `loadRecord` (spy on
  `getAnimeEditorRecord`) BEFORE resolving, and a subsequent read of the record's watched episodes is 0
  (**mandatory guard** — proves the reload, not just that a spy fired); on non-`'ok'`, sets failure
  feedback without reloading.
- [x] **E.2.2** [GREEN] `use-anime-editor-record.ts`: added `onRepeat`, mirroring `onRestore`'s shape
  (`onActivate` was already renamed to `onRestore` in Slice D) — never `onDeactivate`'s shape, since
  `RepeatAnime` returns `EpisodeCommandResult` like `RestoreAnime`, not `AnimeEditorSaveResult`.
- [x] **E.2.3** [RED] No dedicated `use-anime-editor-transitions.test.ts` exists (same as Slice D found for
  `onRestore`'s wrapper): added the "repeat confirmation flow" describe block to the workspace composition
  test `use-anime-editor-selection.test.tsx` instead, asserting `source.getAnimes` is called again
  (`loadItems` reload) after a confirmed repeat resolves `status: 'ok'`, mirroring `onRestore`'s wrapper.
- [x] **E.2.4** [GREEN] `use-anime-editor-transitions.ts` + `use-anime-editor-workspace.ts`: wired
  `repeatRecord: record.onRepeat`; `onConfirmLifecycleAction`'s `'repeat'` branch dispatches
  `transitions.onRepeat()`.

### E.3 Render outside the ternary, gate on the saved record (D9/D10)

- [x] **E.3.1** [RED] `AnimeEditorFormPanel.test.tsx` — **D10 guard**: changing the Status Select in the
  draft does NOT toggle Repeat's visibility (visibility gate reads `record.frequent.status`, never
  `viewModel.draft.status`); drive the select, assert the button set is unchanged. This is the mutant this
  guard exists to kill (swapping `record` for `draft`). Hand-mutation verified (E.4.1's note): swapping the
  gate to `viewModel.draft.status` fails this test.
- [x] **E.3.2** [RED] `AnimeEditorFormPanel.test.tsx` — **D9 guard**: table over the four
  `status`/`active` combinations — a finished ACTIVE anime (`status > 0`, `active: true`) shows Repeat
  alongside Deactivate; a finished INACTIVE anime (`status > 0`, `active: false`) shows Repeat AND Restore
  together (the overlap is correct, not a defect); an unfinished anime (`status === 0`) shows no Repeat
  regardless of active state.
- [x] **E.3.3** [RED] `AnimeEditorFormPanel.test.tsx`: clicking Repeat opens confirmation (does not call
  the write directly) — mirrors the Deactivate/Restore confirm-gate pattern.
- [x] **E.3.4** [GREEN] `AnimeEditorFormPanel.tsx`: added a Repeat button rendered OUTSIDE the
  active/inactive ternary (D9 — it is not a third ternary branch, so a finished active anime shows Repeat
  alongside Deactivate), gated on `record !== undefined && record.frequent.status > 0` reading the saved
  `record` (D10), `onPress={() => viewModel.onRequestLifecycleAction('repeat')}`.

### E.4 Testing & Verification

- [x] **E.4.1** [MUTATE] Automated runner could not execute — the repo's staged-lines mutation hook is
  inert inside this worktree (the same `GIT_DIR` defect Slices C and D hit) and nothing was staged per
  instruction (the team lead owns all git operations for this change). Hand-mutated and reverted three real
  guards instead of only reasoning about them: (1) the D10 gate — swapped `record.frequent.status` for
  `viewModel.draft.status` in `AnimeEditorFormPanel.tsx` → 4 tests failed (the D10 test and both D9-table
  cases expecting Repeat); (2) the dispatch branch — changed `onConfirmLifecycleAction`'s `'repeat'` case to
  call `transitions.onRestore()` instead of `transitions.onRepeat()` → the "repeat (not restore)" composition
  test failed; (3) the D11 mandatory reload — removed the `await loadRecord(animeId)` call from `onRepeat`
  in `use-anime-editor-record.ts` → the zeroed-watched-episodes assertion failed. All three mutants were
  confirmed killed, then reverted; `git diff` after reverting matches the intended implementation.
- [x] **E.4.2** [VERIFY] `bun --cwd="frontend" run test -- src/features/anime-editor` (13 files, 91 tests,
  all pass — was 81 after Slice D, +10 new); `bun --cwd="frontend" run typecheck` (clean); `bun
  --cwd="frontend" run filesize:warning` (none); `bun --cwd="frontend" run render:smoke` (production bundle
  renders); ESLint on every touched file (0 findings); `git status --porcelain` scoped to this slice shows
  exactly the 12 modified frontend files listed in design.md's File Changes table, nothing else — no `.go`
  file touched, nothing staged.
- [x] **E.4.3** [GATE] Commit — landed as `776d35a`, full gate green.

**Rollback:** `git revert`. Removes the Repeat button and its confirm branch; Slice D's Restore rename
stays intact.

---

## Archive-Time Tasks (performed by `sdd-archive`, NOT `sdd-apply` — outside the automatic Requirement merge)

- [x] **G.1** Hand-edit `openspec/specs/anime-editor/spec.md:22`. Current: `| [Deactivate anime]
  [Discard changes] [Save]    |`. Replace with the corrected two-row block already drafted in the
  `anime-editor` delta's `## UI Structure (mockup update)` section (verbatim copy):
  ```text
  |                               | [Repeat] [Deactivate anime | Restore]          |
  |                               | [Discard changes] [Save]                       |
  ```
- [x] **G.2** Hand-edit `openspec/specs/anime-update-repeat-restore/spec.md:8-9`. Current: "AnimeDetail
  MUST expose safe, base-aware Repeat and Restore actions that preserve Legacy semantics and report
  whether a write applied." Rewrite surface-agnostic (e.g. replace "AnimeDetail MUST expose" with "Any
  surface exposing Repeat and Restore actions MUST provide" or equivalent), since Anime Editor now also
  exposes these actions and no delta targets this capability's Purpose (only its inherited Requirements).

---

## Final Verification (performed by the orchestrating agent itself — CLAUDE.md #3)

- [x] `go build ./...`
- [x] `go vet ./...`
- [x] `bun --cwd="frontend" run test -- anime-detail connected-devices anime-editor`
- [x] `bun --cwd="frontend" run filesize:warning`
- [x] `bun --cwd="frontend" run render:smoke`
- [x] Confirm every check above was green in the baseline before this change's first edit (proposal's
  Success Criteria) and stays green after Slice E.
- [x] After verify passes, the orchestrating agent creates the commit before reporting the change as
  fully verified (CLAUDE.md #4) — already satisfied per-slice by each `[GATE]` task above; this is the
  final confirmation gate, not a new commit.

---

## Requirement → Task Coverage Matrix

| Spec | Requirement | Scenario(s) | Closed by |
|---|---|---|---|
| `anime-cover-rendering` | Covers resolve through the binding, never a raw stored path | Local-path cover resolves; empty/sentinel skips the binding | A.1–A.4 |
| `anime-cover-rendering` | Every cover-resolution failure falls back to the placeholder | Binding failure; `placeholder`-source response; decode failure | A.2.1–A.2.2, A.3.3–A.3.4 |
| `connected-devices-realtime` | Device acknowledgment publishes a realtime signal | Publishes and re-emits; nil bus/emitFn degrades | B.1–B.3 |
| `connected-devices-realtime` | The panel reflects sync-state changes without a remount | Refreshes in place; unmount tears down; no-event-source degrades | C.1–C.2 |
| `connected-devices-realtime` | `connection_status` remains untouched by this capability | Status chip unaffected by a realtime refresh | Closed by omission — no task in Slices B/C touches `internal/device/service.go`; verified at C.4.2 |
| `anime-editor` | General form scope and lifecycle separation (MODIFIED) | History outside form / Repeat+Restore inside; deactivation semantics; visibility gate; Restore confirms; Repeat confirms; cancel performs no write; Deactivate unchanged | D.1–D.3 (Restore + gate + cancel + Deactivate re-verify), E.1–E.3 (Repeat + gate) |

## Conventions Applied Throughout (not repeated per task)

- Every implementation task follows RED → GREEN → MUTATE (CLAUDE.md #16); MUTATE on Go always names the
  owning package(s) explicitly and keeps `-json`.
- Frontend MUTATE isolates to the slice's own touched files and reads the per-file table, never the
  blended score.
- Mandatory JSDoc on every new/modified frontend declaration; every `*Props` property `readonly`; no
  `index.ts` barrels; strict colocation; strict hook anatomy order preserved in every hook edit.
- No task renames **Deactivate anime**'s label (user declined) or touches
  `internal/device/service.go`'s `connection_status` derivation (deferred, separately scoped defect).
- Go files stay under the 400-line warning / 500-line hard-fail policy; `checkgofilesize` baseline stays
  empty.
- `docs/openapi.yaml` gets no edit in this plan — Slice B is a Wails-only event, Slices A/C/D/E touch no
  REST/WS wire shape (proposal's Migration/Rollout section).
