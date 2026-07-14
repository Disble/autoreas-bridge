# Proposal — sdd-48-reconcile-preserve-bridge-native-animes

## Intent

Stop the SDD-30 startup catch-up reconcile from silently soft-deleting
Bridge-native animes, and restore the two records already lost to it, so
season-created animes stay visible in Chapters instead of vanishing after the
next Bridge startup.

Season-created animes (e.g. "Yani Neko" `P7y6ZIbvbYkefA7t`, "Youjo Senki II"
`WEh5Vro3gKMGhY6i`) show in the season DailyBoard "Sin ver" section but are
missing from the Chapters "Sin ver" season filter. Confirmed root cause (verified
against code, the real `bridge.db`, and Legacy `animes.dat`):

1. Chapters `ListChapterSchedule` (`internal/anime/chapter_service.go:173`) skips
   any anime with `Activo==0`. The DailyBoard ignores `activo` because the season
   is its own authority, so the same records appear there but not in Chapters.
2. Both animes have `activo:false` + `fechaEliminacion` set in `bridge.db`
   `anime_snapshots`. Their `dias` is `"Sin ver"` (day matches) — only the
   active-flag filter hides them.
3. They were soft-deleted by the SDD-30 ADR-30-3b startup catch-up reconcile:
   `internal/anime/snapshot.go` `DiffSnapshots` soft-deletes ANY baseline
   snapshot id absent from the latest Legacy `animes.dat` parse (forces
   `activo=false` + stamps `fechaEliminacion`), with NO exemption for
   Bridge-native records.
4. Season-created animes are Bridge-native: `CreateSeasonAnimes`
   (`internal/season/service.go`) -> `WriteService.CreateAnime` -> `applyWrite`
   -> `UpdateWriter.RequestWrite` appends to `animes.dat`. But Legacy rewrites
   `animes.dat` wholesale on its own saves, dropping the Bridge-only entries.
   Legacy `animes.dat` currently has ZERO occurrences of either title.
5. On the next Bridge startup the reconcile sees these ids absent from Legacy and
   soft-deletes them — the classic Bridge<->Legacy dual-writer problem.

Recorded divergence (project rule: code is runtime truth): `season_animes`
carry `availability='created'` while the corresponding anime snapshot is
soft-deleted. This drift is documented here before proposing the fix.

## Scope (two layers)

1. **Durable fix — reconcile exemption.** The startup catch-up reconcile MUST
   NOT soft-delete a Bridge-native anime solely because its id is absent from the
   latest Legacy `animes.dat` parse. The explicit user-initiated Bridge-side
   delete (the SoftDelete command) is a SEPARATE path and MUST keep working
   unchanged — only the *reconcile-absence* soft-delete is being narrowed.

   Recommended direction (design phase formalizes; not locked): track
   Bridge-native anime ids in a small `bridge.db` ownership registry populated at
   `WriteService.CreateAnime` time, and have the reconcile skip the
   absence-soft-delete for owned ids. Keep `DiffSnapshots` a pure diff — pass the
   owned-id set in from the coordinator/store rather than querying inside the
   diff. Do NOT add a new field to the Legacy canonical JSON shape: it
   round-trips to `animes.dat` and Legacy may drop or choke on unknown fields.

2. **Data restore — one-time repair.** Restore the two already-soft-deleted
   records (`P7y6ZIbvbYkefA7t`, `WEh5Vro3gKMGhY6i`): set `activo=true` and clear
   `fechaEliminacion` so they reappear in Chapters immediately. The repair must
   be idempotent and guarded (safe to run more than once, no-op when the records
   are already active or absent).

## Out of scope

- Making Legacy persist Bridge-native animes, or stopping Legacy from rewriting
  `animes.dat` wholesale.
- Changing the Chapters `Activo==0` filter or the DailyBoard section logic.
- The season->anime consistency reconciliation beyond these two animes.
- Backfilling ownership for historical Bridge-native animes beyond the two named
  records (the registry is populated going forward at create time; the restore
  handles the known casualties).

## Rollback plan

- **Durable fix:** the reconcile exemption is gated by the owned-id set. If the
  registry misbehaves, pass an empty owned-id set to restore the original
  soft-delete-on-absence behavior with no code revert; the git revert of the
  slice is otherwise clean because `DiffSnapshots` stays a pure diff.
- **Ownership registry:** additive `bridge.db` table populated at create time; on
  rollback it is simply left unread (no destructive migration). Dropping it is
  safe because it holds no source-of-truth data — only a hint the reconcile
  consults.
- **Data restore:** one-time idempotent repair. Rollback is re-running the
  original reconcile (or a manual re-soft-delete of the two ids); because the
  repair only flips `activo`/`fechaEliminacion`, it carries no schema change to
  unwind.

## Affected modules

- `internal/anime/snapshot.go` — `DiffSnapshots`: accept and honor an owned-id
  exemption set for the absence-soft-delete path (pure diff preserved).
- `internal/anime/*` (coordinator/store seam) — populate and pass the owned-id
  set into the reconcile; house the one-time restore repair.
- `internal/anime/write_service.go` — `WriteService.CreateAnime`: register the
  new anime id in the Bridge-native ownership registry.
- `bridge.db` schema — additive ownership registry table (Bridge-native anime
  ids); no change to the Legacy canonical JSON / `animes.dat` shape.
- Tests: table-driven reconcile semantic tests (owned id survives absence,
  unowned id still soft-deletes, explicit SoftDelete still works), plus an
  idempotent-restore guard test. Strict TDD — tests first.

## Constraints

- Strict TDD is active (`go test ./...`). Tests first.
- Go + frontend share the warning-at-400 / hard-fail-above-500 effective-line
  policy.
- Code is English by default; Spanish only at the legacy adapter surface and data
  literals (`"Sin ver"`, etc.).
