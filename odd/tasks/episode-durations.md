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
  vez por día normalmente." Triggers: process start; after each download run (touched anime); when an anime gains a
  folder or becomes active. No periodic timer. One pass at a time, plus one queued repeat. Skipped silently without
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

## Tasks

Planning heuristic: about 400 authored changed lines per ODD (advisory only, not a gate). The estimates count
production, tests and docs.

| ID | Unit | Specs | Depends on | Route | Est. lines | Risk | Status | Commit |
|---|---|---|---|---|---|---|---|---|
| ODD 1 | **Storage.** `internal/anime/episodes` (or equivalent) package: schema descriptor, store with the S3/S6 write rules (insert-if-absent, manual upsert, measured upsert skipping manual, delete), `durations_pending_announce` written in the same transaction, backup group with footprint test, `checkarchitecture` ownership rule. | S2–S6, S13 (table) | none | delegated, parallel with ODD 2 (writer trigger a) | ~400 | High: item 1 (new persisted data and backup format). Independent verifier. | pending | — |
| ODD 2 | **Identity, whole folder.** New exported function returning every confidently assigned `(episode, basename)` plus skipped files with their reason (fractional, duplicate, ambiguity, unreadable). Parity with existing `Identify` decisions. | S5, S10 (re-analysis input) | none | delegated, parallel with ODD 1 (writer trigger a) | ~250 | Item 6 guarded by parity tests; medium | pending | — |
| ODD 3 | **Measurement.** Download landed writes the reading (insert-if-absent). Background backfill with the three S7 triggers, single-flight with one queued repeat, active anime only, confidence gate, all anime types. | S6, S7, S9 | ODD 1, ODD 2 | inline | ~450 | High: item 4 (concurrency of the backfill). Independent verifier. | pending | — |
| ODD 4 | **Shared read model and Today.** Pure `EpisodeLengths` and `LongNextEpisode` in the anime context; Today's binding reads the table in one query; remove TodayMarks probing. Today output unchanged (regression tests on `LongNextEpisode`). | S1, S8, S9 | ODD 1, ODD 3 | inline | ~300 (net, includes removals) | Item 3 (Wails contract kept identical); medium | pending | — |
| ODD 5 | **Sync to Mobile.** Announcer and `episode.durations_changed`; changelog-recorder and WebSocket-hub subscriptions; serve-time join in `toAnimeChanges` and `GET /api/animes` through `EpisodeLengths`; guard tests (anime edit unchanged, duration save publishes no `AnimeChangedEvent`, `modified_at` unchanged); `docs/openapi.yaml`. | S11–S14 | ODD 1, ODD 4 | inline | ~450 | High: items 3 and 4 (contract Mobile consumes, event ordering). Independent verifier. | pending | — |
| ODD 6a | **Editor backend.** Wails bindings: list rows (stored plus derived "Not measured"), edit, Add episode, Clear, re-analysis preview, and confirm (manual kept). Writes go through the ODD 1 store, so they mark pending. Folder change triggers the S7 backfill. | S10 | ODD 1, ODD 2, ODD 3 | inline, or parallel with ODD 4–5 (disjoint surface) | ~400 | Item 3 (new bindings only, additive); medium | pending | — |
| ODD 6b | **Editor UI.** "Episodes" accordion per the approved guide; `AirisEmptyState` `inline` size with a layout fixture; skeleton/empty/alert states; hooks with colocated tests; progressive list rule. | S10 | ODD 6a | inline | ~800 (frontend, split into two commits) | Item 6 covered by Vitest and the layout fixture; medium | pending | — |
| ODD 7 | **Mobile handoff.** Send the `openapi.yaml` contract and the analysis to the Mobile team; answer their questions. No Bridge code. | S14 | ODD 5 | inline | ~0 | none | pending | — |

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
- **Next step:** commit the planning docs, then ODD 1 and ODD 2 in parallel.
