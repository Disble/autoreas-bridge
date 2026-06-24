# Archive Report: SDD-28 Automated Anime Downloading

**Change**: `2026-06-21-sdd-28-auto-download`
**Archived on**: 2026-06-23
**Commit**: `f803ff6 feat(download): add automated anime download feature (SDD-28)`
**Final Verdict**: PASS WITH WARNINGS

## Summary

Shipped a production-grade hexagonal `internal/download` bounded context (read-only against the anime context) that turns today's active animes into scheduled or manual downloads via MyJDownloader, with filesystem-as-source-of-truth trigger semantics, per-anime failure isolation, hoster-ordered enqueue with fallback, and durable run history. Simultaneously built the project's first shared, generic `internal/notification` user-notification architecture (with `internal/download` as the first consumer) to replace all future ad-hoc notification mechanisms — a new `Notifier` port with a dispatcher fanning out to a UI-toast adapter (Wails `notification.push` event) and a Windows desktop-toast adapter (behind a build-tag seam, non-Windows no-op fake). Added 4 new SQLite tables (hoster priority, JD config with DPAPI-encrypted credentials, scheduler config, durable run history with bounded 200-run retention), an in-process scheduler (gated by config), SDD-20 observability integration (`LogEntry` with domain="download" + `download.*` events), Wails-bound methods, and a dumb-UI `download` frontend feature (hoster editor, JD config, schedule panel, run history, manual trigger) + shared app-shell toast surface + AnimePanel gap badge. The PoC (`cmd/poc`, 10 files) has been parked to `git stash@{0}` (superseded by tested `internal/download`). All 76 tests passing (download 76.3%, config 100%, crypto 88.5%, filesystem 93.3%, jdownloader 75.3%, schedule 80%, jkanime 80.2%, notification 72.7%; frontend 330/330). Two initially-introduced react-doctor cascading-state advisories were resolved via state consolidation.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `download/orchestration` | Created | Trigger semantics (filesystem source of truth, no NroCapVisto, no DB-cached counts), per-anime failure isolation, hoster-ordered enqueue, completion polling, flatten, Tipo skip, gap surfacing, Notifier integration |
| `download/sites` | Created | Site registry (code-resident, no per-site DB config), jkanime CSRF/AJAX/base64 link extraction, loud zero-links failure, failure-cause classification |
| `download/config` | Created | Hoster priority CRUD/seed/deterministic ordering, DPAPI write-only credentials (current-user scope, Windows-gated), schedule config |
| `download/scheduler` | Created | Config-gated in-process scheduling, manual trigger, concurrent-run guard, bounded shutdown drain, run max-duration guard |
| `download/observability` | Created | LogEntry (domain="download", CorrelationID=run_id), `download.*` events, durable `download_runs` table, bounded 200-run retention, crash-zombie reconciliation, JD-offline manual-link persistence |
| `download/ui` | Created | 5 panels (hoster editor drag&drop+keyboard, JD config write-only password+live status, schedule, run history master/detail, manual trigger), 2026 design bar, toasts-not-owned-by-feature, AnimePanel gap badge |
| `notifications/notifications` | Created | Generic `Notifier` port + dispatcher with fan-out failure isolation, UI-toast adapter (`notification.push` event), Windows desktop-toast adapter (build-tag seam, non-Windows no-op), no-adapters graceful no-op |

## Archive Contents

| Artifact | Status |
|---|---|
| proposal.md | ✅ |
| specs/ | ✅ (7 delta specs, all synced to openspec/specs) |
| design.md | ✅ |
| tasks.md | ✅ (65 implementation + 4 integration tasks, all complete) |
| verify-report.md | ✅ PASS WITH WARNINGS |
| archive-report.md | ✅ |

## Source of Truth Updated

- `openspec/specs/download/orchestration.md` — per-run decision logic, trigger semantics, failure isolation, hoster enqueue, completion detection, flatten, skip handling, Notifier integration
- `openspec/specs/download/sites.md` — site registry, jkanime adapter (CSRF, AJAX, link extraction), failure-cause classification
- `openspec/specs/download/config.md` — hoster priority, DPAPI credentials, schedule config persistence
- `openspec/specs/download/scheduler.md` — in-process scheduling, manual trigger, concurrent-run guard, shutdown bounds, max-duration guard
- `openspec/specs/download/observability.md` — SDD-20 LogEntry integration, `download.*` events, durable run history, bounded retention, crash reconciliation, JD-offline links persistence
- `openspec/specs/download/ui.md` — hoster editor, JD config, schedule panel, run history, manual trigger, 2026 design bar, shared toast, AnimePanel gap
- `openspec/specs/notifications/notifications.md` — generic Notifier port, dispatcher, UI-toast adapter (notification.push), Windows desktop-toast adapter (build-tag seam), non-Windows no-op fake

## Architectural Deliverables

### Go Implementation

- **`internal/download/`** bounded context (read-only against anime; no NroCapVisto write-back, no DB-cached download counts; filesystem is the single source of truth for download state)
  - `service.go` / `ServiceDeps` — orchestrator (fan-out, failure isolation)
  - `contracts.go` — DTOs (DownloadConfig, HosterPriorityEntry, JDConfig, ScheduleConfig, DownloadRun, RunStatus, TriggerSource, ManualLink)
  - `decision.go` / `decision_test.go` — pure domain logic (trigger decision, Tipo gating, gap detection); Spanish weekday helper with accented names
  - `errors.go` — sentinel errors (ErrJDOffline, ErrNoLinks, ErrSiteUnsupported, ErrGapPageMissing, ErrGapFolderMissing)
  - `store.go` / `sqlite_store.go` / `sqlite_store_test.go` — all 4-table persistence (hoster priority, JD config DPAPI, schedule config, durable run history)
  - `registry.go` / `registry_test.go` — SiteRegistry + HosterResolver (dlexa pattern; deterministic tie-break alphabetically, unknown-after-configured, alphabetical fallback)
  - `health.go` — HealthChecker interface (future expansion point)
  - `sites/site.go` — EpisodeSource interface + SiteDescriptor
  - `sites/jkanime/jkanime.go` / `jkanime_test.go` — adapter (CSRF/ID extraction, AJAX episode listing, base64 link extraction behind interface; httptest fixture tests)
  - `jdownloader/client.go` — JDClient interface (Connect, ListDevices-gated liveness, AddAndStart, PollPackages)
  - `jdownloader/myjd.go` / `myjd_test.go` — adapter (rkosegi/jdownloader-go + 90s auto-launch poll)
  - `jdownloader/launcher.go` — exe-path resolution (download_jd_config override → Autoreas Settings fallback)
  - `filesystem/counter.go` / `counter_test.go` — EpisodeCounter (non-recursive CountAtRoot [source of truth] + recursive CountRecursive [poll before flatten])
  - `filesystem/flatten.go` — Flattener (move JD subfolder files to root, observable error-aggregation)
  - `schedule/scheduler.go` / `scheduler_test.go` — Scheduler (in-process ticker, fake-clock testable, concurrent-run guard, bounded Stop() drain, max-duration guard)
  - `config/defaults.go` / `defaults_test.go` — named constants (hoster seeds Mediafire=0/Mega=1, RUN_RETENTION_LIMIT=200, poll intervals, video exts, Spanish weekday names)

- **`internal/notification/`** shared bounded context (generic, not download-specific; architecture for SDD-29 migration)
  - `notifier.go` — Notifier port + Notification model (Title, Body, Level={info|success|warning|error}, Source, CorrelationID, Timestamp)
  - `dispatcher.go` — fan-out dispatch (one adapter failing never blocks another or the caller)
  - `ui_toast.go` / `ui_toast_test.go` — adapter (Wails `notification.push` event emit, injected fake-emit support)
  - `desktop_windows.go` / `desktop_windows_test.go` — Windows adapter (native OS desktop notification via vetted lib, NO PowerShell)
  - `desktop_other.go` — non-Windows no-op fake (clearly labeled, build-tag seam)

- **4 SQLite tables** in `bridge.db` (DDL in `internal/sync/sqlite_bootstrap.go`)
  - `download_hoster_priority` — per-site user-configurable ordering (site + hoster + priority + enabled; tied priorities break alphabetically)
  - `download_jd_config` — singleton MyJD config (email, DPAPI-encrypted password blob [write-only from UI], device name, exe-path override, default dest, last seen status, last decrypt error [non-fatal observability sink])
  - `download_schedule_config` — singleton scheduler state (mode [in_process], daily_time_hhmm, enabled, last/next run times/status)
  - `download_runs` — durable per-run history (run_id, timestamps, trigger [scheduled|manual], anime/episode/failure counts, JD-available flag, status [running|ok|partial|error|jd_offline|no_animes_today|interrupted], error_summary [captcha|hoster_down|slow_or_timeout], manual_links_json [JD-offline degradation]); bounded retention (200 rows pruned on finalize)

- **DPAPI credential encryption** (`internal/download/crypto/`, build-tag seams)
  - `crypto_windows.go` — real DPAPI (`CryptProtectData`/`CryptUnprotectData`, current-user scope, no machine-scope)
  - `crypto_other.go` — non-Windows no-op fake (clearly labeled; Windows-gated security assertions)
  - Tests: Windows-gated blob-is-not-plaintext assertions; nil-password update preserves existing blob

- **App wiring** (`app.go` / `app_download.go` / `app_test.go`)
  - Wails-bound methods: `GetDownloadConfig`, `SetHosterPriority`, `GetJDStatus`, `SetJDConfig`, `GetScheduleConfig`, `SetScheduleConfig`, `TriggerDownloadCheck`, `ListDownloadRuns`
  - Contracts DTOs: `DownloadConfig`, `JDStatus`, `JDConfigInput`, `ScheduleConfig`, `ManualLink`, `DownloadRunView`, `HosterPriorityItem`
  - Constructor override seams: `newDownloadStore`, `newDownloadService`, `newDownloadScheduler`, `newNotifier`
  - Startup: `ReconcileInterruptedRuns` (crash-zombie cleanup) before `Scheduler.Start` (line 462 before line 478)
  - Shutdown: `Scheduler.Stop()` with bounded drain (line 500)
  - nil-degradation tests (8) + positive-path delegation tests (7)

- **Events** (`internal/events/event.go`)
  - New constants/structs: `DownloadRunStartedEvent`, `DownloadRunFinishedEvent`, `DownloadEpisodeAvailableEvent`, `DownloadEpisodeDownloadedEvent`, `DownloadFailedEvent`, `DownloadSkippedEvent`, `DownloadJDStatusEvent`

- **Anime query integration** (`internal/anime/service.go`)
  - Added `HasDownloadPage` / `HasFolder` bools to `contracts.AnimeListItem` (presence-only; raw URL/path not exposed)
  - `ListAnimeItems` derives bools via `hasNonEmptyLegacyString` nil-or-empty check

### Frontend Implementation

- **`frontend/src/features/download/`** dumb-UI feature (all hooks, helpers, types in strict colocation; .tsx render-only)
  - `HosterPriorityEditor` — drag&drop primary + keyboard fallback + ARIA announcement (React Aria / HeroUI drag-and-drop primitive)
  - `use-hoster-priority.ts` + `use-hoster-priority.ts` — Wails `GetDownloadConfig` / `SetHosterPriority`
  - `JDConfigPanel` — write-only password field (never pre-filled); live status indicator (online/offline)
  - `use-jd-config.ts` + `use-jd-status.ts` — Wails `GetJDStatus` / `SetJDConfig`
  - `SchedulePanel` — enable toggle, cadence/time, next/last-run, last-status; "running-bridge requirement" note for scheduled runs
  - `use-schedule-config.ts` — Wails `GetScheduleConfig` / `SetScheduleConfig`
  - `RunHistoryPanel` — master/detail view (past `download_runs` rows); detail shows manual links when `status="jd_offline"`
  - `use-download-runs.ts` — Wails `ListDownloadRuns`
  - `ManualTriggerButton` — immediate run trigger; loading/in-progress state; `ErrRunInProgress` surface
  - `use-download-trigger.ts` — Wails `TriggerDownloadCheck`
  - **2026 quality bar**: HeroUI v3 + Tailwind design tokens (no ad-hoc styling), explicit loading/empty/error states, responsive + accessible

- **Shared app-shell toast** (`frontend/src/app/**`)
  - `use-notification-toasts.ts` hook — subscribes to `notification.push` Wails event (via `infrastructure/notification-source.ts` adapter)
  - `NotificationToasts.tsx` — HeroUI `Toast.Provider` mounts in app-shell (hook-free `AppLayout.tsx` preserved)
  - Maps notification `Level` to toast styles (success/warning/error/info)
  - NOT inside `features/download` — reusable by SDD-29 and beyond

- **`infrastructure/notification-source.ts`** — Wails event adapter (mirrors `observability-log-source.ts`)

- **Anime gap badge** (existing `features/anime/ui/AnimePanel/`)
  - `AnimeViewModel` — added `hasDownloadPage` / `hasFolder` / `hasDownloadGap` / `gapLabel` derived properties
  - `AnimeFilterState` — added `gap` filter (`all` / `missing` / `complete`)
  - `AnimeFilterBar` — added "Filter by download gap" Select
  - `AnimePanel` — renders gap badge (warning-colored `Chip`, `data-testid="anime-gap-{id}"`) when `hasDownloadGap`
  - Frontend contracts (`shared/contracts/anime.types.ts`) + zod schema extended to mirror Go `HasDownloadPage` / `HasFolder`

- **Frontend tests**: 330/330 passing across 45 files (HeroUI toast, download hooks + components, anime gap, infrastructure event handling)

### Verification & Quality

- **Go tests**: 76 tests passing (download 76.3%, config 100%, crypto 88.5%, filesystem 93.3%, jdownloader 75.3%, schedule 80%, jkanime 80.2%, notification 72.7%)
  - Pure decision logic (trigger, Tipo, gap) tested before I/O
  - Adapters tested via httptest fixtures (jkanime CSRF/AJAX/links), temp-db (store), temp-dirs (filesystem), fake clock (scheduler)
  - Fixture validation via recorded real HTML/JSON (no live network in CI)
  - DPAPI blob-is-not-plaintext assertion Windows-gated; non-Windows fake labeled + tested

- **Frontend tests**: 330/330 passing
  - Hook contracts + state transitions (load, mutation, error)
  - Component rendering + interaction (drag&drop, keyboard reorder, form submission)
  - Event subscription (notification.push → toast render)
  - Accessibility (ARIA announcements, keyboard navigation, labels)

- **Linting**
  - `go build ./...` — clean
  - `go vet ./...` — clean
  - `checkgofmt` — passed (after parking `cmd/poc` PoC to git stash; see Notes)
  - `golangci-lint run` — **clean, 0 issues** (after parking `cmd/poc`)
  - `bun typecheck` — 0 errors
  - `bun lint` — 0 errors; 4 advisory warnings (pre-existing, unrelated to this change)
  - `bun test` — 330/330 passing
  - Cross-build validation (`GOOS=linux GOARCH=amd64 go build ./...`) — clean (validates !windows build-tag fakes)

## Known Drift Recorded

Per CLAUDE.md project rule: "If docs, specs, or archived changes disagree with the codebase, the code wins as runtime truth. Record the drift explicitly before proposing fixes."

**Auto-start-on-login drift**: documented in `docs/architecture.md` §1.4 (`internal/system` HKCU\Run registration) but NEVER IMPLEMENTED. SDD-28 ships in-process-scheduler-only; the schedule UI surfaces explicitly that scheduled runs require the bridge to be running (no missed-run-after-reboot guarantee in this change). Auto-start is DEFERRED to a separate LATER follow-up change (NOT the immediate next one; the immediate next change SDD-29 is the notifications rework). This was a deliberate decision (proposal §Out of Scope, decision 2) to keep SDD-28's rollback purely additive with zero OS-level side effects.

## Out of Scope / Follow-Ups

- **SDD-29 (immediate next change)**: notifications rework — migrate `sync` / `anime` / `device` / `observability` onto the shared `Notifier` port + shared toast surface built here.
- **Auto-start-on-login** (separate LATER follow-up, NOT the immediate next): `internal/system` HKCU\Run registration (documented but unimplemented; drift noted above).
- **Additional scraper sites** beyond jkanime — the in-code registry seam is built; adding a site requires writing its adapter code anyway.
- **Full Películas/OVAs support** — Tipo 1/2 are explicitly skipped with surfaced reason (mandatory); full support deferred if jkanime's movie/OVA URL conventions differ materially.
- **Programmatic captcha-solving** — out of scope entirely; in-scope is telemetry distinguishing captcha / hoster-down / slow-download failure causes.
- **Mobile/tablet remote trigger** (`internal/api`) — desktop-only feature.
- **Windows Scheduled Task executor** — rejected in favor of in-process.

## Notes

- The throwaway `cmd/poc` PoC (10 files, untracked) failed `checkgofmt` + `golangci-lint` and would have blocked the pre-commit gate. Its logic is fully superseded by the tested `internal/download` feature; it was parked to `git stash` (`stash@{0}`, recoverable via `git stash pop`) rather than committed or deleted, per the user's decision. The `autoreas-bridge.exe` build artifact is excluded from the commit.
- Two initially-introduced react-doctor cascading-state advisories (HosterPriorityEditor + RunHistoryPanel) were resolved by consolidating each hook's load + mutation state into a single state object, collapsing the effect to one `setState` per outcome. Hook-internal `State` interfaces moved to colocated `*.types.ts` files. All 330 frontend tests still pass; typecheck clean.
- The download context is strictly READ-ONLY against the anime context: no `NroCapVisto` write-back, no DB-cached download counts. The filesystem is the single source of truth for download state; `download_runs` is historical telemetry only — never consulted for re-download decisions.

## SDD Cycle Complete

The change has been fully planned (proposal), specified (7 capabilities), designed (architecture + 5 sequence diagrams), tasked (69 items across 8 phases), implemented (76 tests, 330 frontend tests, all green), verified (PASS WITH WARNINGS; 2 lint advisories resolved), and archived.

Ready for the next change.
