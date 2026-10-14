# Episode durations — feature document

Objective: keep each episode's duration as Bridge data, consumed by Today, the Editor and Mobile (offline). Branch
`feat/episode-durations` from `dev` (`a1aea330`); delivery strategy `ask-on-risk`, chain strategy `feature-branch-chain`, all local (Log L5).
Test runners: `go test` plus `ditto staged` mutation for Go; `bun --cwd="frontend" run test` (Vitest) for the frontend.

References: analysis [`docs/episode-durations-analysis.md`](../../docs/episode-durations-analysis.md) (decisions D0–D7);
Editor UI guide [`docs/episode-durations-editor-ui.md`](../../docs/episode-durations-editor-ui.md) and canvas
<https://claude.ai/artifact/Dt1pS5Yn3E5KUwgMbJK95i>.

## Specs

User fragments are quoted verbatim in the user's language. The technical restatement after each quote follows the
analysis; anything not said by the user is marked as an assumption.

- **S1 — Purpose.** "La idea es que Mobile pueda acceder a este dato cuando exista en Bridge. [...] Pero la idea no es
  que Mobile calcule algo. A Mobile solo le va a llegar el Duration Notice y lo va mostrar en su interfaz, aquí sí, muy
  similar como lo hace bridge en Today." / "Solo la marca de Today." Mobile receives the long-episode data and decides
  nothing; `long` comes from Bridge. No notifications on Mobile.
- **S2 — Durations are episode data, not file tracking.** "nosotros sí podemos tener un registro de cada capítulo, de
  cada anime que nosotros mantenemos internamente. Sobre todo el tema del tiempo" / "ese dato no es un tracking del file
  system. Más bien es un dato que estamos obteniendo del capítulo." Table `anime_episode_durations(anime_id, episode,
  duration_ms, source, updated_at_ms)`. No paths, file IDs or file timestamps. Durations survive the folder.
- **S3 — One value, last writer only.** "en la UI nos importa más la veracidad del dato que el origen, con una debería
  basta" / "solo representaría la última fuente que me que midió [...] no quiero que eso sea un histórico". `source` is
  `measured` or `manual` and is overwritten with the value (analysis D0).
- **S4 — Backups.** "definitivamente Brisbane necesita una tabla nueva. con todo lo que eso implica, sobre todo en
  backups." New `episode_durations` export/import group with full-refresh import, plus a footprint-test entry. Restore
  points are covered by the whole-database copy (D2).
- **S5 — Half episodes out.** "Dejémosle fuera de momento." Whole episodes only (`episode >= 1`, integer). Fractional
  files are reported as skipped.
- **S6 — Automatic measurement fills gaps only.** Automatic paths (download landed, backfill) insert only when the
  episode has no row (D3).
- **S7 — Backfill triggers.** "bridge normalmente corre en background siempre, así que hay que definir bien at start" /
  "El periodico no creo que merezca tanto la pena [...] Me parece bien hasta el punto 3. Además, la app se reinicia una
  vez por día normalmente." Triggers: process start; after each download run (touched anime). Rewritten by L29:
  "Mejor quitar esa reactividad" / "También quitar al reactivar" — a folder change or a reactivation triggers
  nothing; the next process start or a manual re-analysis measures it. No periodic timer. One pass at a time, plus one queued repeat. Skipped silently without
  ffprobe (D5).
- **S8 — Today reads stored data only.** "que ellos no tengan que lanzar un análisis cada vez que se abra esa sección,
  sino solo consumir lo que ya tenemos en base de datos." / "Evidentemente necesitaríamos también un adapter, igual que se
  va a hacer para mobile." Today's `LongNextEpisode` output is unchanged and comes from a shared pure read model. The
  probing in `notice/today.go` is removed (D7).
- **S9 — Existing consumers keep their behaviour.** "Today sigue usando. Notification eh, de descarga sigue funcionando
  igual." The download notice still notifies from the file it measured, and additionally stores the reading when there is
  no row.
- **S10 — Correction in the Editor.** "un episodio esté mal asignado a la duración, pues es un dato que si falla hay que
  corregirlo y hay que dar medios para hacerlo." / "Si hay algún lugar donde se tiene que editar, tiene que ser allí
  definitivamente." / "deberíamos poder tanto relanzar el cálculo automático como poderlo editar manualmente si ya todo
  falla". The Editor "Episodes" section is built per `docs/episode-durations-editor-ui.md`: re-analysis with review and
  confirm (manual values kept), manual edit, Add episode, and Clear duration (deletes the row, D1).
- **S11 — Mobile adapter.** "a Mobile tocaría enviarle la lista de animes es con los episodios dentro de cada anime. O
  sea, es un adapter para que ellos consuman fácilmente." `MobileAnime.episodes: [{episode, minutes, long}]`, optional,
  joined when served in `GET /api/animes` and the reconcile changelog.
- **S12 — Offline and background sync.** "Mobile está diseñado para ser offline-first. En otras palabras, debe seguir
  funcionando normalmente sin conexión a red." / "Hemos peleado mucho para que la sincronización en segundo plano funcione
  como first world class." Durations reach Mobile through the existing changelog, which its background engine already
  reads.
- **S13 — Sync without touching the anime flow.** Analysis D6: own event `episode.durations_changed`, a
  `durations_pending_announce` table written in the same transaction as each duration write, and only the changelog
  recorder and the WebSocket hub subscribed. `AnimeChangedEvent`, `anime_changed_outbox` and `modified_at` stay
  untouched, with guard tests proving it.
- **S14 — Bridge first, then Mobile.** "aquí sí ya tenemos que hacer primero de nuestro lado y después avisamos a
  mobile." `docs/openapi.yaml` documents the field before Mobile is told.
- **S15 — Independent Editor cards.** "crear un formulario separado solo para episodes que viva como su propio
  componente separado del anime data (como lo es "Open schedule editor")?" / "Sí, hazlo así siguiendo el theme skill
  para diseño" / "sí, cada card debe ser independiente, la A esta bien." The Editor shows three cards: anime data,
  Episodes, Schedule. Each saves only its own data. The Episodes card has its own draft, Discard and Save, opens and
  closes with Show/Hide episodes, keeps the edit and Add episode modals, and reads the SAVED anime (folder, total
  episodes, type), never the anime card's unsaved draft. The anime save no longer carries episode edits (fixes B1 of
  L29). The unsaved-changes guard covers both drafts with its copy unchanged ("Que necesidad hay de cambiar ese copy?
  Está bien como está."): Discard discards both; Save and continue saves each dirty card.
- **S16 — Schedule card.** "¿puedo pedir que Open Schedule editor tenga su propia sección o lugar fuera del formulario
  de editar anime data? [...] por estar separado ni siquiera responde a los botones de Discard changes y Save." /
  "me gusta la idea de que sea rápidamente escaneable" / option A: "Este me quedo." A Schedule card holds the "Open
  schedule editor" button and a seven-day week strip: a day the anime airs is tinted and shows its position as plain
  text, the number strong and "of M" muted on one line; other days are dimmed with the day name only. N and M come
  from the editor schedule board (normalized order; count of entries that day). Mockup: artifact "Anime Editor Layout".
- **S17 — Folder help.** "Prefiero que haya un "(?)" junto al la el que explique que para recalcular la duración de
  episodios tiene que hacerlo manual y no será automático." A "(?)" tooltip next to the Folder label says a folder
  change does not recalculate episode durations and points to "Re-analyze folder".
- **S18 — Chips are soft.** "voy a escoger este tipo de Chip para generalizarlo en el theme skill" / "el ícono es
  opcional según el cada caso." The theme skill states every chip is `variant="soft"`, no border, icon optional.

## Tasks

Planning heuristic: about 400 authored changed lines per ODD (advisory only, not a gate). The estimates count
production, tests and docs.

| ID | Unit | Specs | Depends on | Route | Est. lines | Risk | Status | Commit |
|---|---|---|---|---|---|---|---|---|
| ODD 1 | **Storage.** `internal/anime/episodes` (or equivalent) package: schema descriptor, store with the S3/S6 write rules (insert-if-absent, manual upsert, measured upsert skipping manual, delete), `durations_pending_announce` written in the same transaction, backup group with footprint test, `checkarchitecture` ownership rule. | S2–S6, S13 (table) | none | delegated, parallel with ODD 2 (writer trigger a) | ~400 (actual well above: package, failure tests, plus the L7 transaction extension) | High: item 1 (new persisted data and backup format). Independent verifier: PASS. | done (L8) | see L8 |
| ODD 2 | **Identity, whole folder.** New exported function returning every confidently assigned `(episode, basename)` plus skipped files with their reason (fractional, duplicate, ambiguity, unreadable). Parity with existing `Identify` decisions. | S5, S10 (re-analysis input) | none | delegated, parallel with ODD 1 (writer trigger a) | ~250 (actual +256/−29) | Item 6 guarded by parity tests; medium | done: `identity.Assigner` (`Assign(Request) Assignment`); TestParity dev 16/16 and supplemental 4/4 unchanged; ditto 3/3 killed (1.00) after a real gap at `diagnostics.go:53` was closed | `9663f03e` |
| ODD 3 | **Measurement.** Download landed writes the reading (insert-if-absent). Background backfill with the three S7 triggers, single-flight with one queued repeat, active anime only, confidence gate, all anime types. | S6, S7, S9 | ODD 1, ODD 2 | inline | ~450 | High: item 4 (concurrency of the backfill). Independent verifier. | done (ditto 60/60; verifier PASS, L10) | see L10 |
| ODD 4 | **Shared read model and Today.** Pure `EpisodeLengths` and `LongNextEpisode` in the anime context; Today's binding reads the table in one query; remove TodayMarks probing. Today output unchanged (regression tests on `LongNextEpisode`). | S1, S8, S9 | ODD 1, ODD 3 | inline | ~300 (net, includes removals) | Item 3 (Wails contract kept identical); medium | done (ditto 27/27, L11) | see L11 |
| ODD 5 | **Sync to Mobile.** Announcer and `episode.durations_changed`; changelog-recorder and WebSocket-hub subscriptions; serve-time join in `toAnimeChanges` and `GET /api/animes` through `EpisodeLengths`; guard tests (anime edit unchanged, duration save publishes no `AnimeChangedEvent`, `modified_at` unchanged); `docs/openapi.yaml`. | S11–S14 | ODD 1, ODD 4 | inline | ~450 | High: items 3 and 4 (contract Mobile consumes, event ordering). Independent verifier. | done (verifier PASS after B1 fix, L13–L14) | see L14 |
| ODD 6a | **Editor backend.** Wails bindings: list rows (stored plus derived "Not measured"), edit, Add episode, Clear, re-analysis preview, and confirm (manual kept). Writes go through the ODD 1 store, so they mark pending. Folder change triggers the S7 backfill. | S10 | ODD 1, ODD 2, ODD 3 | inline, or parallel with ODD 4–5 (disjoint surface) | ~400 | Item 3 (new bindings only, additive); medium | done (ditto 16/16, 64/66 with 2 equivalent; L16) | see L16 |
| ODD 6b | **Editor UI.** "Episodes" accordion per the approved guide; `AirisEmptyState` `inline` size with a layout fixture; skeleton/empty/alert states; hooks with colocated tests; progressive list rule. | S10 | ODD 6a | inline | ~800 (frontend, split into two commits) | Item 6 covered by Vitest and the layout fixture; medium | done (staged mutation 1191 killed, 0 survived, 0 no-coverage; dharness check clean; L17, L27) | see L27 |
| ODD 7 | **Mobile handoff.** Send the `openapi.yaml` contract and the analysis to the Mobile team; answer their questions. No Bridge code. | S14 | ODD 5 | inline | ~0 | none | sent 2026-10-14 to mobile-team; awaiting questions (L18) | — |
| ODD 5b | **Changelog order fix (B2, from Mobile).** Every changelog row reads the current snapshot inside its insert transaction, stamps `changed_at_ms` past the anime's last row, and skips a non-delete row of a vanished anime. | S11, S14 | ODD 5 | inline | ~250 | Item 4 (concurrency) and item 3 (row semantics Mobile consumes); high: independent verifier with `-race` | done (ditto 18/18; verifier PASS, L28) | see L28 |
| ODD 6c | **Editor backend split.** `SaveEpisodeDurations` binding over `ApplyEdits`; `Episodes` removed from `SaveAnimeEditor` (and `episodesOnlyResult`); the `anime.changed` backfill trigger removed (S7). | S7, S15 | ODD 6a | inline | ~250 | Item 3 (binding contract, consumed only by our frontend) and item 4 removed path; medium | done (ditto 4/4; verifier PASS, L32) | ac8054a7 |
| ODD 6d | **Episodes card.** Own draft, Save, Discard, Show/Hide; reads the saved anime; guard covers both drafts; tests and `docs/episode-durations-editor-ui.md`. | S15 | ODD 6c | inline | ~450 | Item 6 covered by Vitest; medium | done (verifier PASS, L32) | ac8054a7 |
| ODD 6e | **Schedule card and Folder help.** Week strip from the board, eager board load and refresh, button moved; Folder "(?)" tooltip; chip rule in the theme skill. | S16, S17, S18 | ODD 6d | inline | ~350 | none beyond UI; Vitest | done (verifier PASS, L32) | ac8054a7 (theme skill chip rule in the next docs commit) |

**Order and parallelism:** ODD 1 ∥ ODD 2 → ODD 3 → ODD 4 → ODD 5 → ODD 7. ODD 6a can start after ODD 3 and run in
parallel with ODD 4–5 on a disjoint edit surface; ODD 6b follows 6a.

**Forecast:** about 3,050 authored lines in total, far above one review slice, so the chained-PR rule applies (Log L4).

## Log

- **L1 (2026-10-13, user's original request, verbatim):** "vamos a utilizar esta feature para crear una encima de esta
  (más o menos). Nosotros tenemos una aplicación hermana de Bridge que se llama Mobile. Esta aplicación debe recibir este
  dato a través de la de los medios oficiales. Me parece que ahorita son WS y API. La idea es que este va a ser un
  desarrollo conjunto con el team mobile. Tienes acceso por chat con ellos. ¿Cuál es el objetivo del desarrollo? La idea
  es que Mobile pueda acceder a este dato cuando exista en Bridge. Ahora, toca analizar adecuadamente esto. Pero la idea
  no es que Mobile calcule algo. A Mobile solo le va a llegar el Duration Notice y lo va mostrar en su interfaz, aquí sí,
  muy similar como lo hace bridge en Today."
- **L2 (2026-10-13):** analysis rounds with the user and the Mobile team. Earlier designs were rejected: an on-demand
  endpoint, an in-memory/foreground-only Mobile, ETag/fingerprint polling, folder-change resets, a periodic backfill, and
  reusing `AnimeChangedEvent`. The reasons are recorded in the analysis document and in Engram (`odd/episode-durations/*`).
  The Mobile team already agreed on: offline storage on their side, `nrocapvisto < episode` display rule, background
  refresh. They were told the earlier endpoint design, which is now superseded. ODD 7 must send them the final contract.
- **L3 (2026-10-13):** Editor UI approved as the design guide (`docs/episode-durations-editor-ui.md`). Theme skill
  `autoreas-theme` 1.1.2 records the side-by-side `AirisEmptyState` layout. Both are uncommitted in this worktree.
- **L4 (2026-10-13):** analysis closed and converted to `docs/episode-durations-analysis.md`. Pending user decision: the
  chain strategy for the ~3,050-line forecast, `stacked-to-dev` or `feature-branch-chain`.
- **L5 (2026-10-13, user, verbatim):** "feature-branch-chain, todo en local, y aprobado." The plan is approved. Each ODD
  closes with local work-unit commits on `feat/episode-durations`; nothing is pushed and no PR is opened.
- **L6 (2026-10-13):** planning committed as `d77e1f9b`. ODD 1 and ODD 2 ran as parallel writers on disjoint surfaces.
  ODD 2 design: `Assign` takes the same `Request` as `Identify`, where an empty Context assigns clear numbers only.
  ODD 3's backfill will pass `Context{}`, because automatic paths never overwrite a stored value. Separate `Assigner`
  port, so the existing `Identifier` test fakes are untouched. The new kinds `unreadable` and `unnumbered` never appear
  in `Identify`, guarded by `TestIdentifyNeverEmitsAssignKinds`. The parent updated two desktop tests that pin the
  backup group list (Five → Six) and fixed staticcheck S1016 in `episodes/backup.go`. That fix was needed because
  golangci-lint in pre-commit lints the whole tree, including unstaged files.
- **L7 (2026-10-13):** ODD 1 ditto runs took over an hour. Production opens SQLite with `SetMaxOpenConns(1)`
  (`sqlite_bootstrap.go:146`), so a mutant that leaves a transaction open blocks every later query in the
  `database/sql` pool. `busy_timeout` does not help there, and each such mutant hung until go test's 10-minute
  default. Rerun with `-timeout 30s`: 83 mutants, 81 killed (0.98). The 2 survivors at `store_read.go:28` were sent
  back to the writer. User, verbatim: "trata de pensar en una solución transversal en lugar de un parche" and
  "apruebo ese cambio, asegurate que no afecte los procesos en backgrounde de bridge nomás". ODD 1 gains three things:
  `persistence.InTx`, with an unconditional rollback; a `tools/checkarchitecture` rule forbidding `BeginTx` outside
  `internal/persistence`, with a no-growth baseline of the 23 existing files (19 production plus 4 `_test.go`; the
  first count of 20 was wrong); and a `testsupport` SQLite helper that
  fails on leaked connections. Only `internal/anime/episodes` adopts them now; no existing transaction file is
  modified. Migrating the 20 baseline files is a separate later unit (high risk: concurrency and data).
- **L8 (2026-10-13):** ODD 1 closed. Ditto on `internal/anime/episodes` (without `schema.go`, which is
  INFRASTRUCTURE) plus `internal/persistence/tx.go`: 72 mutants, 72 killed (1.00). The independent verifier returned
  PASS for S2, S3, S4, S5, S6, the S13 table, the L7 extension and the background-process requirement, with no
  blockers. Its probes ran on real SQLite through `sync.OpenBridgeDB`. The `sync` and `desktop` suites pass at baseline
  (721 tests) and staged (722). Advisories carried forward:
  - **For ODD 5 to decide on purpose:** a backup import fully refreshes durations but marks nothing pending, so Mobile
    is not told after a restore.
  - **Rule limits, documented in the code:** it matches the `.Begin(`/`.BeginTx(` substring, cannot tell a `*sql.DB`
    from other receivers, and misses calls split across lines.
  - **Footprint markers:** they use byte sums, so two markers could collide in theory.
- **L9 (2026-10-13):** ODD 3 writer handoff (route: delegated, parent context backstop). Parent review decisions:
  - **Recovered panics in the background pass must be logged, never swallowed silently.**
  - **The confidence gate applies to the landed recording too.** A reading is stored only when `Assign(Context{})`
    maps the landed file to the download's episode number. The notice itself is unchanged.
  - **Concurrency of 2 probes,** gentler than the analysis's 4. The analysis doc is updated.

  Recorded, not changed:
  - `AnimeChangedEvent` publishers leave `ChangeType` empty, so a create is detected through the `folder` / `active`
    changed fields.
  - An active true→false change triggers a pass that skips the anime, which is harmless.
  - Backfill and landed writes already mark pending for ODD 5.

  Hooks:
  - **After a download run:** `DownloadEpisodeDownloadedEvent` collects ids per run, and `DownloadRunFinishedEvent`
    triggers them.
  - **Startup and shutdown:** startup triggers All; shutdown stops the backfill before the DB closes.
  - **Anime changes:** the `AnimeChangedEvent` subscriber is read-only.
- **L10 (2026-10-13):** ODD 3 evidence.
  - **Mutation:** ditto on backfill and notice (desktop wiring excluded as IMPORTANT, 5 conditions hand-mutated):
    60/60 killed, score 1.00.
  - **Independent verifier:** PASS on S6, S7 and S9 with no blockers. Probes ran on real SQLite through
    `sync.OpenBridgeDB`:
    - 2 probes peak and no connection held while probing, with 317 concurrent transactions;
    - a storm of 50 triggers runs exactly 2 passes, and `Stop` is immediate;
    - the notice is byte-identical for TV;
    - nothing changed under download, sync, schedule or season;
    - those suites went from 1114 to 1137 passing tests with 0 failures, and `-race` is clean.
  - **Advisories applied:** two doc comments corrected. The package doc now describes the L9 logging. The
    `probeUnavailable` doc notes that a Windows absolute path with an extension fails per file. That form is never
    configured in production, and nothing is stored when it happens.
  - **Advisories recorded, not changed:**
    - `landedByRun` keeps the ids of a run that never finishes; this is bounded by the number of runs.
    - The landed probe also runs for non-TV episodes, as S6 intends.
  - **Verifier lesson:** the run took 3 hours because it had no per-command limit. Future verifiers get
    `go test -timeout 60s` and `timeout 10m` per command.
- **L11 (2026-10-13):** ODD 4 evidence (route: inline).
  - **New package `internal/anime/lengths`:**
    - pure `EpisodeLengths` and `LongNextEpisode`, plus `WholeMinutes`;
    - `TVKind`, now the single home of the TV rule (`notice.TVKind` aliases it, and the notice rounds minutes with
      `WholeMinutes`);
    - `Today`, the adapter that reads the day in one `ByAnimeIDs` query.
  - **Today reads only the table.** `notice/today.go` (folder, identity, ffprobe) is removed. The desktop wires Marks
    only when a bridge DB exists. The Wails contract (`EpisodeScheduleItem.longNextEpisode`) is unchanged.
  - **Tests:**
    - Ported cases: long, ordinary, short, not TV, no type, order kept per row.
    - New cases: lookup by number, fractional progress, the 30 min boundary, a failed read leaves every row unmarked,
      an empty day reads nothing, and a real-SQLite store read.
    - D7 guard: a long file in the folder with no stored row gives no mark.
  - **Checks:**
    - `go build ./...` passes.
    - Tests in anime, desktop and download all pass.
    - Ditto on `lengths`: 27/27 after one kill (the stored TV type `0` pinned as data).
- **L12 (2026-10-13):** User decision on the ODD 1 advisory (backup import and Mobile): "si, deberia avisar a Mobile".
  A backup import marks every anime with restored durations as pending announce in the same transaction, so Mobile
  receives them after a restore.
- **L13 (2026-10-13):** ODD 5 implementation (route: inline, with one read-only explorer for the sync map).
  - **Contract:** `MobileAnime.episodes: [{episode, minutes, long}]`, omitempty. It is joined at serve time by
    `lengths.AttachEpisodes`, wrapped around Mobile's two read ports (`episodeAnimeQuery`, `episodeSyncTrigger` in
    desktop), so in-process `ListMobileAnimes` callers pay no join. A failed join fails the request, because serving
    no episodes would tell Mobile they are gone. `docs/openapi.yaml` documents `episodes` and `EpisodeLength`.
  - **Event:** `events.EpisodeDurationsChangedEvent` (`episode.durations_changed`) with
    `EventID = episode.durations_changed:<anime>:<marked_at_ms>`, so the changelog's unique `source_event_id`
    deduplicates a repeat after a crash.
  - **Announcer:** `internal/anime/announce`. Single-flight with one queued repeat. Started after the changelog recorder
    and the hub subscribe; stopped after the backfill, before the DB closes.
    - Missing anime: the mark is cleared and no event is sent.
    - Other read failure: the mark is kept and a warning is logged.
  - **Wake-up:** `Store.OnPendingMarked(wake)` on the landed and backfill stores. The announcer sits behind an atomic
    pointer, because the download run can write before it starts; its first pass catches any mark left behind.
  - **Subscribers:**
    - The `ChangelogRecorder` has a second subscription, which records an `update` row with `changed_fields
      ["episodes"]` and the current snapshot.
    - The hub sends the same `anime_changed` message an edit sends.
    - `AnimeChangedEvent`, its outbox and its four subscribers are untouched.
  - **Backup import (L12):** marks pending every anime with durations before or after the full refresh, in the same
    transaction. `ImportEpisodeDurations` now takes `now`.
  - **S13 guard (real SQLite):** a duration write produces one update row `[episodes]` with the unchanged snapshot,
    no `AnimeChangedEvent`, and the same `modified_at`. The changes feed serves the episodes.
  - **Found and fixed: the ODD 3 race.** `go test -race ./internal/desktop/` passes at `e60ec9d5` and fails at
    `514502f3`. Startup tests use a bare `&sql.DB{}`; the background backfill (and now the announcer) recovers its
    panic and logs it while the test reads unsynchronised variables. The fix follows the existing seam pattern:
    `episodeDurationsRuntime.offline`, set in `newAppTestApp`. Lesson: verifiers run `-race` on every package the
    change wires into, not only the new ones.
  - **Checks:**
    - `-race` passes on desktop, anime and sync.
    - Ditto results: announce 9/9, lengths 10/10, episodes 10/10, changelog recorder 4/4 (two killed: the ids
      requested, the recorder clock).
    - Lint `-Profile all` reports 0 issues.
    - checkarchitecture, checkgofilesize and checkopenapi all pass.
    - The desktop decorators and wiring are IMPORTANT tier (behaviour tests, no mutation).
- **L14 (2026-10-13):** ODD 5 independent verifier.
  - **Verdicts:**
    - S11, S13, L12, the wiring and the background processes all PASS. Per-package test counts are identical to
      55bf00df for download (459), schedule (41), season (187), api (242), realtime (25) and events (15).
    - **Blocker B1:** shutdown cancels `catchUpContext`, which the changelog recorder writes under, before it stops
      the announcer. A pass in that window published, the recorder's insert failed, and `ClearPending` still
      succeeded, so the announcement was lost for good.
  - **Fix:** a new `announce.Deps.Parent`, and desktop passes `catchUpContext`, so the insert and the clear fail
    together. Regression test: `TestAMarkSurvivesAShutdownBetweenPublishAndClear`. It fails with the fix removed by
    hand.
  - **Recheck (B1 only): CLOSED.** At real SQLite the mark is kept on cancel (0 rows, 1 pending). The next start
    announces it exactly once (1 row, 0 pending).
  - **Advisories:**
    - A4 fixed: openapi now covers fractional progress and that `minutes: 30` can come with `long: true`.
    - A1 kept: a re-mark in the same ms as a cleared mark reuses the event id, and the changelog drops it. The stable
      id is what dedupes a crash re-announce.
    - A2 kept: any other recorder insert failure loses the announcement. This is the same design as the anime outbox.
    - A3 kept: the cover route now also reads durations through the decorator, and a durations read fails only when
      the DB is broken, which already fails the cover.
- **L15 (2026-10-14):** User decision. On "Confirm N changes" in the re-analysis review, do the changes save at once
  or join the Editor draft? Answer: "Al borrador (Recommended)". Confirm moves the reviewed readings into the draft as
  "Unsaved" rows; Save writes them and Discard changes drops them. There is one save path for the whole Editor.
- **L16 (2026-10-14):** ODD 6a Editor backend (route: inline, with one read-only explorer for the Editor save flow).
  - **`episodes.Store.ApplyEdits`:** applies every Editor edit to one anime in one transaction and marks the anime
    pending once.
    - A manual edit replaces the stored value.
    - A measured edit (a confirmed re-analysis) never overwrites a manual row.
    - A clear deletes the row.
    - Every edit is validated before any is written; `ErrInvalidSource` is new.
  - **`internal/anime/durationedit`:**
    - `Section` builds the union of stored durations, assigned files (`Context{}`) and episodes 1..Total. Each row
      gets its source: measured, manual, `manual_no_file` (only with a found folder), not measured, or
      `not_measured_file_found`. The section also reports the folder status, the episodes beyond Total, and whether
      the anime is TV.
    - `Reanalyze` probes the recognized files in order with progress, compares each against the stored value in
      whole minutes, and writes nothing.
      - Row results: unchanged, update, add, manual_kept, skipped (with the identity detail), unreadable,
        not_reached.
      - Statuses: ok, no_folder, folder_missing, no_files, probe_unavailable, interrupted (the folder stopped
        responding), cancelled.
  - **`probe.Unavailable`:** the missing-binary check now lives in the probe package, and the backfill uses it too.
  - **Desktop bindings:**
    - `GetEpisodeDurationSection(draft)`.
    - `ReanalyzeEpisodeDurations(draft)`: one at a time, returns "busy" otherwise, and emits
      `episode.durations_reanalysis_progress` before each file.
    - `CancelEpisodeReanalysis()`.
    - `SaveAnimeEditor` gained `episodes []EpisodeDurationEditDTO` (L15).
      - Episode edits are saved first, in their own transaction, and are idempotent on retry.
      - An episodes-only save never calls the anime write, so a stale base cannot block it and `modified_at` does
        not move.
      - A no-op patch with changed episodes is reported as applied.
      - A bad episode edit fails the whole save before anything is written.
  - **S7:** a folder change still triggers the backfill through the ODD 3 `AnimeChangedEvent` subscriber.
  - **Checks:**
    - Ditto on episodes: 16/16.
    - Ditto on durationedit: 64/66. The 2 survivors are `<` to `<=` in sorts over unique episodes (rows are keyed
      by episode; `Assign` sends duplicates to `Skipped`), so they are equivalent.
    - Desktop bindings: IMPORTANT tier, covered by behaviour tests at real SQLite.
    - Lint 0, size and architecture gates pass, `-race` passes on desktop and `anime/...`.
    - Wails bindings regenerate and the frontend typecheck passes.
    - Feature-end independent verifier: after ODD 6b.
- **L17 (2026-10-14):** ODD 6b Editor UI. Route: delegated, with a bounded writer for the context backstop, plus a
  second writer, limited to tests, after the first ran out of session.
  - **Built:**
    - The Episodes `Disclosure` after "More details". Its trigger shows "N of M measured" and "N long" while closed.
    - The table, the guide's ten states, the progress bar with Cancel, and the Edit, Add and Review modals.
    - Episode edits in the Editor draft. Dirty tracking, Save and Discard cover them, and an applied save reloads
      the section.
    - The `AirisEmptyState` `inline` size, with layout-fixture cases.
    - A separate injected `EpisodeDurationRuntimeSource`, memoized; workspace tests inject a fake.
  - **Parent correction batch:**
    - Removed an added `eslint-disable dharness/role-file-shape`.
    - Workspace tests had fallen through to the binding's offline wait, which made Stryker's initial run time out.
    - Two missing test JSDoc comments.
  - **Stryker** on the three new helper files: 89.16% → 97.65%.
    - 60 survivors killed by behaviour tests.
    - 17 equivalent, each with a recorded proof: chip ids used only as React keys, guarded optional chaining, a
      `NaN` comparison, and an unreachable `?? false`.
  - **Checks:**
    - Typecheck passes.
    - 426 tests pass across anime-editor, infrastructure and AirisEmptyState.
    - Scoped eslint is clean on every touched file.
    - Layout smoke and render smoke pass. Disabling the inline branch was confirmed to fail the smoke.
  - **Advisory:** four files already over 400 lines grew by 2–8 lines; all stay under the 500 hard limit.
  - **UI choices made where the guide is silent or ambiguous, pending user confirmation:**
    1. Cancelling a re-analysis closes quietly, with no review.
    2. Busy and error results show the review with Close only, using writer-chosen copy.
    3. The progress text reads "Measuring episode 17 · 5 of 12", because the episode number and the file position
       can differ.
    4. The mockup's per-row "Measuring…" and "Waiting" labels are not implemented; they are not in the guide.
    5. Writer-chosen copy: the empty state for a found folder with no files and no total, "Not measured yet", and
       the interrupted-review description.
    6. The Add modal's long hint shows for TV only. The guide states it unconditionally, but long applies to TV
       only.
    7. Clear is disabled on a row with no value. Clearing an unsaved-only value drops the edit.
    8. A confirmed review never replaces an unsaved manual edit.
    9. A review whose only differences are manual-kept rows shows the table with Close.
    10. The Tooltip trigger wrapper is `role="presentation"`, and a disabled button keeps its reason in
        `aria-label`.
- **Next step:** commit ODD 6b, then the feature-end independent verifier, then ODD 7.

- **L18 (2026-10-14) — ODD 7 handoff sent.** User: "Ya envialo, igual estoy corriendo esta rama por si necesitas probar endpoints. Eso no es problema." Sent the final contract (`MobileAnime.episodes`, `EpisodeLength`, the six rules and `docs/openapi.yaml` at `f436964d`) to the mobile-team session; it supersedes the earlier endpoint design. Open: answer their questions; offer a live endpoint check against the branch the user is running.

- **L19 (2026-10-14) — Mobile reply.** Mobile accepts `MobileAnime.episodes`; old Mobile builds drop the field safely (zod ignores it; `changed_fields: [episodes]` normalizes to []), so Bridge can ship first; Mobile handles the backfill with a full resync on update. Confirmed to them: reconcile `bridge_changes` goes through the decorated `SyncTrigger.ListChangesAfterID` (router.go:70), same snapshot as /changes. Blocking question: Mobile drops a change whose `timestamp` <= the last applied one for that anime (tie keeps local). Finding: `timestamp` = recorder wall clock `time.Now().UnixMilli()` (changelog_recorder.go:88), new per row but NOT strictly increasing per anime (same-ms rows, clock going back). Pre-existing for every row, made likelier by the Editor save (episodes row async, possibly with the pre-patch snapshot, then the patch row). Proposed fix: per-anime strictly increasing `ChangedAtMs` in the recorder. Pending user decision.

- **L20 (2026-10-14) — Blocker B2 from Mobile (ODD 5 reopened).** Installed Mobile builds normalize `changed_fields: [episodes]` to [] and then diff the WHOLE snapshot (deriveChangedFields), so an episodes row carrying a pre-patch snapshot REVERTS the patch silently; strict timestamps make it happen always, not only on ms ties. Verified race: announce.go:106 reads the snapshot, then publishes; InsertPending runs separately, so a patch can commit in between. Invariant: for one anime, a row snapshot is never older than an earlier row. Chosen fix (variant of their option a; b is insufficient because download/backfill announcements race any patch): the episodes row reads the current snapshot inside the same transaction as its insert, and every row gets `changed_at_ms` = max(now, last for the anime + 1) in that transaction. Serving keeps the recorded snapshot and only re-joins `episodes`. Told Mobile; implementation pending user confirmation.

- **L21 (2026-10-14) — Mobile widens B2 to every row.** Mobile accepts the fix only if the invariant holds for ALL rows: patch rows also publish `anime.changed` after their commit (write_service.go:255 publishCommitted; editor_service.go:208; schedule_service.go:218; writer.go:164/195) and the recorder inserts in a separate transaction, so the reverse race exists. Agreed rule for the changelog writer, every row, inside the insert transaction: store the CURRENT snapshot (event payload only when the anime is gone) and `changed_at_ms` = max(now, last for the anime + 1). `changed_fields` unchanged. Acceptance: for any two rows of one anime, id(A) < id(B) implies ts(A) < ts(B) and snapshot(B) is not older; tests cover episodes-vs-patch, patch-vs-episodes, and the general id invariant. Pending user confirmation.

- **L22 (2026-10-14) — Missing-anime rule.** Mobile: a non-delete row stored after the anime vanished makes installed builds upsert it back (resurrection). Verified: Bridge deletion is logical (Deactivate keeps the row); no production code emits `delete` rows; the only physical removal is the backup import full refresh (backup_import.go:96), which writes no delete rows. Final rule: inside the insert transaction, a non-delete row whose anime no longer exists is not stored; a delete row keeps the event snapshot. Pending user confirmation.

- **L23 (2026-10-14) — Contract closed with Mobile.** Mobile confirms the final rule and waits for the commit. Advisory A4 (pre-existing, out of scope): a backup import removes animes physically and records no delete rows, so Mobile never learns of them; unverified whether a full resync cleans them. To be handled separately.

- **L24 (2026-10-14) — ODD 5b implemented, unverified.** User: "Dale, ya lo aceptaste, así que ahora haste responsable." `ChangelogStore.InsertPending` now runs in `persistence.InTx`: a non-delete row takes `anime_snapshots.snapshot_json` (no row when the anime is gone), `changed_at_ms` = max(given, MAX for the anime + 1), then the insert. RED observed on 5 new tests in `internal/sync/changelog_order_test.go` (both Mobile orders, per-anime clock, vanished anime, 4x10 concurrent writers with stale payloads and equal clocks); GREEN with sync, api/..., anime/..., desktop, and `-race` on sync. Existing tests now seed the anime they record (`insertWithAnime`, `seedAnimeSnapshot`); the e2e sync test expects the stored snapshot (661), and the malformed-row test writes its row straight into the table. `docs/openapi.yaml` documents the snapshot and timestamp guarantees on `AnimeChange`. Pending: ditto on internal/sync (waiting for the running Stryker), lint, independent verifier, commit.

- **L25 (2026-10-14) — Unknown changes are rejected, by Mobile.** User: "un evento que no se reconoce debe ser rechazado, ahora, queda a decisión de mobile si ellos internamente lo rechazan silenciosamente o explicitamente." Sent to Mobile as a finding for their next version: ignore an unknown `changed_fields` name instead of falling back to a whole-snapshot diff, keep that diff for the legacy empty-list case only, and still acknowledge the row. A version/ignored-fields report to Bridge diagnostics was proposed and withdrawn. User: "no es algo a lo que deberíamos darle prioridad ni de cerca."

- **L26 (2026-10-14) — Empty changed_fields deleted (coordinated with Mobile).** User, relayed by Mobile: "¿Qué se hace con el legacy? Se depreca y se borra. Yo diría que ahorita ya pasamos la parte de deprecación porque ya estamos usando una API bastante estable. Por lo tanto, ¿qué es lo que toca ahorita? Borrar. Y no es solo tu trabajo. Es trabajo de ambos en coordinación." Explorer map (spot-checked changed_fields.go:24 and gateway.go:150): the Legacy watcher is gone (SDD-55); every production write derives changed_fields in the outbox finalize; writer.go:195 processUpdate (nil fields) is unreachable in production; tracerbullet never makes a row. Edge cases that could yield []: bytes changed but parsed JSON equal, outbox rows older than the changed_fields_json column, rows migrated from the payload-only schema. Live DB (read-only): changelog has 0 rows. Bridge part, added to ODD 5b: InsertPending stores no create/update row with empty changed_fields (delete exempt); RED then GREEN (`TestARowWithoutChangedFieldsIsNotStored`); fixtures given fields; openapi documents the guarantee. Order agreed: Bridge ships first, then the Mobile build that rejects empty lists. Mobile keeps the full resync on app open.

- **L27 (2026-10-14) — ODD 6b gates fixed.** First commit attempt was blocked by lefthook (5 complexity findings; staged mutation 143 survived, 16 no coverage). The odd6b-mutants writer split the complex helpers and hooks (`toStoredRowView`/`toEditedRowView`, `toEpisodeDurationsOverview`, `episode-duration-forms.helpers.ts`, fixture helpers), added component and hook tests, and restructured sources to remove equivalent mutants. Reported: typecheck exit 0; 45 files / 458 tests pass; layout:smoke exit 0; `dharness check` exit 0 (complexity 0; one non-blocking react-doctor warning on `AnimeEditorFormPanel.tsx:14`, not caused by ODD 6b); staged mutation 1191 killed, 0 survived, 0 no coverage. Six equivalent-mutant disables, each with its proof: four `ArrayDeclaration` ranges on setter-only callback deps (restored), two `StringLiteral` lines in the runtime-source constants that `narrow` already falls back to. Parent check: the staged files stay inside the allowed surfaces. Lesson: `dharness mutate --staged` mutates working-tree sources in place, so no source may be edited while it runs.

- **L28 (2026-10-14) — ODD 5b verified.** ditto on internal/sync (final 19/19 after splitting `insertPendingTx` and `pastLastRow` for gocognit, with named results so no unused literal mutates): first 17/19 (survivors: `err != nil || !found` was equivalent because the helper returns found=false on error; `lastMs.Valid` only mattered for a first row stamped 0). Split the read error from the missing anime and added `TestAFailedSnapshotReadStoresNothingAndReportsIt` plus a first-row-at-0 case: 18/18. Lint gate (`scripts/lint.ps1 -Profile all`): 0 issues after extracting `writeThenRecordStale` (gocognit 17 had blocked the syncdiag commit, since lint reads the whole tree). Independent verifier (throwaway worktree, real SQLite, real recorder and bus, -race): PASS on all five rules and S11/S13/S14, no blockers. Probes: both Mobile orders with stale payloads and a clock going back; replayed SourceEventID (one row, clock not moved); 3 animes x 6 goroutines x 15 events, invariant held, race-clean. Advisory A5: the clock floor only sees rows still in the changelog, so after every device acks and rows are pruned, a change within the few ms of earlier bumps may tie a phone's last applied ts; openapi now states this. Advisory A6 (pre-existing, baseline too): `go test -race ./internal/api/` fails in the WebSocket capture tests (websocket_test.go vs websocket_helpers_test.go:86). Also committed separately: 33db8f7e `fix(syncdiag): accept the recent events Mobile already reports` (native_module_unavailable was missing, so those reports were refused with 400).

- **L29 (2026-10-14) — Feature-end verify of ODD 6a/6b: blocker B1, and the Editor redesign.** Verifier (throwaway worktree, real SQLite and ffprobe, -race): every rule passes except B1: `SaveAnimeEditor` saves episode edits before the anime write (app_runtime_editor.go:46), so a `conflict` or `error` result has already stored and announced them while the UI keeps them as Unsaved and Discard drops them from the draft only. The save-first order of L16 was my decision, taken without asking, and it considered only the retry. User: "tomaste una desición delicada por tu cuenta sin avisarme y eso dio problemas?" — yes; user-visible behavior is asked first from now on. Fix chosen by the user instead of one transaction: independent cards (S15), schedule card (S16), folder help (S17), chip rule (S18). User on folder changes: "Yo parto de la premisa de que la duración de capítulos no cambia [...] a pesar de los casos extremos no justifica reanalizar cada vez. Mejor quitar esa reactividad." then "También quitar al reactivar" — S7 rewritten. Advisories: A1 a cancel during a probe labels that file unreadable; A3 ApplyEdits does not check the anime exists (out of domain). Also pending with Mobile: the prune clock floor (A5) — options A/B/C asked, not answered.

- **L30 (2026-10-14) — ODD 6c implemented, unverified.** New binding `SaveEpisodeDurations(animeId, edits)` → `{outcome applied|no_op|error, message, changed}` over `ApplyEdits` (one transaction). `SaveAnimeEditorCommandDTO.Episodes`, `episodesOnlyResult` and the no_op→applied upgrade removed; `SaveAnimeEditor` writes only the anime. The whole `anime.changed` backfill subscription is gone (`gainsEpisodeFiles`, snapshot field constants): creation, folder change and activation measure nothing; process start and finished download runs still do (as told to the user: "Un anime que recibe su primera carpeta se mide la próxima vez que abras Bridge"). RED observed: `SaveEpisodeDurations` undefined; `TestEpisodeBackfillIgnoresAnimeEdits` got 3 triggers. GREEN: `go test ./internal/desktop/` 4 of 5 runs pass; one earlier run failed with no captured test name (possible pre-existing flake, to check with -count). Frontend ODD 6d/6e delegated to writer odd6de-frontend (reason: context backstop). Pending: ditto on internal/desktop, lint, frontend, verifier, commits.

- **L31 (2026-10-14) — ODD 6d/6e frontend written; ODD 6c gates.** Writer odd6de-frontend (staged): typecheck pass; full Vitest 382 files / 3869 tests pass; eslint on changed files exit 0 (whole-repo `bun run lint` has 1699 pre-existing errors in untouched files); `dharness check` staged exit 0 (warnings only); `dharness mutate --staged` run 1 37 survivors, run 2 3 survivors, each killed by a test proven by hand mutation (full rerun pending); render:smoke and layout:smoke pass. Parent: typecheck pass; ditto internal/desktop 4/4; `scripts/lint.ps1 -Profile all` 0 issues; checkgofilesize pass. Visible choices the spec did not fix (to confirm with the user): Episodes footer shows when the table is open or the draft has edits ("No unsaved changes" otherwise); re-analysis progress stays visible while hidden; save error is a card-local danger Alert, no success toast; edits locked while an episodes save is in flight; "N of M measured" chip always success; an anime placed twice on a day counts once at its first order; Schedule card hidden with no selection; Show/Hide state persists across anime switches; guard Save-and-continue saves anime then episodes, both run, continue only if both succeed; folder help copy 'Changing the folder does not recalculate episode durations. To measure them again, use "Re-analyze folder" in the Episodes card.' Found: CLAUDE.md names `bun run test:mutation:staged`, which no longer exists (lefthook uses `dharness mutate --staged`). Independent verifier odd6ce-verifier launched.

- **L32 (2026-10-14) — ODD 6c–6e verified.** Independent verifier odd6ce-verifier (scratch worktree with the candidate diff): PASS on S7, S15, S16, S17, no blockers. `go test -count=3` and `-count=8 ./internal/desktop/` pass (the single earlier failure did not reproduce in 11 runs); `go test ./internal/...` pass; typecheck clean; Vitest 382 files / 3869 tests; render:smoke renders; eslint on touched files 0 problems. `-race` is unavailable on this machine (cgo CC path "C:\Program"). Its three probes are committed as `internal/desktop/app_episode_editor_split_test.go` (wire `episodes` key ignored by the anime save, bad edit last stores nothing, only download runs trigger). A1 fixed: `docs/episode-durations-analysis.md` D5 and the trigger list now say anime edits trigger nothing. Advisories left open: A2 the board holds only active anime, so an inactive selected anime shows every day "not scheduled" even with days set; A3 guard Save-and-continue saves the episodes draft even during a re-analysis (the card's own Save is disabled then), so a later review confirm lands in the emptied draft as new unsaved edits; A4 an anime placed twice on one day counts once (out of domain).

- **L33 (2026-10-14) — A3 fixed: re-analysis blocks the guard's save.** User: "debería ser un proceso bloqueante, eso es todo." While a re-analysis runs, the guard's "Save and continue" is disabled and its handler saves nothing (`isGuardSaveBlocked`); "Stay" and "Discard changes" stay enabled (switching anime already cancels the re-analysis and drops its answer, use-episode-reanalysis.ts). RED observed on two tests (dialog button, hook saves nothing), GREEN; full Vitest 3871 pass. A2 checked: not a regression — the editor board has always held only active anime (schedule_query_service.go GetEditorBoard skips `Active != 1`); the new strip only makes it visible on an inactive anime. User asked: "nunca he visto un anime desactivado en el schedule antes, en un bug nuevo?" — answered, presentation pending the user's choice.
  - A2 accepted as is. User: "está bien, porque no son días reales" / "no son días efectivos quiero decir" / "en todo caso, se podría crear un estado visual para ese caso si tanto te molesta" — an inactive anime keeps the seven "not scheduled" days; no change.
  - First commit attempt of this fix: lefthook `frontend-render-smoke` failed with no message after 70 s (usually 6 s); `bun run render:smoke` alone passed right after. Treated as a transient headless-browser failure; retried.
