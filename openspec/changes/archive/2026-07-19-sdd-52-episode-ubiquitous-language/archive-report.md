# Archive Report: SDD-52 Episode Ubiquitous Language

**Change**: `2026-07-19-sdd-52-episode-ubiquitous-language`
**Archived**: 2026-07-19
**Verdict**: PASS (39/39 tasks, 14/14 scenarios, all tests green)
**Mode**: hybrid (OpenSpec filesystem + Engram)

## What Changed

Standardized the anime-progress domain vocabulary on **"episode"** and eliminated
"chapter" (a Spanish calque of the legacy `NroCapVisto`/"capítulo" field) from
every bridge-owned surface, keeping only the sanctioned ADR-007 Spanish legacy
boundaries. Executed as 6 stacked-to-main PR slices: backend rename → DB migration
→ Wails bindings regen → frontend feature-folder rename → copy/comment sweep →
docs + living-spec update.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `episode-vocabulary` | **Created** | 7 ADDED requirements (backend vocab, DB migration, activity log dual-read, frontend vocab/route, living-specs update, ubiquitous-language doc, repo-wide verification). Copied from delta as new main spec. |
| `availability` | **No merge needed** | Main spec already updated with "episode" vocabulary (PR6 task 6.2 applied during implementation). Delta MODIFIED requirement matches current state. |
| `anime-editor` | **No merge needed** | Main spec already updated with "Episodes" (PR6 task 6.2 applied during implementation). Delta MODIFIED requirement matches current state. |
| `rest-api-write-sync` | **No merge needed** | Main spec already updated with "fractional episode" (PR6 task 6.2 applied during implementation). Delta MODIFIED requirement matches current state. |

## Source of Truth Updated

- `openspec/specs/episode-vocabulary/spec.md` — **created** (new capability spec, 7 requirements)
- `openspec/specs/availability/spec.md` — already current (PR6 applied delta during implementation)
- `openspec/specs/anime-editor/spec.md` — already current (PR6 applied delta during implementation)
- `openspec/specs/rest-api-write-sync/spec.md` — already current (PR6 applied delta during implementation)

## Archive Contents

```
openspec/changes/archive/2026-07-19-sdd-52-episode-ubiquitous-language/
├── proposal.md     ✅
├── specs/          ✅ (4 domain subdirectories: anime-editor, availability, episode-vocabulary, rest-api-write-sync)
├── design.md       ✅
├── tasks.md        ✅ (39/39 tasks complete)
└── verify-report.md ✅ (PASS)
```

## Engram Traceability

| Artifact | Engram ID | topic_key |
|----------|-----------|-----------|
| Proposal | #5716 | `sdd/2026-07-19-sdd-52-episode-ubiquitous-language/proposal` |
| Spec | #5717 | `sdd/2026-07-19-sdd-52-episode-ubiquitous-language/spec` |
| Design | #5718 | `sdd/2026-07-19-sdd-52-episode-ubiquitous-language/design` |
| Tasks | #5719 | `sdd/2026-07-19-sdd-52-episode-ubiquitous-language/tasks` |
| Apply-progress | #5722 | `sdd/2026-07-19-sdd-52-episode-ubiquitous-language/apply-progress` |
| Verify-report | #5737 | `sdd/2026-07-19-sdd-52-episode-ubiquitous-language/verify-report` |

## Design Deviations (Carried from Verify Report)

1. **PR2 migration hook** — Used `migrateSeasonAnimes()` branching instead of flat `ColumnAdds` entry. Safer for skip-jump installs. Documented in tasks 2.2.
2. **PR2→PR3 field deferral** — `SeasonAnimeDTO.AvailableChapters` renamed in PR3 with binding regen, not PR2. Coupled to Wails IPC.
3. **PR3 re-scope** — Absorbed `SeasonAnimeDTO.AvailableChapters` rename atomically with binding regen.
4. **PR5 residual identifiers** — Renamed `stubAppChapterService` and `formatAvailableChapters` that PR3 left.

All deviations are documented, coherent with design principles, and verified non-blocking.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
