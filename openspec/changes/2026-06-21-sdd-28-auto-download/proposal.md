# Proposal: SDD-28 Automated Anime Downloading

**Change ID:** `2026-06-21-sdd-28-auto-download`

## Intent

The PoC (`cmd/poc/*.go`, 10 files, all `package main`) validated the full automated-download pipeline end-to-end: read today's active animes from `bridge.db`, scrape jkanime.net for new episodes, batch-download via MyJDownloader by hoster priority, detect completion via filesystem polling, flatten JD's package subfolders, and notify. Feasibility is proven; architecture is not. The PoC mashes scraping, hoster ordering, JD integration, filesystem accounting, decision logic and notification into a single monolithic `package main` with hardcoded site detection (`strings.Contains(pagina, "jkanime.net")`), a compiled `hosterPriority` map, plaintext MyJD credentials in env vars, and raw `database/sql` reads against `anime_snapshots`.

This change turns the validated PoC into a properly-architected, production-grade feature: a new hexagonal bounded context `internal/download`, wired in `app.go` exactly like `internal/device`, with a multi-site scraper registry, user-configurable persisted hoster priority, secure JD credential storage, an in-process scheduler, durable run history, full SDD-20 observability integration, and a dumb-UI `download` frontend feature. The `internal/download` context is strictly READ-ONLY against the anime context — it reads animes via `AnimeQueryService` and persists ONLY its own `download_*` tables; it never writes shared anime state.

This change ALSO builds the project's first **shared, generic user-notification architecture** — a new bounded context `internal/notification` (mirroring `internal/device`) plus a shared frontend toast surface in the app-shell — with `internal/download` as its FIRST consumer. The repository has no shared notification mechanism today (only backend `fsnotify` for file watching and Wails runtime events like `observability.log`; the frontend has zero toast). The download PoC's throwaway PowerShell toast is replaced by a proper, vetted desktop-toast adapter behind the same port. This inclusion is EXCEPTIONAL: notification work would normally be its own change, but the project's no-tech-debt policy forbids shipping yet another bespoke notification hack, and the architecture's magnitude makes it cheaper to design once, generically, here. The architecture is deliberately NOT download-specific so the immediate next change (SDD-29, a notifications rework) can migrate `sync`/`anime`/`device`/`observability` onto it.

Success looks like: a resident tray app that, on a user-configured schedule (or manual trigger), checks today's active jkanime series, downloads only genuinely-missing episodes, records every run durably, surfaces JD/scraper/data-gap status visibly, and never silently mis-triggers — all with tests as first-class deliverables under strict TDD.

## Why now

The PoC has answered the only open feasibility questions (jkanime template shape, MyJD `ListDevices` liveness quirk, the online-vs-disk trigger semantic). What remains is purely architectural and security work that the PoC deliberately deferred. Shipping the monolithic PoC as-is would lock in plaintext credentials, single-site hardcoding, and untestable orchestration — each a strict regression against this codebase's established standards. Doing the refactor now, while the validated logic is fresh and isolated in `cmd/poc`, is the lowest-cost path to a maintainable feature.

## What changes

- **New bounded context `internal/download`** with internal sub-packages: `sites/` (per-site scraper adapters behind a dlexa-style source/registry), `jdownloader/` (MyJD adapter), `filesystem/` (episode counting + JD subfolder flattening), `schedule/` (in-process scheduler).
- **Multi-site scraper registry** replacing all PoC `strings.Contains` site detection — jkanime registered as the only site initially, but the seam exists for future sites without a rewrite.
- **Hoster-priority registry** replacing the compiled `hosterPriority` map — user-configurable and persisted.
- **4 new SQLite tables** in `bridge.db` (`download_hoster_priority`, `download_jd_config`, `download_schedule_config`, `download_runs`) following the existing `initializeBridgeDB` + column-introspection migration discipline. (No per-site `download_site_config` table — the single-site reality keeps the site/scraper registry in code; see decision 3.)
- **In-process scheduler** inside the resident Wails tray app, gated by `download_schedule_config` — not a Windows Scheduled Task.
- **DPAPI-encrypted MyJD credential storage** in `download_jd_config`, replacing plaintext env vars / `.env`.
- **Wails-bound methods on `App`** (e.g. `GetDownloadConfig`, `SetHosterPriority`, `SetJDConfig`, `GetJDStatus`, `SetScheduleConfig`, `TriggerDownloadCheck`, `GetDownloadRuns`) — desktop-only, NOT exposed through `internal/api`.
- **New events on the existing `events.Bus`** (e.g. `download.episode_available`, `download.completed`, `download.failed`) for observability/UI subscription.
- **SDD-20 observability integration**: structured `LogEntry` emission with `domain="download"`, `CorrelationID=run_id`, plus durable `download_runs` rows for cross-restart history (historical telemetry only — never a re-download authority; see decision 5).
- **New frontend feature `frontend/src/features/download`** (scaffolded via `bun --cwd="frontend" run generate:feature`): hoster-priority editor, JD config panel with live status, schedule config panel, run-history/log panel, manual trigger.
- **Reads animes via `anime.AnimeQueryService` / `bridgeSync.AnimeSnapshotStore`** — never raw SQL. The download context performs NO write against the anime context: no `NroCapVisto` write-back, no `AnimeWriteService` dependency. It writes only its own `download_*` tables.
- **New shared bounded context `internal/notification`** (generic `Notifier` port + dispatcher + UI-toast and Windows-desktop-toast adapters) mirroring `internal/device`. Download EMITS user-notable moments (download completed, run failed, JD offline, anime skipped) through the injected `Notifier` port; it contains NO OS-toast code of its own.
- **New shared frontend toast surface** in the app-shell (`frontend/src/app/**`) subscribing to a `notification.push` Wails runtime event and rendering via HeroUI's toast — NOT inside `features/download`.

## Scope

### In Scope
- jkanime series (Tipo serie) end-to-end: scrape, hoster-ordered enqueue, completion polling, flatten, notify.
- In-code multi-site + hoster-priority registry infrastructure (jkanime as the sole registered site; adding a site requires writing its adapter code, so the registry seam stays in code — no per-site DB table).
- 4 new SQLite tables and their bootstrap/migration wiring.
- DPAPI-encrypted JD credential storage.
- **Shared, generic notification architecture** (`internal/notification`: `Notifier` port + dispatcher + UI-toast and Windows-desktop-toast adapters) plus a shared frontend toast surface in the app-shell, with `internal/download` as its first consumer. Built generically so SDD-29 can migrate the other features onto it. (Exceptional inclusion — see Intent and decision 11.)
- In-process scheduler gated by config (in-process only; the bridge must be running for scheduled runs to fire — see Out of Scope and decision 2).
- Durable `download_runs` history + SDD-20 structured logging — historical telemetry only.
- Filesystem-as-source-of-truth for download state: the count of video files on disk is the ONLY authority for what has been downloaded (see decision 5).
- Wails bindings on `App` and the `download` frontend feature.
- Explicit, observable handling of legacy `pagina`/`carpeta` gaps (surfaced, never silently skipped).
- Explicit, observable skip-or-handle decision for Películas/OVAs (Tipo 1/2) — must not silently mis-trigger.
- Tests as first-class deliverables for every new package (strict TDD).

### Out of Scope (follow-up)
- **Additional scraper sites** beyond jkanime — the in-code registry seam is built now, but no second adapter is implemented. Rationale: no second site is requested; adding a site requires writing its scraper adapter code regardless, so the registry stays in code and a per-site config DB table would be over-engineering for a single site.
- **Migrating other features (`sync`/`anime`/`device`/`observability`) onto the shared notifier** — DEFERRED to the IMMEDIATE NEXT change, **SDD-29 (notifications rework)**. SDD-28 builds the generic architecture and wires download as the first consumer only. Rationale: the architecture is generic by design so SDD-29 is a pure migration with no redesign; doing every feature's migration here would balloon SDD-28's scope.
- **Full Películas/OVAs download support** — if jkanime's movie/OVA URL and episode-count conventions diverge materially from series, full support is deferred. The non-negotiable in-scope requirement is an *explicit, surfaced skip reason*, never a silent mis-trigger. Rationale: series are the dominant case and the validated PoC path; movie/OVA scraping needs separate adapter validation.
- **Programmatic captcha-solving** — out of scope entirely. In scope is *telemetry that distinguishes* captcha / hoster-down / slow-download failure causes in `download_runs.error_summary` and structured logs, plus the existing try-next-hoster fallback. Rationale: automated captcha solving is a large, fragile, separate problem; the user did not request it.
- **Mobile/tablet remote trigger** (`internal/api`) — desktop-only feature; no paired-device surface.
- **Windows Scheduled Task executor** — rejected in favor of in-process (see decision 2).
- **Auto-start-on-login (`internal/system` HKCU\Run registration)** — DEFERRED to a separate LATER follow-up change (NOT the immediate next one; the immediate next change SDD-29 is the notifications rework). SDD-28 ships in-process-scheduler-only; the schedule UI surfaces that scheduled runs require the bridge to be running. Rationale: auto-start is OS-level side-effect work that is orthogonal to the download pipeline and keeps SDD-28's rollback purely additive (see decision 2 and design §6.1).
- **NroCapVisto write-back / any DB-cached "downloaded count"** — REJECTED entirely (not deferred). The filesystem is the single source of truth for download state; the system must not persist a downloaded count as a re-download authority (see decision 5).
- **`golang.org/x/net/html` DOM rewrite** of HTML extraction — regex stays for now, isolated behind the adapter interface (see decision 10).
- **Replacing the legacy `.dat` parser / dropping the legacy desktop app as a writer** — the bridge reads snapshots; legacy viewing-progress writing remains entirely the legacy app's job. The download context never writes anime state.

## Affected modules/packages

| Area | Impact | Description |
|------|--------|-------------|
| `internal/download/` | New | Bounded context: `Service` orchestrator + DTOs/contracts |
| `internal/download/sites/` | New | Site-scraper registry + jkanime adapter (regex extraction behind interface) |
| `internal/download/jdownloader/` | New | MyJD adapter (`Connect`/`ListDevices`/`addAndStart`/auto-launch) |
| `internal/download/filesystem/` | New | Episode counting (non-recursive tally + recursive poll) + flatten |
| `internal/download/schedule/` | New | In-process scheduler (Go timer/cron, gated by config) |
| `internal/notification/` | New (shared) | Generic `Notifier` port + dispatcher + UI-toast adapter (Wails `notification.push` emit) + Windows-desktop-toast adapter (build-tag seam, non-Windows no-op fake). NOT download-specific; download is its first consumer. |
| `internal/sync/sqlite_bootstrap.go` | Modified | DDL + migration functions for the 4 new tables |
| `internal/events/` | Modified | New `download.*` event names |
| `internal/anime/` | Reused (READ-ONLY) | `AnimeQueryService` (read only via `ListMobileAnimes`/`GetMobileAnime`); NO write dependency |
| `internal/logger/` | Reused | SDD-20 `LogEntry` shape with `domain="download"`, `CorrelationID=run_id` |
| `app.go` | Modified | Wire `download.Service` (constructor override hooks) + Wails-bound methods + scheduler lifecycle |
| `frontend/src/features/download/` | New | Dumb-UI feature: hoster editor, JD config, schedule, run history, manual trigger |
| `frontend/src/app/` (app-shell) | Modified | Shared toast surface: HeroUI `Toast.Provider` mounted in the shell + a `use-*.ts` listener hook subscribing to the `notification.push` Wails event. NOT inside any feature; reused by SDD-29. |
| `frontend/src/infrastructure/` | New | `notification-source.ts` — `EventsOn('notification.push')` adapter mirroring `observability-log-source.ts`. |
| `frontend/src/features/anime/` | Possibly modified | Per-anime `pagina`/`carpeta` gap badge/filter |
| `frontend/src/app/routes/` | Modified | New route composing the `download` feature |
| `cmd/poc/` | Removed (eventually) | Replaced by the production context; retained only until parity is verified |

## Key architectural decisions

1. **One bounded context `internal/download` with internal sub-packages.** A single context owning `sites/`, `jdownloader/`, `filesystem/` and `schedule/` mirrors the `device` context's scale (single `Service` + `Store`), the established granularity in this codebase. We mirror dlexa's `source`/`fetch`/`parse` *separation inside* the context rather than as separate top-level bounded contexts. Splitting into `internal/scrape` + `internal/acquisition` is rejected as premature generalization (YAGNI) — there is exactly one consumer of scraping today. Revisit only if a genuinely independent scraping consumer emerges.

2. **In-process scheduler, not a Windows Scheduled Task.** The app is `HideWindowOnClose: true` (`main.go`) — closing the window does not exit the process; the tray app is *designed* to stay resident. An in-process scheduler (Go timer/cron gated by `download_schedule_config`) is trivially testable as just another `app.go`-wired goroutine, reuses 100% of the existing event bus / logger / observability stack, and has no install/privilege story. The only remaining gap — surviving a full reboot before the user relaunches — would be closed by auto-start-on-login, which is documented but unimplemented (confirmed drift; design §6.1). **Auto-start is DEFERRED to a separate LATER follow-up change (NOT the immediate next one — the immediate next change SDD-29 is the notifications rework), out of SDD-28 scope.** SDD-28 ships in-process-only and the schedule UI surfaces explicitly that scheduled runs require the bridge to be running (no missed-run-after-reboot guarantee in this change). This keeps SDD-28's rollback purely additive with zero OS-level side effects.

3. **Build the multi-site + hoster-priority registry now (jkanime as the only registered site), keeping the SITE registry in CODE (no `download_site_config` table).** Adopting dlexa's `source.Source` + `StaticRegistry` + `engine.Resolver` pattern, both per-site scraper selection and hoster ordering become priority-ordered named providers resolved through a registry — not the PoC's hardcoded `strings.Contains` branch and compiled `hosterPriority` map. The site/scraper registry lives in code (a `StaticRegistry` of `EpisodeSource` adapters): adding a new site requires writing its scraper adapter code anyway, so a per-site SQLite config table (`download_site_config`) would be over-engineering for the single-site reality — it is DROPPED. Hoster priority, by contrast, IS user-configurable runtime data with no code change, so it remains persisted in `download_hoster_priority`. Marginal cost of the in-code registry is low (the dlexa pattern is copy-adaptable); the alternative actively blocks any future site or hoster reorder without a rewrite.

4. **MyJD credentials stored DPAPI-encrypted in `download_jd_config`, never plaintext.** `bridge.db` is unencrypted and lives in a user-writable `%APPDATA%` path; plaintext credentials there are a strict regression versus even the gitignored `.env`. DPAPI (Windows Data Protection API via `golang.org/x/sys/windows`), scoped to the current Windows user, keeps everything in the single-database operational model. The password is write-only from the UI — never round-tripped back in cleartext. **Design phase may weigh** Windows Credential Manager (`wincred`) as the more-idiomatically-secure alternative, at the cost of a second persistence mechanism.

5. **Filesystem is the source of truth for download state — NO `NroCapVisto` write-back and NO DB-cached "downloaded count".** The count of video files on disk is the ONLY authority for what has been downloaded. The system MUST NOT persist a "downloaded count" in `bridge.db` as a re-download authority, and MUST NOT write `NroCapVisto` back. **Rationale:** if a user manually deletes an episode from disk, a DB-cached count would cause the feature to wrongly skip re-downloading it. `download_runs` rows are HISTORICAL telemetry only — never consulted to decide whether to download. The trigger (`online_latest_episode_number > count_of_video_files_on_disk`) is re-derived from disk on every run. The download context is therefore strictly READ-ONLY against the anime context: it reads through `AnimeQueryService` and never opens `animes.dat` nor depends on `AnimeWriteService`. (NroCapVisto write-back was previously proposed; the user definitively rejected it along with any DB-cached download count.)

6. **Trigger semantic is PRESERVED EXACTLY — download when `online_latest_episode_number > count_of_video_files_on_disk`, NOT `> NroCapVisto` and NOT `> any DB-cached count`.** This is a hard-won correctness finding confirmed against real legacy semantics in the PoC (`result.LatestEp > result.Downloaded`, where `LatestEp` is the highest episode NUMBER available online and `Downloaded` is the live count of video files in the folder). The on-disk count is re-derived every run — never read from `bridge.db`. NroCapVisto tracks *viewing* progress, not *download* presence; triggering off it (or off a cached count) would re-download watched-but-deleted episodes or skip unwatched-but-present ones. **This is non-negotiable** and must be encoded explicitly in the spec.

7. **Read animes via `anime.AnimeQueryService` / `bridgeSync.AnimeSnapshotStore`, never raw SQL against `anime_snapshots`.** The PoC duplicated `SELECT snapshot_json ...` + manual unmarshal into a parallel, weaker legacy parser, and redundantly re-resolved the DB path. The official feature reuses the existing `contracts.AnimeQueryService` surface (`ListAnimeItems`/`GetEffectiveAnime`) and the single `SQLiteBootstrap` path resolution — one bootstrap, one parser, one tri-state legacy model.

8. **Reuse the SDD-20 observability contract PLUS a durable `download_runs` table.** Per-episode/per-run events go through the existing `logger.Logger` with the SDD-20 `LogEntry` shape (`domain="download"`, `CorrelationID=run_id`, `EntityID=animeID`, `EventType`, `DurationMs`, `Metadata`), feeding the `MemLogger` ring buffer + `ObservabilityPanel` live feed. Because the ring buffer is bounded (500 entries) and not persisted across restarts, a durable `download_runs` table answers "did last night's scheduled run succeed" across restarts. Both share `run_id` so the UI can cross-reference a run row to its detailed log entries.

9. **Películas/OVAs (Tipo 1/2): explicitly handle-or-skip with a surfaced reason.** The PoC reads `Tipo` but never branches on it — silently broken today for movie/OVA-type records. The official feature must, at minimum, detect Tipo 1/2 and emit a visible, observable skip reason (`download_runs` status + structured log + UI surface), never a silent mis-trigger. Full movie/OVA download support may be deferred (see Scope), but the explicit, observable skip is mandatory.

10. **HTML extraction stays regex-based for now, isolated behind the site-adapter interface.** Regex extraction of jkanime's inline `var servers = [...]` JS array is the single most fragile point in the pipeline, but it is validated working today. By isolating it behind the `source`/`engine.Resolver`-style adapter interface, a future `golang.org/x/net/html` DOM rewrite can replace the *implementation* without touching orchestration. The rewrite itself is deferred; the isolation is built now.

11. **Build a SHARED, generic notification architecture now — `internal/notification` + a shared frontend toast — with download as the first consumer (EXCEPTIONAL inclusion).** The repository has NO shared user-notification mechanism today (only backend `fsnotify` and Wails runtime events like `observability.log`; the frontend has zero toast). The download PoC's PowerShell toast was a throwaway hack. Rather than ship yet another bespoke notification path (which the project's no-tech-debt policy forbids), this change builds a generic `Notifier` port (`Notify(ctx, Notification)` with a domain-agnostic `Notification` value) behind a dispatcher fanning out to a UI-toast adapter (Wails `notification.push` event) and a proper Windows desktop-toast adapter (vetted lib/native syscall behind a build-tag seam, NOT PowerShell). `internal/download` depends on the injected `Notifier` and emits user-notable moments through it — it carries NO OS-toast code. This is the canonical pattern the IMMEDIATE NEXT change, SDD-29 (notifications rework), rolls out to `sync`/`anime`/`device`/`observability`. The inclusion is exceptional and justified by the architecture's magnitude (cheaper to design once, generically) and the no-tech-debt policy. **Rejected:** keeping the PoC PowerShell toast (tech debt; not generic); deferring all notification work to SDD-29 (would leave download with no user feedback or a throwaway path SDD-29 must then unwind). See design "Notification Architecture" + ADR-NOTIF-1/2/3.

## New SQLite tables

(Schema columns belong in design — these are names + purpose only.)

| Table | Purpose |
|-------|---------|
| `download_hoster_priority` | User-configurable per-site hoster ordering (replaces the compiled `hosterPriority` map); seeded with PoC defaults on first run. |
| `download_jd_config` | Singleton MyJD connection/device config with DPAPI-encrypted password, exe-path override, last-seen status, default destination. |
| `download_schedule_config` | Singleton scheduler config (mode, time/cadence, enabled, last/next run) — single source of truth regardless of executor. |
| `download_runs` | Durable per-run history (run_id, timestamps, trigger, counts, jd_available, status, error_summary) for cross-restart observability. |

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MyJD credentials stored insecurely | High (hard blocker) | DPAPI-encrypt at rest scoped to the current Windows user; password write-only from UI, never round-tripped in cleartext. Resolve before ship. |
| JD `Connect()` succeeds while JD is offline | High | Never trust `Connect()` alone — gate liveness on `ListDevices()`; preserve the PoC's 90s auto-launch poll; surface `status="jd_offline"` in `download_runs` + a doctor-style health check. |
| Captcha / hoster-failure ambiguity | Medium | No programmatic captcha-solving; keep try-next-hoster fallback but distinguish captcha vs hoster-down vs slow-download in `download_runs.error_summary` + structured log `EventType` so unattended runs give actionable signal. |
| jkanime template drift (regex fragility) | Medium-High | Isolate extraction behind the site-adapter interface; emit a loud `download.failed` event + run-status when 0 links/episodes are extracted (never a silent empty result); validate against real fixtures. |
| Legacy `pagina`/`carpeta` gaps | Medium | Already tolerated by `LegacyAnimeRaw` tri-state fields; surface "no page/folder configured" as a visible, actionable UI state + skip reason — never a silent skip. |
| Concurrency with the append-only writer / sync engine | None | The download context writes NO shared anime state (no NroCapVisto write-back, no `AnimeWriteService` dependency); it reads only through `AnimeQueryService` and writes only its own `download_*` tables. The only former shared-state write path is removed entirely. Never opens `animes.dat` directly. |
| Cross-app coupling to Autoreas Settings (`downloader.dir`) | Low-Medium | Treat the third-party Settings file as best-effort fallback only; prefer the `download_jd_config.exe_path_override`; degrade gracefully and observably if the Settings file shape/location changes. |
| In-process scheduler misses runs after full quit / reboot | Low-Medium | Accepted limitation in SDD-28: surface in the schedule UI that scheduled runs require the bridge to be running. Auto-start-on-login closure is deferred to a separate later follow-up (NOT SDD-29, which is the notifications rework) — design §6.1. |

## Rollback plan

The feature is purely additive — a new bounded context, new tables, new events, new Wails bindings, and a new UI route. Back-out is clean:

1. **Disable at runtime first:** the scheduler is gated by `download_schedule_config.enabled`; setting it off (and not triggering manually) makes the feature dormant with zero side effects on the rest of the bridge.
2. **Revert wiring:** remove the `download.Service` wiring, Wails-bound methods, and scheduler lifecycle from `app.go`. Parser, watcher, writer, snapshots, changelog, device/api and sync continue functioning unchanged.
3. **Remove the context:** delete `internal/download/` and the `download.*` event names.
4. **Remove the frontend feature:** delete `frontend/src/features/download/` and its route; the `anime` gap-badge addition is independently revertible.
5. **Tables:** the 4 new tables are `CREATE TABLE IF NOT EXISTS` additions; they can be left in place harmlessly (no FK from existing tables) or dropped via an explicit migration. No existing table is altered, so reverting requires no destructive migration of pre-existing data.

The feature mutates NO shared state: there is no NroCapVisto write-back and no `AnimeWriteService` dependency, and the in-process-only scheduler creates no OS-level side effects (auto-start is deferred to a separate later follow-up, not SDD-29). Back-out is therefore purely additive — disabling the scheduler renders the feature fully dormant. The new `internal/notification` context and shared frontend toast are likewise purely additive (a new context, a new app-shell provider, a new `notification.push` event) and independently revertible.

## Capability/spec areas (target list for the SPEC phase)

The SPEC phase should write delta specs for these capabilities:

- **`download-orchestration`** — the trigger decision (online latest-episode-number > disk-count, re-derived from disk every run; filesystem is the source of truth, never a DB-cached count), per-anime fan-out with failure isolation, hoster-ordered enqueue, completion polling, flatten, Película/OVA explicit skip, `pagina`/`carpeta` gap handling.
- **`download-sites`** — the scraper registry contract (source/registry + resolver), the jkanime adapter behavior (anime-ID/CSRF, episode listing, link extraction), and the fragility/error-surfacing requirements.
- **`download-config`** — hoster priority and JD config (with DPAPI credential-security requirements, write-only password), persisted in the new tables. (No `download_site_config` table — the site registry is in code, per decision 3.)
- **`download-scheduler`** — in-process scheduling behavior gated by `download_schedule_config`, manual trigger, next/last-run semantics.
- **`download-observability`** — SDD-20 `LogEntry` integration (`domain="download"`, `run_id` correlation), `download.*` events, durable `download_runs` history, JD/scraper/data-gap status surfacing.
- **`download-ui`** — the dumb-UI `download` feature (hoster editor, JD config + live status, schedule panel, run history, manual trigger) under the strict frontend constraints.
- **`notifications`** (NEW shared capability) — the generic `Notifier` contract, the domain-agnostic `Notification` model, the two adapters (UI-toast via `notification.push` Wails event + Windows desktop toast) and their fan-out isolation semantics, the `notification.push` event contract the frontend depends on, and the non-Windows no-op fake behavior. Generic by design (download is the first consumer; SDD-29 migrates the rest).

Follow-ups after SDD-28:
- **SDD-29 (immediate next): notifications rework** — migrate `sync`/`anime`/`device`/`observability` onto the shared `Notifier` port + shared toast surface built here.
- **Auto-start-on-login (separate, LATER follow-up — NOT the immediate next):** `internal/system` HKCU\Run registration (see Out of Scope and decision 2).

(SPEC may merge `download-observability` into `download-orchestration` if it proves thin; named separately here so SPEC has a complete target list.)
