# Library root and folderRelative

Objective: promote `downloads.root` to the app-wide library root, serve `folderRelative` to mobile, and rebase active animes when the root changes.
Branch: `feat/library-root` (worktree `autoreas-bridge-worktrees/library-root`, from `dev` e3aabfb8). Delivery: ask-on-risk. Runners: `go test`, `bun --cwd="frontend" run test`.

## Specs

- **S1 — Ubiquitous language and ADR.** "Library root" is the single folder on this computer where the anime library lives ("realmente solo hay una raíz por computador"). Each anime keeps its absolute folder as the source of truth. A list of library roots (Steam-style) is rejected. Record in ADR 027 and `docs/ubiquitous-language.md`; update ADR 014/021 references.
- **S2 — Rename the setting.** `app_settings` key `downloads.root` → `library.root`, Go accessors `DownloadsRoot`/`SetDownloadsRoot` → `LibraryRoot`/`SetLibraryRoot`, Wails bindings `GetDownloadsRoot`/`SetDownloadsRoot` → `GetLibraryRoot`/`SetLibraryRoot`. A bootstrap migration copies an existing `downloads.root` value to `library.root` and removes the old key (covers restored databases). Consumers (download, season, anime create, intake) read the new name. "elevar el estatus de esa variable que era solo antes para [descargas] y convertirla definitivamente en una variable de library roots".
- **S3 — Options UI rename.** Per the approved mockup (https://claude.ai/artifact/9a79dfoDpHZmtntLrYArjp): tab "Downloads" → "Library", label "Downloads root" → "Library root", copy updated. `DownloadsRootPanel` → `LibraryRootPanel`.
- **S4 — `folderRelative` on the wire.** `MobileAnime.folderRelative` (optional, omitempty, `/`-separated), computed on read against the library root, never stored; served on GET /api/animes, GET /api/animes/{id} and the changes feed (snapshots recomputed in `sync.toAnimeChanges`). Rules: case-insensitive; `\` and `/` equal; cut only at a segment boundary (`D:\Anime` must not match `D:\Anime2\X`); trailing separator on the root ignored; omitted when root unset, folder empty, folder equal to root, or folder outside root. Subfolders are kept whole (e.g. `Date a Live/Date a Live II/1 Date A Bullet Dead or Bullet`). Announce in `docs/openapi.yaml`, including the known limitation for inactive animes under a previous root.
- **S5 — Rebase on root change.** "si se cambia el path general, sea un recálculo avisado previamente al usuario, solo de los animes que están activos en este momento". Saving a different root opens a confirmation listing the active animes under the old root; on confirm their absolute folder is rewritten old root → new root through the normal write path (ordinary `folder` update for mobile). Active animes outside the old root are listed and untouched; inactive history is never touched; files on disk are not moved. If the root did not change or no active anime is affected, save directly as today.
- **S6 — Test policy.** "la clave es modificar los tests, no agregar nuevos" — clarified (L8): "Para funcionalidades nuevas, obviamente tienes que agregar tests nuevo, esa regla era para funcionalidades modificadas." Modified behavior extends its existing tests; new behavior (the S5 rebase) gets new tests.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1 | inline | pending | |
| T2 | S2, S6 | inline (committed with T3: the Wails binding rename spans both) | done | RED store_test legacy-key reopen → GREEN; ditto sync migration 3/3 killed; 15 rename-only download/desktop mutants skipped (identifier rename, behavior unchanged and covered by existing suites) |
| T3 | S3, S6 | inline | done | typecheck ok; 82 files / 808 tests green in touched frontend suites; tests renamed, none added |
| T4 | S4, S6 | inline | done | RED compile (decorator signature) → GREEN; existing decorator tests extended with real-path rows (nested, `/`, case, outside root, prefix sibling, root itself, empty, nil, UNC); ditto desktop+pathutil 34/36, survivors :44 and :123 are pre-existing duration code moved by the file rename (not retroactive); one equivalent mutant removed by simplifying the cut; openapi gate ok |
| T5 | S5, S6 | inline | done | RED compile (plan, bindings) + 4 hook/modal tests → GREEN; new tests for the new rebase behavior (S6 per L8), existing panel/source tests extended; ditto anime+desktop 39/39 after killing 3 survivors (equal-name order, failure count, nothing-to-move without editor); typecheck ok; panel+infra 30 files green |
| T6 | S1–S6 | delegated verifier (high risk: persisted key rename, bulk folder write) | pending | |

## Log

- L1 (2026-10-15, user): "Vas a trabajar con mobile-folders team para crear una nueva funcionalidad conjunta relacionada con los path de carpetas. Usando codegraph haz una exploración de todo lo que necesitarás y quedas a la espera de mobile team."
- L2 (2026-10-15, user): "esta funcionalidad se hará en bridge desde un worktree, tomalo en cuenta"
- L3 (2026-10-15): DB measurement (read-only): root `D:\Anime`; 838/839 animes have a folder; 744 under D: (2015→2026-10, 12 active), 94 under E: (2023-07→2025-04, 0 active); depth under root 667×1, 47×2, 23×3, 7×4. E: is history from another PC.
- L4 (2026-10-15, user): rejected stored relative field and multi-root list; approved one library root per computer, rename in this release, compute `folderRelative` on read.
- L5 (2026-10-15, user): rejected per-row folderRelative-only events (option a); approved rebasing active animes with prior confirmation. Mobile (mobile-folders) agreed: it takes `folderRelative` from the snapshot whenever `folder` is in changed_fields.
- L6 (2026-10-15, user): approved mockup. Worktree created; RDD off (global).
- L7 (2026-10-15): T1 1e878a8c, T2+T3 442a90e9, T4 c6f85392 committed through the full lefthook gate. T5 paused: the rebase is new CORE behavior (writes stored folders) with no existing Go test that covers the library-root bindings, so S6 requires asking the user before adding one. Plan: pure `anime.PlanLibraryRootChange` + `PreviewLibraryRootChange`/`ApplyLibraryRootChange` bindings writing through `EditorService.Save` (OCC base per anime); frontend modal extends the existing LibraryRootPanel tests.
- L8 (2026-10-15) user: "Para funcionalidades nuevas, obviamente tienes que agregar tests nuevo, esa regla era para funcionalidades modificadas." S6 rewritten; T5 resumes with new tests for the rebase plan and bindings.
