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
| **Bridge status** | `getSQLiteStatus`, `useSyncStatusChip` (rail footer chip) | The bridge's own **SQLite storage** status. No device is involved |
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

## Episode availability vs. creation readiness — two questions about one anime

A matched intake row needs two different facts before it becomes something the user watches, and the
bridge names them with words that read as near-synonyms.

**Episode availability** is a fact about the **site**: does the episode source already serve at least
one episode for this anime? It is recorded on the season row (`Availability`, `available_episodes`,
`first_available_at`) and it is the gate behind the season list's "available to create". It is checked
**again** (`RecheckAvailability`) rather than once, because the answer changes on its own: an anime
whose first episode has not aired yet is `waiting` today and `available` tomorrow. That is why the
season list runs the check as a standing job and not only on demand.

**Creation readiness** is a fact about the **local installation**: can Bridge create this anime here and
then download it, with this library root, these hosters, and this configuration?
(`download.ReadinessService`, `DownloadReadinessSnapshot`, the local readiness workflow ADR-014
separates from creation.) It does not change because an episode aired, and it says nothing about the
site.

| Term | Fact about | Surface |
| --- | --- | --- |
| Episode availability | The site: is an episode served yet | `SeasonAnime.Availability` (`waiting` / `available` / `created`), `available_episodes`, UI copy "Check availability" |
| Creation readiness | The local installation: can it create and download here | `download.ReadinessService`, `DownloadReadinessSnapshot` |
| Premiere grade | **The user's own** verdict on episode 1 | `premiere_grade`, `grade_source` — an opinion, not a catalog fact |

**Write "availability check" for the operation, never "probe" and never "the probe of the slug".** The
probe is the mechanism — one HTTP read of the episode count through `Service.probe` — and a mechanism
word in domain prose hides the question being asked. Keep `probe` only where the Go adapter that
performs it is named. `RecheckAvailability` is spelled the way it is for the same reason: the prefix
names the fact that the answer expires.

A matching run has two phases, and both have names: **name matching** (resolve each intake name to a
page URL) and the **availability check** (decide which of those pages already serve an episode). The
run's product is a **triage of the list**, and every row it leaves behind has exactly one action:
create it, wait for the episode check to find it, pick a candidate, fix the name, retry a failed
search, or nothing. UI copy may say a row is **ready to watch** once it is matched *and* available; that
is a phrase for the reading surface, not a domain type.

See [ADR 014: Anime creation stores the page; download execution interprets it](./adr/014-anime-creation-download-readiness-boundary.md).

## Library root vs. anime folder vs. relative folder — three paths, one anime

An anime's files live in one folder, and Bridge names three paths around it.

**Library root** is the single folder on this computer where the anime library lives (`app_settings`
key `library.root`, Options › Library). There is exactly one per computer. Older drive prefixes in the
data (`E:\Anime`) are history from earlier computers, not additional roots. It was called the
*downloads root* until ADR 027; that name is retired.

**Anime folder** is the absolute path stored on each anime (`folder`). It is the source of truth: desktop
opens it, downloads into it and validates it. When an anime is created, its folder defaults to the library
root plus the sanitized anime name; Intake and the editor can pick any other folder, which is how
sequels, side stories, films and OVAs end up nested under their parent show.

**Relative folder** (`folderRelative` on the mobile wire) is the anime folder with the library root
removed, for example `Date a Live/Date a Live II`. It is computed whenever an anime is sent to mobile and
never stored; it is absent when the folder is outside the library root.

| Term | Stored? | Surface |
| --- | --- | --- |
| Library root | Yes, one value per computer | `settings.LibraryRoot`, `GetLibraryRoot` / `SetLibraryRoot`, Options › Library |
| Anime folder | Yes, per anime, absolute | `folder` in `anime_snapshots.snapshot_json`, `MobileAnime.folder` |
| Relative folder | No, computed on read | `MobileAnime.folderRelative` |

Changing the library root rewrites the anime folder of **active** animes under the old root, after the user
confirms; inactive history keeps its stored folder. See
[ADR 027: One library root per computer](./adr/027-one-library-root-per-computer.md).

## Site vs. site host vs. hoster — three answers to "where did this episode come from"

An episode download crosses three places, and each one is a different fact.

**Site** is the episode provider whose pages Bridge reads: `jkanime`. It is `sites.SiteDescriptor.Name`
and it is what an anime's page URL points at.

**Site host** is the site's public host that actually answered: `jkanime.net`, `jkanime.org` or
`jkanime.bz`, the mirrors of ADR-029. One site has several site hosts, and the one that answers can
change between two requests when a host is challenged. It travels on `sites.DownloadLink.SiteHost`.
Stored page URLs always name the canonical site host, so they never reveal which one answered.

**Hoster** is where the file itself lives: `Mediafire`, `Mega`. It is `sites.DownloadLink.Hoster`, and
JDownloader fetches the file from it.

| Term | Example | Surface |
| --- | --- | --- |
| Site | `jkanime` | `sites.SiteDescriptor.Name`, hoster priority per site |
| Site host | `jkanime.org` | `sites.DownloadLink.SiteHost`, metadata key `siteHost`, `jkanime.host_fallback` (`from` / `to`) |
| Hoster | `Mediafire` | `sites.DownloadLink.Hoster`, metadata key `hoster` |

Write "site host" for the mirror that answered, never "provider" and never "host" alone, which
also names hosters. See [ADR-029](./adr/029-jkanime-host-fallback-chain.md) and
[ADR-030](./adr/030-provider-egress-clearance.md).
