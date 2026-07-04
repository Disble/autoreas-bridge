# Delta for Anime Detail (Información Parity Enrichment)

User verdict after testing sdd-35: the 4-field detail card is far below the Legacy "Información"
screen. This delta enriches the existing shared detail surface. The `GetAnimeDetail` binding and
`MobileAnime` payload from sdd-35 already carry every field required here — this is a
frontend-only enrichment. UX bar: parity in data, superiority in experience (2026 UX standards).

## MODIFIED Requirements

### Requirement: Shared Detail Component Across Catalog and History
The shared detail surface (reused unchanged from both Catalog and History drill-downs) MUST
render a hero header and two content sections approaching Legacy "Información" parity:

1. **Hero header**: cover image from `portada` (with a graceful placeholder when absent), título,
   an "estado • tipo" subtitle line (human-readable labels), and a semantic status chip
   reflecting the anime's state (e.g. soft-deleted/eliminado).
2. **Per-chapter section** ("chapter info"): episodes-watched count, total episodes or an
   explicit "no data" fallback, per-episode duration or an explicit fallback, and a progress
   visualization (lightweight bar — no heavy chart dependency) of watched vs total.
3. **General data section**: página rendered as a clickable external link, plus carpeta, fechas
   (estreno/creación/últ. cap visto), estudios, origen, and géneros, each with explicit fallbacks
   when absent.

The `repetir` repetition timeline from sdd-35 MUST remain, presented within the enriched layout.
All UI chrome English; Spanish data literals verbatim.

#### Scenario: Hero header renders identity and state
- GIVEN an anime with portada, estado, and tipo
- WHEN the detail renders
- THEN the cover, título, "estado • tipo" subtitle, and a status chip MUST be visible
- AND a missing portada MUST render a placeholder, not a broken image

#### Scenario: Per-chapter section with explicit fallbacks
- GIVEN an anime whose totalcap or duración is absent
- WHEN the per-chapter section renders
- THEN it MUST show the watched count AND explicit English "no data" fallbacks for the missing
  values (never a silent blank), alongside a progress visualization when total is known

#### Scenario: Página is a real link
- GIVEN an anime with a `pagina` URL
- WHEN the general data section renders
- THEN the URL MUST be a clickable link that opens externally (not plain text)

#### Scenario: Repetition timeline retained
- GIVEN an anime with `repetir` entries
- WHEN the detail renders
- THEN the repetition timeline MUST still be presented (most recent first), integrated in the
  enriched layout
