# Ubiquitous Language — Episode

The bridge vocabulary is **episode**.

Use `episode` for bridge-owned domain code, UI copy, docs, and living specs. The older `chapter` term is a historical calque from the legacy Spanish field `NroCapVisto`. SDD-52 records the decision and keeps the legacy boundary intact.

## Quick path

1. Write `episode` in bridge-owned surfaces.
2. Keep ADR-007 legacy fields and Spanish runtime literals unchanged.
3. Leave older change folders and historical planning artifacts untouched.

## Term map

| Historical term | Current bridge term | Scope |
| --- | --- | --- |
| chapter | episode | Bridge-owned Go/TS identifiers, UI copy, docs, living specs |
| `available_chapters` | `available_episodes` | SQLite season column and bridge-owned season models |
| `chapter_adjusted` | `episode_adjusted` | New activity-log writes; readers stay tolerant of historical rows |
| `NroCapVisto` / `TotalCap` | unchanged | ADR-007 legacy adapter boundary |

## ADR-007 boundary checklist

These surfaces stay as they are because they are compatibility boundaries, not naming choices:

- [x] `LegacyAnimeRaw` and the `.dat` byte-compat adapter fields stay Spanish.
- [x] Runtime Spanish literals such as `"Sin ver"`, `"Ver hoy"`, `"Visto"`, and `"No me gusto"` stay unchanged.
- [x] REST/WS payload fields such as `nrocapvisto` and `totalcap` stay byte-identical.
- [x] Future bridge-owned code outside those boundaries uses `episode`.

See [ADR 007: Code in English; Spanish Only at Explicit Boundaries](./adr/007-english-code-spanish-boundaries.md).

## Historical artifacts status

The older change folders under `openspec/changes/` are historical planning records, even when they are still outside `archive/`. For SDD-52, that means `2026-07-05-sdd-38-chapters-covers-parity`, `2026-07-05-sdd-39-season-selection-program`, `2026-07-05-sdd-40-estado-labels`, `2026-07-05-sdd-41b-season-mode-derived`, `2026-07-05-sdd-43-availability`, and `2026-07-13-sdd-48-reconcile-preserve-bridge-native-animes` stay untouched; only living specs under `openspec/specs/**` are updated to today’s vocabulary.

SDD-52 also left the pre-SDD-52 chapter-management planning document untouched, as a historical artifact capturing the planning language for the feature that now ships as **Episodes**. That document was removed in the 2026-08-25 documentation cleanup: it described planning for shipped work, and the vocabulary decision it preceded is recorded here.

## API consumer impact

SDD-52 does **not** change any REST or WebSocket wire shape.

- No HTTP path changed.
- No REST or WS payload field changed.
- `nrocapvisto` and `totalcap` remain byte-identical per ADR-007.
- Mobile and any other API consumers require no coordination for this slice.

Any future slice that changes a bridge API contract must announce that change in `docs/openapi.yaml` before merge.
