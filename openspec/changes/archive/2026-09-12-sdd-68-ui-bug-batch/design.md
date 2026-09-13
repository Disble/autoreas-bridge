# Design: SDD-68 UI Bug Batch

## Technical Approach

Five slices, no new abstraction. Bug 1 and bug 3 reuse bindings that already exist and are already tested (`GetAnimeCover`, `RestoreAnime`, `RepeatAnime`). Bug 2 publishes on the bus `sync.TriggerService` already holds and re-emits at the desktop edge through a function copied from `registerAnimeRuntimeEventBridge`. Bug 4 is applied. Slices are independent; E depends only on D's confirmation scaffolding.

## Architecture Decisions

### D1 — Slice A gates the cover call on the stored path (client-side)

| Option | Tradeoff | Decision |
|---|---|---|
| Always call `GetAnimeCover`, let the resolver degrade | One IPC + one SQLite `GetMobileAnime` for the 793/795 records whose `portada.path` is `''` (measured, `anime-detail.helpers.ts:256-260`) | Rejected |
| Gate on `normalizeAnimeDetailPortadaUrl(detail.cover) !== undefined` | Needs the detail already loaded (it is) | **Chosen** |

**Rationale**: provably equivalent, never narrower. `cover.Classify` maps `""` and `"null"` to `KindAbsent` → `placeholderResult` (`internal/anime/cover/types.go:34-44`), the exact set the client helper already rejects — plus whitespace-only, which `Classify` would send to a doomed `ReadFile`. So the gate can only skip calls whose answer is provably `placeholder`. Mirrors `useEpisodeCovers`'s `item.hasCover` gate. Bounded staleness: a cover written between the detail load and the render is missed until the next detail load, and the mutation path already re-fetches (`shouldRefetch`).

### D2 — `portadaUrl` becomes `hasStoredCover`; the hero renders a cover *entry*

`AnimeDetailViewModel.portadaUrl?: string` → `hasStoredCover: boolean` (mirrors `EpisodeScheduleItem.hasCover`). `AnimeDetailState.showPortadaPlaceholder: boolean` → `cover: AnimeDetailCoverEntry`:

```ts
export type AnimeDetailCoverEntry =
  | { readonly status: 'loading' }
  | { readonly status: 'cover'; readonly dataUrl: string }
  | { readonly status: 'placeholder' };
```

**Rationale**: no stored path can reach `<img src>` any more — a structural guarantee, not a convention. One value drives the hero's three branches instead of a boolean plus a URL.

`onPortadaError` / `onPortadaLoad` **stay unchanged** and keep their tests; the hook folds `failedPortadaAnimeId === props.animeId` into `cover` as `placeholder`. Deleting them would save ~12 lines but remove the `naturalWidth === 0` guard for a failure mode a data URL still has (corrupt/truncated bytes decode to nothing).

### D3 — Slice A's loading state is a skeleton, not the placeholder

Rule CLAUDE.md frontend #14 forbids asserting the resolved-empty state before a request resolves. While `status === 'loading'`, the hero avatar slot renders a skeleton block sharing `ANIME_DETAIL_HERO_AVATAR_CLASS` with the real `<img>` (the height contract), wrapped in `role="status"` + `aria-live="polite"` + `aria-labelledby` → `sr-only` span. Because of D1, no-cover anime go straight to `placeholder` with no request and no skeleton. Episodes renders the placeholder during its load instead; retrofitting it is out of scope and recorded as drift.

### D4 — Slice B publishes after the write, before the prune

```go
if err := s.store.AcknowledgeDevice(ctx, deviceID, lastChangelogID, nowMs); err != nil {
    return err
}
s.bus.Publish(events.DeviceAcknowledgedEvent{...})   // <- here
_, err := s.store.PruneAcknowledgedChangelog(ctx)
return err
```

**Rationale**: after the write, so the event asserts a committed fact. Before the prune, because `PruneAcknowledgedChangelog`'s error is returned to the caller but does **not** undo the acknowledgement — publishing after it would commit `last_seen_at_ms` in SQLite while the panel never hears about it, which is the same silent-drift class this slice exists to fix. Prune touches the changelog table, not the device row. RED test: store ok + prune error → event published **and** error propagated. `MemoryBus.Publish` is synchronous (`internal/events/bus.go:29-41`), so subscriber latency lands on the REST/WS ack goroutine; `TriggerReconcile` already publishes the same way.

### D5 — Slice B's event name, payload, and wire shape

| Element | Value | Why |
|---|---|---|
| Bus constant | `events.EventNameSyncDeviceAcknowledged = "sync.device_acknowledged"` | `internal/events` uses snake-after-dot (`anime.update_requested`, `download.run_started`); kebab (`pairing.token-consumed`) is a desktop-local constant, not a bus name. Published by `internal/sync` → `sync.*` family |
| Domain event | `DeviceAcknowledgedEvent{DeviceID, LastAckChangelogID, LastSeenAtMs, CorrelationID}` | Self-describing domain fact; all scalars |
| Wails payload | new `contracts.DeviceAcknowledgedNotice{deviceId, lastSeenAtMs}` | Mirrors `AnimeChangedNotice`. `internal/events` structs carry **no** json tags, so emitting one raw ships Go field names to the WebView; `contracts` is where tagged wire shapes live |

Rejected: json tags on the bus struct (makes a domain type double as a DTO). **Recorded drift** (CLAUDE.md #2): `registerDownloadRuntimeEventBridge` emits raw event structs, so download payloads already reach the frontend with Go field names. Not retrofitted here.

### D6 — Slice C: required on the feature port, optional on the runtime port

| Port | Member | Why |
|---|---|---|
| `BridgeRuntimeSource` | `onDeviceAcknowledged?` (optional) | Every recently added member there is optional (`getAnimeCover?`, `getConnectedDevices?`); a required one taxes the 11 test files that build `BridgeRuntimeSource` fakes |
| `ConnectedDevicesSource` | `onDeviceAcknowledged` (**required**) | The panel cannot do its job without it. Optional here means a fixture that forgets it passes green while the feature is dead. Cost: 2 test fixtures |

The hook's existing default-source `useMemo` absorbs the optionality with the shape already on line 25: `bridgeRuntimeSource.onDeviceAcknowledged ?? (() => () => {})`. The adapter registers it through `createRuntimeSubscription` + `EventsOn`, exactly like `onPairingTokenConsumed`.

### D7 — Slice C: a push-driven refetch never enters the loading state

`refresh` takes an explicit loading flag; the subscription calls it with loading suppressed and leaves `rows` in place on a background error. This satisfies rule #14's exclusivity by construction — skeleton and rows can never render together, because a refetch that already has rows never raises `isLoading`. **Recorded drift**: the panel has no loading skeleton at all today (it renders an empty `<Table>`); closing that is named as optional unit **C2** below.

### D8 — Slices D/E adopt Anime Detail's confirmation view model

Three parallel confirm flows (`isRepeatConfirmOpen`/`isRestoreConfirmOpen`/`isDeactivateConfirmOpen`, 9 callbacks, 3 near-identical modals in an already dense `AnimeEditorDialogs.tsx`) are rejected. `AnimeDetail` already ships the generalized shape and it is tested: one `confirmation` object, one modal, one copy builder (`AnimeDetailMutationControls.tsx:38-61`, `anime-detail.helpers.ts:73-90`, `anime-detail-mutation.helpers.test.ts:43-55`). The editor mirrors it:

```ts
export type AnimeEditorLifecycleAction = 'deactivate' | 'restore';  // slice E adds 'repeat'
export interface AnimeEditorLifecycleConfirmation {
  readonly action: AnimeEditorLifecycleAction;
  readonly heading: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly isDestructive: boolean;
}
```

The hook returns `lifecycleConfirmation | undefined`, `onRequestLifecycleAction(action)`, `onCancelLifecycleAction()`, `onConfirmLifecycleAction()`, replacing the four `*Deactivate` members. **Deactivate's behaviour and copy are preserved byte-identical**: heading `Deactivate anime`, body `This hides the anime from your active library. You can restore it later from History.`, confirm label `Deactivate`, danger styling, `isSaving` disable/pending wiring.

Copy is **duplicated, not extracted** to `shared/`: two features with different wording is not a shared widget, and CLAUDE.md 12b's promotion signal is three importing features. Cross-feature import is barred by the boundary gate anyway.

**Gating reuses Detail's semantics verbatim** — Repeat when `record.frequent.status > 0`, Restore when `record.frequent.active === false` (`estado > 0` / `activo = 0`). Button labels `Repeat` and `Restore`, matching `ANIME_DETAIL_REPEAT_LABEL` / `ANIME_DETAIL_RESTORE_LABEL`. **No contract change**: `AnimeEditorFrequentFields` already carries `status: number` and `active: boolean` (`frontend/src/shared/contracts/anime.types.ts:106,109`), so no DTO, binding, or mapper moves.

### D9 — Repeat renders outside the active/inactive ternary

`AnimeEditorFormPanel.tsx:142-146` is an either/or: `active === false ? Activate : Deactivate`. Restore replaces the `Activate` branch. **Repeat must not become a third branch of it** — its gate (`status > 0`) is independent of active/inactive, so a finished *active* anime is repeatable, and folding it into the ternary would silently hide Repeat for every active anime. Repeat renders as an additional button beside the ternary, mirroring `AnimeDetailMutationControls.tsx:13-26`, where `canRepeat` and `canRestore` are two independent conditionals inside one group. A finished inactive anime therefore shows **both** Repeat and Restore; that overlap is correct, not a defect.

### D10 — Lifecycle gating reads the saved record, never the draft

The form's Status field is an editable dropdown bound to `viewModel.draft`. Visibility MUST read `record.frequent.*`, the saved record. Reading the draft would make Repeat appear and disappear as the user fiddles with the dropdown before saving, and would let the user press Repeat while the draft disagrees with the state the backend will act on. The existing Deactivate button already gates on `record?.frequent.active` (`AnimeEditorFormPanel.tsx:142`), so this is consistency, not a new rule. **Required guard**: a test asserting that changing the Status dropdown does not change Repeat's visibility. It survives mutation precisely because swapping `record` for `draft` is the mutant it kills.

### D11 — `onRepeat` mirrors `onActivate`, and its record reload is mandatory

`RepeatAnime` and `RestoreAnime` both return `contracts.EpisodeCommandResult` (`app_runtime.go:347`, `:330`), so `onRepeat` copies `onActivate`'s `result.status === 'ok'` branch (`use-anime-editor-record.ts:115-137`). It must **not** be modelled on `onDeactivate`, which returns `AnimeEditorSaveResult` and routes through `isIntentionalEditorOutcome` / `result.record`.

`await loadRecord(animeId)` on the success path is a **correctness requirement**, not housekeeping. `Anime.Repeat` (`internal/anime/domain/anime.go:77-112`) resets `Progress` to 0, sets `Status` to watching, flips `Active` true, flips `FirstCycle`, clears `PremieredAt`/`LastWatchedAt`/`DeletedAt`, stamps a fresh `CreatedAt`, and archives the previous cycle into `Repetitions`. Without the reload the form keeps the old watched count and old status, which the user can then **Save back over the reset** — and since `Active` flips true, Restore's own visibility would be stale too. **Required guards**: Repeat's success path reloads, and watched episodes read 0 afterwards.

**Slice D corollary**: the Activate → Restore rename PRESERVES that reload and the `result.status === 'ok'` handling. It is a rename plus a confirmation gate, not a rewrite of the call path; the only behavioural change is that the write happens after confirmation instead of on press. The two feedback strings inside that function — `'Anime activated.'` and `'Activate anime was not applied.'` (`use-anime-editor-record.ts:125,127`) — move to Restore vocabulary. They are easy to miss because they are not button labels.

## Data Flow — slice B

```
mobile device                                          desktop WebView
     │ POST /api/sync/ack  ── or ── WS ack frame              ▲
     ▼                                                        │ EventsOn
sync_handler.go:57 / websocket_handler.go:178                 │ "sync.device_acknowledged"
     ▼                                                 wails runtime.EventsEmit
sync.TriggerService.AcknowledgeDevice (service.go:113)        ▲
     ├─ 1. store.AcknowledgeDevice  ──→ SQLite devices row    │  DeviceAcknowledgedNotice
     ├─ 2. bus.Publish(DeviceAcknowledgedEvent)  ─────────────┤
     │        (sync → events; no Wails coupling)              │
     └─ 3. store.PruneAcknowledgedChangelog          registerDeviceSyncRuntimeEventBridge
                                                     (internal/desktop only  ← emitFn lives here)
```

`.golangci.yml` → `wails-confined-to-edge` stays satisfied: `internal/events` has zero Wails coupling and only `internal/desktop` touches `emitFn`. Slice C's panel then calls `refresh` with loading suppressed and re-reads the authoritative row through `GetConnectedDevices` — the notice targets, it is not the read model.

## File Changes

| Slice | File | Action |
|---|---|---|
| A | `frontend/src/features/anime-detail/ui/AnimeDetail/use-anime-detail-cover.ts` | Create — one cover, one anime, keyed by `animeId` |
| A | `.../AnimeDetail/__tests__/use-anime-detail-cover.test.ts` | Create |
| A | `.../anime-detail.types.ts`, `.helpers.ts`, `.constants.ts`, `use-anime-detail.ts`, `AnimeDetail.tsx` | Modify — D2/D3 |
| A | `.../__tests__/use-anime-detail.test.tsx`, `AnimeDetail.test.tsx`, `anime-detail.helpers.test.ts` | Modify |
| B | `internal/events/event.go` | Modify — constant + event + `Name()` |
| B | `internal/api/contracts/device_acknowledged_notice.go` | Create |
| B | `internal/sync/service.go` | Modify — publish at D4's position |
| B | `internal/desktop/app_startup_runtime.go`, `app.go` | Modify — `registerDeviceSyncRuntimeEventBridge`, wired from `startup()` |
| B | `internal/sync/service_test.go`, `internal/desktop/app_lifecycle_runtime_events_test.go` | Modify |
| C | `frontend/src/infrastructure/bridge-runtime-source/*.{types,constants,helpers}.ts` | Modify — event name + subscription |
| C | `.../ConnectedDevicesPanel/connected-devices-panel.types.ts`, `use-connected-devices-panel.ts` | Modify — D6/D7 |
| C | `.../ConnectedDevicesPanel/__tests__/*`, `infrastructure/__tests__/*` | Modify |
| D | `.../AnimeEditorWorkspace/anime-editor-workspace.{types,helpers}.ts`, `use-anime-editor-workspace.ts`, `AnimeEditorDialogs.tsx`, `AnimeEditorFormPanel.tsx` | Modify — D8 |
| D | `.../__tests__/{AnimeEditorFormPanel,AnimeEditorWorkspace,use-anime-editor-selection}.test.tsx`, helpers test | Modify |
| E | `bridge-runtime-source.types.ts` (`repeatAnime` → `AnimeEditorRuntimeSource`), `use-anime-editor-record.ts`, `use-anime-editor-transitions.ts`, `use-anime-editor-workspace.ts`, `AnimeEditorFormPanel.tsx`, helpers/types | Modify |

`anime-detail.helpers.ts` is 431 raw lines and currently reports clean under `filesize:warning`. Slice A is **line-neutral to +3** there (the new hook is its own file, and `portadaUrl` → `hasStoredCover` swaps one expression).

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (Go) | Publish position, prune-error still publishes, nil store no-ops | `internal/sync/service_test.go` with a stub `changelogLookup` |
| Unit (Go) | Bridge emits the notice; foreign event type ignored; nil bus / nil `emitFn` / nil ctx never panic | `app_lifecycle_runtime_events_test.go`, copying the three existing bridge tests |
| Unit (TS) | Cover gate skips the call for `''`/`'null'`/blank; degrades when `getAnimeCover` is absent; a stale response for the previous `animeId` never paints | `renderHook` on `use-anime-detail-cover` |
| Unit (TS) | Confirmation copy table; lifecycle gating from `status`/`active` | `anime-editor-workspace.helpers` table test |
| Unit (TS) | **D11** — Repeat's `status === 'ok'` path reloads the record, and watched episodes read 0 afterwards | `renderHook` on `use-anime-editor-record` with a spy on `getAnimeEditorRecord` |
| Component | Hero renders skeleton / cover / placeholder **exclusively** (assert the negative); Repeat and Restore ask before writing; Deactivate label and flow unchanged | RTL + HeroUI |
| Component | **D10** — changing the Status dropdown does not change Repeat's visibility (gate reads the saved record) | RTL, drive the select then assert the button set is unchanged |
| Component | **D9** — a finished **active** anime still shows Repeat; a finished inactive one shows Repeat **and** Restore | RTL, table over the four `status`/`active` combinations |
| Integration (TS) | Panel re-reads on a published subscription event without a remount, and does not flash the skeleton | injected `ConnectedDevicesSource` driving the listener |

**MUTATE (Go, slice B)**: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/sync/"`, then the same for `./internal/desktop/`. Naming the package is mandatory. Frontend mutation runs automatically on staged lines via `lefthook`.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Slice A moves file bytes into the WebView as base64 data URLs, but only through the existing `GetAnimeCover` path Episodes already uses, with its existing 10 MB cap and `image/` MIME check (`internal/anime/cover/resolver.go:89-106`) unchanged.

## Migration / Rollout

No migration. No schema change, no wire change to mobile, no `docs/openapi.yaml` announcement (`GetAnimeDetail` and `GET /api/devices` keep their shapes). Slice B adds a Wails-only event. Each slice is an independent revertible commit.

## Size Forecast

| Slice | Prod | Test | Total | Budget 400 |
|---|---|---|---|---|
| A | ~125 | ~165 | **~290** | OK — higher than the proposal's 210, because D3's skeleton and the `portadaUrl` rename reach four test files |
| B | ~63 | ~160 | **~225** | OK |
| C (+ optional C2) | ~37 (+35) | ~126 (+55) | **~165** (~255) | OK — C2 fits inside C |
| D | ~80 | ~130 | **~210** | OK — includes the Restore feedback-copy strings (D11 corollary) |
| E | ~45 | ~165 | **~210** | OK — no contract change (D8), but D9/D10/D11 add three required guards |

**C2** (optional, inside slice C): give the panel the loading skeleton rule #14 requires — `aria-busy` on the table, skeleton `Table.Row`s as `Table.Body` children so header and column widths survive. Adjacent to bug 2, not part of it; named so `sdd-tasks` can drop it if C tightens.

## Open Questions

- [ ] Slice D's button label is `Restore` (matching `ANIME_DETAIL_RESTORE_LABEL`). If the spec delta writes `Restore anime` for symmetry with `Deactivate anime`, the spec wins and D's assertions follow it — flagged because D's tests pin the exact string.
- [ ] None blocking.
