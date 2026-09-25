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

## `Status:` (MyAnimeList) vs. `estado` (bridge editor) — two domains, one English word

SDD-70 introduces a MyAnimeList metadata lookup, and MyAnimeList's detail page carries a label
literally spelled `Status:`. It reports **airing status** — `Currently Airing`, `Finished Airing`,
`Not yet aired` — a fact about the show's broadcast, not about any one viewer.

The bridge's own `status` field on `AnimeEditorDraft` is the **watching `estado`** — the value the
Spanish-language UI renders as `Sin ver` / `Ver hoy` / `Visto` / `No me gusto` (ADR-007). It is a
fact about the user, not about the broadcast.

| Term | Domain | Meaning | Bridge surface |
| --- | --- | --- | --- |
| `Status:` | MyAnimeList | Airing status of the show itself | `internal/myanimelist` only — read, then discarded (never mapped) |
| `estado` / `status` | Bridge editor | The user's own watching progress | `AnimeEditorDraft.status`; UI copy `Sin ver`/`Ver hoy`/`Visto`/`No me gusto` |

Conflating the two would write MyAnimeList's airing status into a user's own watching progress on
autofill — a plausible-looking but wrong value, silently applied. `internal/myanimelist` is
forbidden by depguard from importing `internal/anime` or `internal/api/contracts` (ADR-022, D5)
precisely so this mapping has no code path in which to happen: the module that reads MAL's
`Status:` never holds a reference to the type the bridge's `estado` lives on. See
[ADR 022: MyAnimeList metadata source](./adr/022-myanimelist-metadata-source.md).

## Bridge status vs. device sync health vs. device sync diagnostics — three things, one word

Three unrelated readings of the same word coexist, and one of them is forbidden by the
schema that stores it. The agent-generated report in `snapshot.html` titled a card
`Sync health reported by the device`, which is that report's wording and not bridge
vocabulary.

| Concept | Source | What it actually is |
| --- | --- | --- |
| **Bridge status** | `BridgeStatusCard`, `useBridgeStatusCard` | The bridge's own **SQLite storage** status. No device is involved |
| **Device sync health** | `device_sync_state` → `notifyDeviceSyncHealth`, notification kind `sync_health_warning` | Device **staleness** — approaching or past the stale window. It drives a notification |
| **Device sync diagnostics** | `device_telemetry_events`, kind `cycle_report` (`internal/observability/telemetry`) | The per-cycle **report a device sends about itself** |

The kind-discriminated telemetry store replaced the single-shape `device_sync_diagnostics`
table, so the report lives beside every other telemetry kind and is told apart by its `kind`
column rather than by its table. The **device sync diagnostics** concept is unchanged: the kind
is the vocabulary's old report, stored once and read back through the same name.

A sync-cycle report is **not** health. The diagnostics schema says so in its own words:
`degraded` "is a FIDELITY signal, not a health signal … It reports how complete the
record is, not how the device is doing." A report can be perfectly complete and describe
a device that is failing, and a full event ring can ship `degraded = 'events'` for a
perfectly healthy cycle.

Write **diagnostics** or **sync cycle report** for the third concept, never health.
Related schema constraints that follow from the same definition:

- `app_state` is stored but is **not a filter dimension** — the client hardcodes
  `background`, so a foreground cycle also reports it. `trigger_source` is the only
  trustworthy discriminator.
- A diagnostics **capture** in `request_captures` cannot be attributed to a device: the
  report body carries no `device_id` by design, since identity travels only in the
  Authorization header. Attribution exists only in the `device_telemetry_events` row,
  which the ingestion seam fills from the authenticated token.

See [ADR 025: Sanitization is an egress rule, not a display rule](./adr/025-sanitization-is-an-egress-rule.md).
