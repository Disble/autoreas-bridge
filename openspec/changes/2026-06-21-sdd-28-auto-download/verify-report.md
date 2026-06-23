# Verify Report: SDD-28 Automated Anime Downloading

- Change: `2026-06-21-sdd-28-auto-download`
- Verified by: orchestrating agent (final verification, not delegated — per AGENTS.md rule 3)
- Date: 2026-06-22

## Scope verified

The official, production-grade automated anime download feature: a hexagonal `internal/download` bounded context (read-only against the anime context), a generic shared `internal/notification` context (download as first consumer), 4 new SQLite tables, an in-process scheduler, DPAPI-encrypted JD credentials, durable run telemetry, Wails bindings, and a dumb-UI `download` frontend feature + shared app-shell toast + AnimePanel gap badge.

All 65 implementation tasks (Phases 1–7) plus 4 integration/verification tasks (Phase 8) are complete and marked `[x]` in `tasks.md`.

## Gate results (run by the orchestrator)

### Go
- `go build ./...` — clean
- `go vet ./...` — clean
- `go run ./tools/checkgofmt` — **passed** (after parking the throwaway `cmd/poc` PoC to git stash; see Notes)
- `golangci-lint run` (whole module) — **clean, 0 issues** (after parking `cmd/poc`)
- `go test ./...` — all packages pass
- `go test ./... -cover` — download 76.3%, download/config 100%, download/crypto 88.5%, download/filesystem 93.3%, download/jdownloader 75.3%, download/schedule 80.0%, download/sites/jkanime 80.2%, notification 72.7%
- `go run ./tools/checkopenapi` — passed
- `GOOS=linux GOARCH=amd64 go build ./...` — clean (validates the `!windows` build-tag fakes for DPAPI + desktop toast)

### Frontend
- `bun --cwd="frontend" run typecheck` — 0 errors
- `bun --cwd="frontend" run lint` — 0 errors, 6 advisory warnings (see Warnings)
- `bun --cwd="frontend" run test` — 330/330 tests passing across 45 files

## Requirement coverage (by capability)

- **download-orchestration** — trigger semantic `online_latest_episode_number > on_disk_count` (NroCapVisto never consulted; numbering-gap case), filesystem-is-source-of-truth, per-anime failure isolation → `partial`, hoster-ordered enqueue + fallback, completion polling, flatten, Tipo 1/2 skip + missing pagina/carpeta skip surfaced, user-notable moments via shared Notifier. Verified by `internal/download` unit tests (decision_test, service_test).
- **download-sites** — code-resident site registry, jkanime CSRF/AJAX/base64 extraction, loud zero-links failure, failure-cause classification. Verified by `sites/jkanime` httptest-fixture tests.
- **download-config** — hoster priority CRUD/seed/deterministic ordering, DPAPI write-only credentials (current-user scope, blob-not-plaintext Windows-gated), schedule config. Verified by `sqlite_store_test`, `registry_test`, `crypto_test`.
- **download-scheduler** — config-gated in-process scheduling, concurrent-run guard (scheduled silent-skip / manual `ErrRunInProgress`), bounded `Stop()` drain + run max-duration guard, runs-require-running-bridge. Verified by `schedule/scheduler_test` (fake clock).
- **download-observability** — `LogEntry` (domain="download", CorrelationID=run_id) + `download.*` events, durable `download_runs`, bounded retention (200), crash-zombie reconciliation → `interrupted`, JD-offline manual-links persistence. Verified by `sqlite_store_test`, `internal/events` tests.
- **notifications** — generic `Notifier` port + dispatcher fan-out failure isolation, UI-toast adapter (`notification.push` mirroring observability emit), Windows desktop-toast adapter behind build-tag with non-Windows no-op fake (NO PowerShell). Verified by `internal/notification` tests + `app_test` wiring.
- **download-ui** — 5 panels (hoster drag&drop + keyboard reorder + ARIA, JD config write-only password + live status, schedule, run history master/detail with manual links, manual trigger), 2026 quality bar, toasts-not-owned-by-feature, AnimePanel gap badge. Verified by colocated frontend `__tests__` (330 tests).

## Warnings (PASS WITH WARNINGS rationale)

`bun run lint` reports 4 advisory ESLint warnings (0 errors; the gate passes — the lint script is `eslint .` without `--max-warnings 0`):
- 4 pre-existing, unrelated to this change (`features/anime/ui/AnimePanel/use-anime-panel.ts`, `features/dashboard/ui/SyncingAnimePanel/use-syncing-anime-panel.ts`).

Follow-up RESOLVED: the 2 `react-doctor/no-cascading-set-state` advisories originally introduced by this change (in the HosterPriorityEditor and RunHistoryPanel hooks) were cleared by consolidating each hook's load + mutation state into a single state object and collapsing the effect to one `setState` per outcome. The hook-internal `State` interfaces were moved to the colocated `*.types.ts` files to satisfy strict colocation. All 330 frontend tests still pass; typecheck clean.

## Notes

- The throwaway `cmd/poc` PoC (untracked, from a prior session) failed `checkgofmt` + `golangci-lint` and would have blocked the pre-commit gate. Its logic is fully superseded by the tested `internal/download` feature; it was parked to `git stash` (`stash@{0}`, recoverable via `git stash pop`) rather than committed or deleted, per the user's decision. The `autoreas-bridge.exe` build artifact is excluded from the commit.
- The download context is strictly READ-ONLY against the anime context: no NroCapVisto write-back, no DB-cached download counts (filesystem is the single source of truth for download state).
- Out of scope / follow-ups: SDD-29 = notifications rework (migrate sync/anime/device/observability onto the shared Notifier); auto-start-on-login (HKCU\Run / `internal/system`, documented in docs/architecture.md §1.4 but never implemented — drift) is a separate later follow-up; movies/OVAs (Tipo 1/2) are explicitly skipped, not supported; programmatic captcha-solving is out of scope.

### Verdict

PASS WITH WARNINGS
