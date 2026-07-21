# ADR 008: Legacy Breakup — SQLite Is the Sole Owner of Anime State

## Status
Accepted (SDD-55)

## Context
Bridge originally existed to synchronize with the Legacy Autoreas Desktop
application's NeDB-style data file, `animes.dat`: a file watcher observed it,
a parser read it, an append-only writer wrote to it, and a "legacy adapter"
(`internal/anime/legacy`) byte-matched its JSON shape so that Bridge and
Legacy stayed interchangeable. Over time SQLite (`anime_snapshots`) became
the actual read/write path for Bridge's own REST API, WebSocket sync, and UI
— the Legacy file channel remained wired but was no longer required for
Bridge to function on its own.

SDD-55 ("legacy breakup") is a cold cut: it removes the Legacy file channel
entirely (watcher, parser, append writer, startup catch-up, ownership
arbitration) and makes SQLite the sole, exclusive owner of anime state, with
no import path and no synchronization with the Legacy Desktop app. Users who
still run Legacy get no synchronization from this version of Bridge onward.

A literal reading of the original proposal ("delete `internal/anime/legacy`
wholesale") would have deleted Bridge's own active persistence engine, since
the package's `wire.go`/`mapper.go`/`projection.go`/`gateway.go` files are not
Legacy interop — they are the decode → merge → Stage → Finalize codec and
orchestration that Bridge uses to read and write `anime_snapshots.snapshot_json`
itself. This drift between the proposal's mental model and the code was
caught during design (`design.md`'s ADR-55-1/55-3) and corrected before
implementation, per the project's "code wins" rule.

## Decision
1. **Cut the channel, not the codec (ADR-55-1, ADR-55-3).** Remove the
   Legacy file watcher, `.dat` parser, append-only writer, startup catch-up,
   and ownership-arbitration code entirely (Slices A-B). Retain the
   `AnimeRaw` JSON codec and its Stage → Finalize → Publish orchestration —
   relocated to `internal/anime/store`, with all "legacy" naming and the
   `Append`/`FilePath` file-channel port removed — because it is Bridge's own
   active SQLite persistence engine, not Legacy interop.
2. **Storage format Spanish keys are retained verbatim.** The codec continues
   to read/write Spanish-keyed JSON (`nrocapvisto`, `estado`, `activo`,
   `dias`, `pagina`, …) inside `anime_snapshots.snapshot_json`, because
   rewriting the stored shape to English columns would be a large,
   non-additive migration out of scope for this change. ADR 007's boundary
   rules continue to apply to this codec, but the *reason* for the boundary
   changes: it is no longer "must byte-match an external Legacy file", it is
   "must byte-match Bridge's own already-persisted rows".
3. **English-ify only the unstored boundaries, additively (ADR-55-4).** Where
   Spanish vocabulary lives outside the stored blob — the
   `spanishWeekdayNames` weekday-matching identifiers and the openapi wire
   field names — Slice C renames identifiers to English and adds English wire
   aliases alongside the existing Spanish ones via idempotent, additive
   migrations. Nothing stored is dropped, renamed, or rewritten in place.
4. **First boot on empty SQLite is a cold empty state, not an import
   (ADR-55-2).** There is no one-time `animes.dat` import and no import CLI;
   an empty database serves an empty catalog by design.
5. **Retire the `legacy_boundary` linter and its named specs (Slice D).**
   Once no Legacy file channel exists, the `tools/checkarchitecture` gate
   that enforced the byte-compat Legacy/Bridge boundary has nothing left to
   enforce and is removed, along with the specs describing capabilities that
   no longer exist as named contracts (`anime-legacy-raw`, `legacy-gateway`,
   `anime-snapshot-parser`, `append-only-safe-writer`,
   `windows-resilient-file-watcher`, `writeback` — retired via their delta
   specs' `REMOVED Requirements` sections, merged at archive time per the
   standard SDD archive convention).

## Consequences
* **Positive:** Bridge's mission is now honestly stated — SQLite-native
  anime tracker, not a Legacy synchronization bridge — matching what the code
  had already become.
* **Positive:** removing `animes.dat` file I/O, the watcher, and the parser
  reduces filesystem attack surface and eliminates a whole class of Windows
  file-lock/atomic-replace bugs.
* **Positive:** the retained codec keeps existing stored rows readable with
  zero data migration risk; nothing about `snapshot_json`'s shape changes.
* **Negative / accepted tradeoff:** users who still run the Legacy Desktop
  app lose synchronization entirely starting from this version of Bridge; there
  is no compatibility shim or opt-back-in path.
* **Neutral:** ADR 007's Spanish-boundary rules survive unchanged in
  substance (see ADR 007's superseded note) — only the boundary's rationale
  is updated, from "external byte-compat contract" to "retained internal
  storage format".
