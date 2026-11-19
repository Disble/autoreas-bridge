# Coverage tier draft — 2026-11-18

**Status: approved by the owner on 2026-11-18.** Task T6 of `odd/tasks/test-suite-debt.md`. Nothing here is adopted or
enforced: `coverage-tiers.json` is unchanged, and `docs/coverage-tiers.md` stays guidance. The purpose is
to decide which tests may be reduced in T7 without losing quality: CORE keeps every guard, IMPORTANT keeps
behavior coverage, INFRASTRUCTURE needs no tests.

Weights are measured in the 2026-11-18 baseline (`2026-11-18-test-suite-inventory.csv`): test files,
test cases (Go top-level functions, Vitest cases as written) and measured seconds.

## The question per tier, in this product

There is no money in Autoreas Bridge, so the CORE question becomes: **if it fails, does the user lose or
corrupt their own data, or does a paired device gain access it should not have?** `anime_snapshots` is
the source of truth, and the disk is the source of truth for downloaded episodes.

| Tier | Question here | Target |
|---|---|---|
| CORE | Loses or corrupts user data, or breaks pairing security | 100%, every mutant killed or proven equivalent |
| IMPORTANT | The user sees something wrong or a flow breaks | 80%, asserted on structure and outcome |
| INFRASTRUCTURE | Types, constants, wiring the compiler or startup already proves | 0%, no tests |
| Tooling | Repository gates and test helpers, not product code | Keep the tests that guard a gate; outside the tiers |

## Speed targets per test type (owner reference, 2026-11-18)

| Test type | Target per test | Measured today |
|---|---|---|
| Unit (pure functions, rules, calculations, validation) | < 10 ms | Frontend `node` pure: 2,010 of 2,014 under 10 ms. Go unit: 1,018 of 1,369 under 10 ms |
| Integration (several parts together, real DOM or real SQLite) | 100–500 ms, never over 500 ms | ~50 tests over 500 ms across jsdom components, hooks and SQLite |
| E2E (browser, network and backend) | 1–10 s, critical flows only | None in the suite; the render and layout smokes and the WebView2 engine test are the closest |

## Go modules

| Module | Proposed tier | Why | Files / cases / s |
|---|---|---|---|
| `internal/anime` (write service, save transaction) | **CORE** | Decides and commits every anime save | 31 / 121 / 10.3 |
| `internal/anime/domain` | **CORE** | The aggregate and its write-side rules | 2 / 5 / 0.0 |
| `internal/anime/store` | **CORE** | The SQLite codec of `anime_snapshots`, the source of truth | 13 / 27 / 1.1 |
| `internal/anime/identity` | **CORE** | Decides which folder file is the next pending episode | 11 / 30 / 0.7 |
| `internal/anime/episodes` | **CORE** | Owns each episode's stored duration | 6 / 23 / 0.1 |
| `internal/watchhistory` | **CORE** | The permanent per-episode watch log | 9 / 43 / 0.1 |
| `internal/sync` | **CORE (owner decided, whole package)** | Changelog, snapshot and reconcile with devices: a bug overwrites data | 32 / 168 / 17.6 |
| `internal/backup` | **CORE** | Backup bundles are the user's recovery path | 5 / 40 / 1.5 |
| `internal/persistence` | **CORE** | Schema bootstrap of `bridge.db` | 3 / 13 / 0.0 |
| `internal/device` | **CORE** | Pairing and authentication of devices | 2 / 15 / 0.8 |
| `internal/download/filesystem` | **CORE** | Counts episodes on disk, the download source of truth | 2 / 6 / 0.0 |
| `internal/download/crypto` | **CORE** | Encrypts the MyJDownloader credentials | 1 / 3 / 0.0 |
| `internal/api/handlers` | **CORE** | Validates every write a phone sends | 16 / 79 / 0.1 |
| `internal/season/domain`, `internal/season/match` | **CORE** | Pure season decisions and intake name matching that change anime state | 5 / 29 / 0.0 |
| `internal/sqltext` | **CORE** | The one rule for safe SQL literals | 1 / 2 / 0.0 |
| `internal/download` (orchestration), `jdownloader`, `sites` | **CORE (owner decided)** | Renames and moves episode files on disk; a wrong rename can overwrite or lose an episode | 64 / 322 / 4.6 |
| `internal/cfclearance`, `cfclearance/webview2` | IMPORTANT | Downloads stop when it fails; the engine test is the closest thing to E2E | 13 / 55 / 19.1 |
| `internal/season` (service, store) | IMPORTANT | Season mode screens and their persistence around the CORE domain | 21 / 114 / 1.3 |
| `internal/anime/*` reads and notices (`cover`, `duration`, `durationedit`, `lengths`, `media`, `notice`, `announce`, `backfill`) | IMPORTANT | What the user sees about episodes and covers; derived, rebuildable data | 24 / 125 / 2.3 |
| `internal/notification`, `notification/center` | IMPORTANT | The notification center and its records | 28 / 133 / 10.4 |
| `internal/observability/*` | IMPORTANT | Diagnostics of the app itself; retention deletes only debug data | 61 / 304 / 29.6 |
| `internal/activity`, `internal/schedule`, `internal/myanimelist`, `internal/settings`, `internal/realtime`, `internal/autostart`, `internal/tray` | IMPORTANT | User-visible features and preferences | 38 / 162 / 3.0 |
| `internal/desktop` | IMPORTANT, wiring files INFRASTRUCTURE | Composition root: module readiness and failure codes are observable, plain wiring is not | 110 / 551 / 28.6 |
| `internal/api` (server wiring), `internal/api/contracts` | INFRASTRUCTURE | Routing wiring and DTO declarations | 18 / 96 / 0.7 |
| `internal/events`, `lifecycle`, `modules`, `logger`, `correlation`, `apperr`, `childproc`, `pathutil`, `download/config`, `download/dbschema`, `notification/centerschema` | INFRASTRUCTURE | Bus, handles, vocabularies, constants and schema declarations | 14 / 62 / 0.3 |
| `internal/tracerbullet` | IMPORTANT | Its startup entry is the boot marker Activity uses to split app runs (`activityread/bridge_runs.go`); its per-save steps are filtered as noise | 1 / 4 / 0.0 |
| `internal/mcp/requestcapture`, `internal/testsupport/*`, `tools/*` | Tooling | Developer sidecar, test helpers and repository gates | 26 / 87 / 7.9 |

## Frontend modules

Rule of thumb, matching the one declaration that exists (`features/activity`): a feature defaults to
IMPORTANT; files that **map and validate a Go payload or a form before it is saved** are CORE;
`*.types.ts` and `*.constants.ts` are INFRASTRUCTURE.

| Module | Proposed tier | CORE overrides | Files / cases / s |
|---|---|---|---|
| `features/anime-editor` | IMPORTANT | Form schemas and the helpers that build the save payload | 37 / 383 / 42.6 |
| `features/anime-create` | IMPORTANT | Name-conflict and create-payload helpers | 7 / 62 / 4.7 |
| `features/season` | IMPORTANT | Selection and ordering helpers whose result is saved | 76 / 655 / 31.9 |
| `features/download`, `features/episodes`, `features/backup` | IMPORTANT | Restore and backup request helpers | 43 / 485 / 22.3 |
| `features/activity` | IMPORTANT (already declared) | Already declared: payload mappers | 40 / 322 / 15.7 |
| `features/notifications`, `history`, `anime-detail`, `catalog`, `dashboard`, `devices`, `navigation`, `preferences` | IMPORTANT | — | 108 / 849 / 52.5 |
| `infrastructure/*` (Go payload sources) | IMPORTANT | Every `*-source` mapper that validates a Go payload | 24 / 161 / 0.5 |
| `shared/query`, `shared/store`, `shared/ordering`, `shared/season`, `shared/watch-history` | IMPORTANT | — (`shared/ordering` IMPORTANT by owner decision) | 26 / 235 / 4.8 |
| `shared/ui`, `keyboard`, `metadata-lookup`, `anime-cover`, `hooks`, `error-reporting`, `datetime`, `helpers`, `navigation` | IMPORTANT | — | 77 / 554 / 13.7 |
| `shared/constants`, every `*.types.ts` / `*.constants.ts` | INFRASTRUCTURE | — | — |
| `app/` (composition), `frontend/scripts` | INFRASTRUCTURE / Tooling | — | 25 / 101 / 7.4 |

## What this means for T7 (reduction)

- **CORE modules keep every test.** Their slow cases are optimized, never deleted.
- **INFRASTRUCTURE tests are deletion candidates.** Examples measured today: six `*.constants.test.ts` /
  `*.types.test.ts` suites, and tests that only assert wiring in `internal/desktop`.
- **IMPORTANT tests are merged where they repeat the same outcome**, and logic tested through a hook or a
  component moves into a pure helper tested in the `node` project (< 10 ms).
- **Integration tests over 500 ms** are reviewed one by one against the 100–500 ms band.

## Open questions for the owner

1. ~~Is `internal/sync` CORE as a whole, or only its reconcile and changelog writes?~~ Decided
   2026-11-18: the whole mobile sync is CORE.
2. ~~Is the download orchestration IMPORTANT, given that a wrong rename could touch files on disk?~~
   Decided 2026-11-18: downloads are CORE.
3. ~~Is `shared/ordering` CORE, since season order is persisted?~~ Decided 2026-11-18: IMPORTANT,
   including its helpers. The owner ranks it below the CORE modules; a wrong day shows on the board
   before saving.
4. ~~Does `internal/tracerbullet` still earn its place, or is it dead demonstration code to remove?~~
   Decided 2026-11-18: IMPORTANT. It is not dead code: Activity reads its "tracer bullet ready" entry
   as the boot marker of each app run, and retention keeps that entry on purpose.
5. ~~Should the 17 s WebView2 engine test stay in every commit gate, or run only in a separate integration pass?~~
   Decided 2026-11-18: it stays. The pre-commit `go-cover` job (`go test ./... -cover -p 4 -parallel 4`)
   is the only place it runs: CI runs no full Go suite, and mutation runs skip it with `-short`. Moving
   it out would leave the real Cloudflare solver boundary untested. It runs in parallel with other
   packages, so its 17 s is not added one to one to the gate.
