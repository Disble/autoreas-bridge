# Proposal: SDD-68 UI Bug Batch

## Intent

Four user-reported defects. Root causes measured against source and the live `bridge.db`, not guessed.

| # | Defect | Root cause |
|---|---|---|
| 1 | Anime Detail always shows the cover placeholder | `toAnimeDetailViewModel` (`anime-detail.helpers.ts:410`) puts the raw stored path into `<img src>` (`AnimeDetail.tsx:72-78`). WebView2 cannot load a bare Windows path from the asset origin; the file exists on disk. Episodes/Today renders the same anime correctly via `GetAnimeCover` |
| 2 | Connected Devices never updates in real time | `use-connected-devices-panel.ts:69` refreshes once on mount and subscribes to nothing; `changelog_store.go:114` upserts `last_seen_at_ms`/`sync_status` silently. Remount is the user's workaround |
| 3 | **Activate anime** writes with no confirmation | `AnimeEditorFormPanel.tsx:143` calls `onActivate()` directly; only Deactivate (`:145`) opens a confirm dialog |
| 4 | CI actions on deprecated Node 20 | Pinned action majors predate node24. **Already applied** — see work units |

Success: detail renders the same cover Episodes renders; the devices panel reflects sync-state changes without remount; every editor lifecycle write is confirmed; workflows run on node24.

## Scope

### In Scope

- Resolve the detail cover through the existing `GetAnimeCover` binding, mirroring `use-episode-covers.ts`. No Go change; `GetAnimeDetail` returns the flat `*contracts.MobileAnime`, so no wire change and no `docs/openapi.yaml` announcement.
- Push device sync-state changes to the UI over the **existing internal event bus**, with the desktop edge translating bus → Wails event. Choke point: every `ChangelogStore.AcknowledgeDevice` write (`changelog_store.go:114`) funnels through `sync.TriggerService.AcknowledgeDevice` (`internal/sync/service.go:113-119`), reached from REST (`sync_handler.go:57`) and WS (`websocket_handler.go:178-179`). `TriggerService` already holds `bus events.Bus` and already publishes on it (`service.go:17,33,50`), so it publishes a device-acknowledged event; `internal/desktop` subscribes and re-emits, copying `registerAnimeRuntimeEventBridge` (`app_startup_runtime.go:356-379`, 24 lines) and `registerDownloadRuntimeEventBridge` (`:382-398`) verbatim. No layering violation and no new dependency: `internal/events.Bus` has zero Wails coupling, and `.golangci.yml` → `wails-confined-to-edge` stays satisfied because only `internal/desktop` touches `emitFn`. The frontend subscribes exactly like `usePairingPanel` (`use-pairing-panel.ts:57-65`).
  - **Explicit tradeoff**: this fires on reconcile-ack, so it is an **activity** signal, not true liveness. The real connect/disconnect moment is `realtime.MemoryHub.Register`/`Unregister` (`internal/realtime/hub.go:104,147`, called from `websocket_handler.go:73,77`), which `ListDevices` never consults.
- Editor lifecycle actions (user-confirmed product decision, amends the current spec): ADD **Repeat** — visible only when `estado > 0`, confirmed; RENAME **Activate anime** → **Restore** — visible only when `activo = 0`, confirmed. Reuse the existing `RepeatAnime`/`RestoreAnime` bindings.
- Record bug 4 as a completed work unit.

### Out of Scope

- **`connection_status` can never read "connected"** — `device/service.go:238-248` derives it from `sync_status` (`active|stale|revoked`, sync *health*, never socket presence) and inverts `active` → `disconnected`, so a healthy device renders disconnected. Adjacent, code-proven, **not user-reported** — deliberately deferred, not fixed here.
  - **Expect this after the fix lands**: the Devices **Status** chip will STILL read "disconnected". That is the deferred defect, not a failed bug 2 — bug 2 makes the panel *refresh*, it does not change what the field can say. Verify MUST NOT read the chip as a regression.
  - The deferred unit is ready to go and its answer is already written: consult `realtime.MemoryHub` liveness (`hub.go:104,147`) in `ListDevices` instead of inverting `sync_status`. Scoped separately because it changes a value already on the wire to mobile via `GET /api/devices`.
- `docs/openapi.yaml` `DeviceInfo` (441-450) documents only `device_id`/`device_name`/`paired_at_ms`, omitting `last_seen_at_ms`, `sync_status`, `connection_status`, `auth_state`, `blocks_changelog_pruning` that `contracts.go:338-348` already ships. Pre-existing drift — recorded per CLAUDE.md #2, not fixed.
- Renaming **Deactivate anime** (the user explicitly declined) and any other editor redesign beyond the three lifecycle buttons.

## Capabilities

### New Capabilities

Both are NEW because no existing requirement governs them — verified, not assumed.

- `anime-cover-rendering`: any surface rendering a stored cover MUST resolve it through the cover binding and MUST NOT render the stored path directly. Nothing in `openspec/specs/` covers AnimeDetail's cover surface today, so this is new territory rather than an amendment.
- `connected-devices-realtime`: device sync-state changes MUST reach the panel without a remount, published on the internal bus and re-emitted at the desktop edge. This is spec **silence**, not contradiction: `mobile-sync-contract/spec.md:315-321` requires only "all paired devices with ID, name, and paired timestamp" and never mentions `sync_status`, `connection_status`, or `last_seen_at_ms`.

### Modified Capabilities

- `anime-editor` — **the only existing requirement amended by this change**: **"General form scope and lifecycle separation"** (`spec.md:88`). Repeat and Restore move INTO the general form under confirmation. The MODIFIED delta MUST carry the whole requirement block and preserve verbatim: "`activo=false` MUST be presented as **Deactivate anime** and MUST represent deactivation, not deletion." Also update the ASCII mockup at `spec.md:22`.

`anime-update-repeat-restore` is **inherited, not amended**. Its "Action visibility" and "Confirmation prevents accidental writes" rules (`spec.md:55-76`) already state the gating (`estado > 0` for Repeat, `activo=false` for Restore) and the confirmation obligation. The editor adopts those semantics as written; do NOT invent new gating and do NOT write a delta against that capability.

## Approach

Reuse before invention. Bug 1 and bug 3 are pure frontend reuse of bindings that already exist and are already tested. Bug 2 publishes on a bus the service already holds (`app.go:278` constructs `bridgeSync.NewTriggerService(a.eventBus, changelogStore, a.sharedLogger)`) and re-emits through a desktop bridge that exists verbatim twice. **Nothing new is designed at the Go boundary, and no new dependency is injected anywhere.**

**Tradeoff, stated up front**: the ack-based event is an **activity** signal, not true liveness. It fires when a device reconciles, so a device that silently drops its socket keeps looking the same until its next ack. The real connect/disconnect moment is `realtime.MemoryHub.Register`/`Unregister` (`internal/realtime/hub.go:104,147`, called from `websocket_handler.go:73,77`), which `ListDevices` never consults — that is the deferred `connection_status` fix's answer, not this slice's. Bug 2 repairs staleness of the device list and **Last sync**; it does not touch the Status chip.

## Work Units and Slice Plan

Review budget **400 changed lines** per slice (`additions + deletions`), `strict_tdd: true`, `delivery_strategy: auto-chain`. Sized from measured comparables (`wc -l`), per CLAUDE.md #22: a ~400-line slice here is roughly 200 production + 200 test, and mandatory JSDoc on every declaration is a per-declaration multiplier.

| Slice | Work unit | Primary files | Measured comparables | Forecast |
|---|---|---|---|---|
| A | Bug 1 — detail cover via binding | new `use-anime-detail-cover.ts`; `AnimeDetail.tsx`, `use-anime-detail.ts`, `anime-detail.helpers.ts` | `use-episode-covers.ts` 88; `use-notification-detail-covers.ts` 88; its test 89 | ~70 prod hook + ~30 wiring + ~110 test ≈ **210** |
| B | Bug 2a — bus event + desktop bridge | `internal/events/event.go` (new event type mirroring `AnimeChangedEvent` at `:53`), publish in `internal/sync/service.go:113-119`, `registerDeviceSyncRuntimeEventBridge` in `internal/desktop/app_startup_runtime.go` wired from `startup()`, plus Go tests | `registerAnimeRuntimeEventBridge` = 24 lines; `registerDownloadRuntimeEventBridge` = 17 | ~90 prod + ~130 test ≈ **220** |
| C | Bug 2b — panel subscription | `bridge-runtime-source`, `use-connected-devices-panel.ts` + tests | whole ConnectedDevicesPanel module = 357 total; `use-pairing-panel.ts:57-65` subscribe precedent | ~60 prod + ~90 test ≈ **150** |
| D | Bug 3a — Activate → **Restore**, confirmed | `AnimeEditorFormPanel.tsx` (152), `AnimeEditorDialogs.tsx` (20), `anime-editor-workspace.types.ts` (161), `use-anime-editor-workspace.ts` (68) | only breaking test file: `AnimeEditorWorkspace/__tests__/AnimeEditorFormPanel.test.tsx` (142) | ~90 prod + ~110 test ≈ **200** |
| E | Bug 3b — add **Repeat**, gated + confirmed | same module; adds `repeatAnime` to `AnimeEditorRuntimeSource` | as above | ~100 prod + ~140 test ≈ **240** |
| F | Bug 4 — CI node24 bumps (**already applied**) | `.github/workflows/build-linux.yml`, `build-windows.yml`, `release.yml` | no test pins GitHub Actions YAML | ~12 changed lines, **done** |

Bug 3 is split at D/E because the rename and the new action are independent buttons; combined they risk the 400 ceiling. Slices are mutually independent — A, B+C, and D→E can proceed in any order; E depends only on D's confirm scaffolding.

**Bug 4, applied**: `actions/checkout@v4`→`@v7` (3 sites), `actions/setup-go@v5`→`@v7` (2), `actions/upload-artifact@v4`→`@v7` (2), `actions/download-artifact@v4`→`@v8` (1), `softprops/action-gh-release` → `@efb35369e0ad2afab669f228072c1b0d510eae64 # v3.0.3` plus its pin comment. `oven-sh/setup-bun` was already node24 and was left untouched. Verified by reading the action manifests: node24 majors are checkout v5.0.0, setup-go v6.0.0, upload-artifact v5.0.0, download-artifact v7.0.0; upload@v7 pairs with download@v8; `merge-multiple` survives in v8; the repo has no `pull_request`/`pull_request_target` triggers, so checkout's `allow-unsafe-pr-checkout` break does not apply; `go.mod` declares `go 1.27` with no separate toolchain directive. **Honest limitation: this is manifest-reading, not a CI run — proof arrives on the next push.**

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Base64 data-URL covers inflate WebView2 memory | Med | Detail resolves exactly one cover for the selected anime, not a grid; release on unmount. Episodes already batches more than this |
| Bug 2's signal is reconcile **activity**, not liveness — a device that silently drops its socket still looks the same | High | Stated in scope as a known limit, not hidden. The liveness answer (`realtime.MemoryHub`) is recorded as the deferred unit |
| Desktop bridge fires with a nil bus, nil `emitFn`, or nil ctx in headless/test runs | Low | Copy the existing guards verbatim — both precedents early-return on `a.eventBus == nil \|\| a.emitFn == nil` and re-check `emitCtx` inside the callback (`app_startup_runtime.go:357,369,392`) |
| MODIFIED delta silently drops the preserved **Deactivate anime** sentence at archive | Med | Delta carries the entire requirement block; verify phase diffs the merged `anime-editor/spec.md` against `spec.md:88` |
| Editor test churn is **smaller in string count but larger in work** than a rename suggests. Exactly **two literal-string breaks**: `AnimeEditorFormPanel.test.tsx:91` and `:102`, both `name: 'Activate anime'`. Beyond those, `:95-106` (`'activates directly (no confirmation) for a deactivated anime'`) has an **inverted premise** — `:104` asserts `expect(onActivate).toHaveBeenCalledTimes(1)`, pinning the very no-confirmation behavior being removed | High | `:91` is a string swap. `:95-106` needs **FULL REPLACEMENT** with a confirmation-required test mirroring `:73-83`, not a string swap — that is where the real work is. Also rename `:85` (test title) and the `:19` default mock `onActivate: vi.fn()` alongside the handler. Do not weaken label assertions to regex — they pin the contract |
| Three assertions look like breaks and are NOT — changing them would be the actual defect | Med | `:79` (`getByRole` **Deactivate**) and `:92` (`queryByRole` **Deactivate** `.not.toBeInTheDocument()`) both keep working and stay semantically right: an inactive anime shows Restore, not Deactivate. `AnimeEditorWorkspace.test.tsx:62` also does not break — that file contains zero "Activate" text; all its lifecycle hits (36, 46-49, 62) are Deactivate, whose label is unchanged |
| Bug 4 unproven until a push | Med | State it as unverified in verify; do not claim CI-green |
| Amending a normative spec on one product decision | Low | The decision is user-confirmed and recorded here; the delta is scoped to one requirement |

## Rollback Plan

Each slice is an independent commit with no cross-slice coupling — revert the single slice commit. Slices A, C, D, E are frontend-only (`git revert` restores the placeholder / the previous button set). Slice B reverts to the current silent upsert — the new bus event simply stops being published and the desktop bridge stops being registered. Bug 4 reverts by restoring the three workflow files to their `@v4`/`@v5` pins. Spec deltas live only in the change folder until archive, so reverting before archive touches no main spec.

## Dependencies

- None external. All Go bindings (`GetAnimeCover`, `RepeatAnime`, `RestoreAnime`, `DeactivateAnime`) already exist and are tested.

## Success Criteria

- [ ] Anime Detail renders the stored cover; an anime with an empty stored path still shows the placeholder.
- [ ] Connected Devices reflects a sync-state change with no route remount — `last_seen_at_ms` advances in place after a device reconciles.
- [ ] The Devices **Status** chip still reads "disconnected". Expected, not a regression: that value cannot be "connected" today (see Out of Scope). The in-scope fix repairs staleness of the device list and **Last sync**, nothing about the chip.
- [ ] Editor exposes Repeat (only `estado > 0`) and Restore (only `activo = 0`), both confirmed; **Deactivate anime** keeps its label and its existing confirmation.
- [ ] Every slice lands at or under 400 changed lines.
- [ ] `go build ./...`, `go vet ./...`, the anime-detail / ConnectedDevicesPanel / anime-editor frontend suites, and `filesize:warning` all stay at their green baseline.
- [ ] Deferred `connection_status` defect and `DeviceInfo` doc drift remain recorded and untouched.
