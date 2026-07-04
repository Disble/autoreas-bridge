# Delta for Anime Detail (Polish: Placeholder, Back, Repetition Timeline)

## MODIFIED Requirements

### Requirement: Shared Detail Component Across Catalog and History
Additions over sdd-36:

1. **Cover fallback correctness (bug fix)**: the placeholder MUST render whenever portada is
   absent OR the image fails to load — raw alt text must never be the visible outcome. The
   placeholder is the project's cute-anime SVG component (themed, no external asset).
2. **Back navigation**: the detail MUST show a back button that returns to the previous location
   (router back) with `/history` as fallback when there is no history entry.
3. **Repetition timeline (parity with Legacy "Historial de repetición")**: each repetition entry
   MUST present: estado (verified label domain; raw value fallback for unknown codes), número de
   capítulos vistos, fecha de creación, fecha de estreno, fecha de último capítulo visto, fecha
   de eliminación, and siguiente repetición (`fechaRepeticion`) — each with an explicit English
   "no data" fallback when absent — rendered as a timeline ordered most recent first.

#### Scenario: Placeholder on missing or failing cover
- GIVEN an anime whose portada is absent, or present but unloadable
- WHEN the hero renders
- THEN the cute-anime SVG placeholder MUST be visible (never raw alt text)

#### Scenario: Back returns to the exact History spot
- GIVEN a user who reached the detail from /history with state in the URL
- WHEN they press the back button
- THEN they MUST land on the same /history URL (page/search/filters intact)

#### Scenario: Repetition entry shows the full Legacy record
- GIVEN an anime with repetir entries
- WHEN the repetition timeline renders
- THEN each entry MUST show estado, capítulos vistos, and the five dates (with explicit
  fallbacks), most recent first
