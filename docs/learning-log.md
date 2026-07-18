# Learning Log (Vitácora)

A human-readable record of *why* things in this repo are the way they are:
decisions taken and non-obvious problems solved, so future sessions inherit the
reasoning instead of rediscovering it.

This is a memory aid, **not** a substitute for deterministic guards. Whenever a
lesson can be enforced (linter, test, `go vet`, pre-commit gate), do that too —
this file only explains the *why*, it never replaces the *how*.

## How to append

- One lesson per line, kept to a single short sentence.
- Format: `- [YYYY-MM-DD]: text`
- Newest entries at the bottom. Never rewrite past entries; add a new line if
  something changes.

## Entries

- [2026-07-16]: Editor read DTOs (`AnimeEditorNullable*DTO`) must never use JSON `omitempty` on their value field — the `kind` discriminator already encodes missing/null, and `omitempty` silently drops a legit zero (tipo=0 "Anime (TV)"), which emptied the Type field and forced an endless no_op save loop.
- [2026-07-16]: Go↔JS zero-value/`omitempty` bugs pass per-side unit tests because each side is correct in isolation; catch this class with a contract test at the serialization boundary, not with more unit tests per layer.
- [2026-07-16]: Reply in the language the user actually typed this turn; do not default to Spanish from project config or stored memory when the user is writing in English.
- [2026-07-16]: In the Anime Editor, `props.initialAnimeId` is test-only scaffolding — the route mounts the workspace with no props, so production deep-link selection flows through `useParams().id` in `use-anime-editor-transitions.ts`, not the prop.
- [2026-07-16]: The editor rail's filter default is route-derived: a fresh `/editor/:id` mount opens on "All anime" so a non-watching deep-linked anime (e.g. "No me gusto") is visible in the rail, while the generic `/editor` entry keeps "Watching first"; a lazy `useState` initializer reads the param once so in-app clicks never reset the user's toggle.
- [2026-07-16]: When the Fallow changed-code gate blocks a commit on duplication/complexity, prefer the real fix — extract a generic `shared/ui` component (e.g. `LabeledTextField` collapsing repeated Label/Input/Description rows) and pull dense inline logic into a pure helper — over suppressing; reserve `fallow-ignore`/baseline for genuine false positives like structurally-similar but semantically-distinct interface shapes across bounded contexts.
- [2026-07-16]: Schedule apply needs two normalizations with different purposes: changed-record payloads must preserve board-wide destination order numbers for touched anime, while backend validation may normalize untouched legacy sparse weekday authority only after keeping caller-supplied malformed positions strict.
- [2026-07-16]: Anime-editor schedule apply must persist and publish only the anime explicitly changed by the DTO, while the refreshed schedule board may normalize untouched sparse legacy placements on read so the UI stays contiguous without inventing extra downstream mutations.
- [2026-07-16]: Equal-order legacy schedule ties follow the same rule as sparse Sundays: untouched records stay byte-faithful on disk, and deterministic normalization belongs in the public board read model plus UI feedback handling, not in extra Apply writes or warning alerts.
- [2026-07-16]: Anime-editor schedule apply serialization must follow the rendered destination sequence from `board.destinations` and card order inside each destination; lexical day-name sorting scrambles Monday→Sunday versus special queues and breaks regression expectations.
- [2026-07-16]: `RunOnce` fan-out must aggregate `processAnime` deltas as they happen; waiting to merge only after each goroutine returns keeps the persisted run row stuck at zero and hides live progress from the UI.
- [2026-07-16]: `RunOnce` live progress must keep the aggregate mutation and `recordProgress` persistence/event fan-out inside the same critical section; unlocking before `UpdateRunProgress` lets an older worker publish stale counters after a newer snapshot.
- [2026-07-16]: When the Go file-size gate trips on `schedule_service.go`, split schedule validation, normalization, and batch-operation helpers into package-private files and pin the behavior with focused schedule normalization tests instead of weakening the gate.
- [2026-07-16]: Real fsnotify watcher tests should prove readiness with a real observed append and then assert later phases through explicit publish signals; fixed sleeps around watcher startup create flaky batch-recovery tests.
- [2026-07-17]: In Wails WebView2, an `<a target="_blank">` does NOT reliably open the system browser; route external-page opens through `window.runtime.BrowserOpenURL` (guarded, via a source method) so intake/link buttons match the Chapters behavior instead of dead anchors.
- [2026-07-18]: The Go lint entrypoint derives targets from Git-owned Go files, which keeps every tracked profile focused on repository code and prevents recursive tool discovery from linting vendored frontend Go files.
- [2026-07-18]: In the scheduler loop, helper return values must distinguish "config ready" from "idle wait completed" — treating a wake-up from disabled-state polling as a ready config can drop the immediate post-save reschedule and make NotifyConfigChanged look flaky.
- [2026-07-18]: Legacy gateway lint debt in long regression tests is safest to remove by extracting semantic test helpers plus approval coverage for recursive JSON-equality helpers, which preserves real-fixture behavior while cutting cognitive load.
- [2026-07-18]: Revive's package stuttering rule applies to exported aliases too, so package-local bridge types like anime write outcomes must be renamed to neutral nouns (`PatchResult`, `PatchOutcome`, `Writer`) instead of hiding behind alias-only lint workarounds.
- [2026-07-18]: Revive treats infrastructure seam names like `sync.SyncSQLiteProvider` as stuttering exports too, so storage adapters should use neutral nouns (`SQLiteProvider`, `Store`, `Run`) and large stores should shed lifecycle helpers into semantic files instead of carrying size debt.
- [2026-07-18]: Clearing download revive debt safely means renaming the public port/value pair to `download.Store` and `download.Run`, then splitting long service/store tests by behavior helpers so the linter fix does not smuggle runtime changes.
- [2026-07-18]: Once base and advanced Go lint debt both reach zero, the repo-owned hook and CI entrypoints should call `scripts/lint.ps1 -Profile all` so proof stays aligned with the real no-exception enforcement target.
- [2026-07-18]: golangci-lint and dlinter-gcl both default to `--max-issues-per-linter=50`, which hides the true scope of requireDoc debt — use `--max-issues-per-linter 0 --max-same-issues 0` for an uncapped audit before declaring zero.
- [2026-07-18]: A requireDoc wave of 874 undocumented unexported helpers (test fixtures, validation helpers, writer helpers, schedule normalization helpers, wire helpers, recovery helpers) is mechanical volume — batch it with parallel agents grouped by bounded context, finish with the tools/ package edge cases, and always verify with the uncapped run.
