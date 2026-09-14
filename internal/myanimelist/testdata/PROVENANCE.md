# Fixture Provenance

A running log of every `internal/myanimelist/testdata/` fixture's source query/URL and capture
date (Task-Planning Note B). JSON fixtures cannot hold comments without polluting the real
MyAnimeList response shape, so their provenance lives here instead of inline; HTML fixtures
(added starting Slice 2a) carry a literal HTML comment header of their own and are not repeated
below.

| Fixture | Source | Query / keyword | Captured | Notes |
|---|---|---|---|---|
| `search_bleach.json` | `GET https://myanimelist.net/search/prefix.json?type=anime&keyword=<escaped>&v=1` | `Bleach: Sennen Kessen-hen` | 2026-09-12 | 6 hits; top result id `41467`, exact match |
| `search_typo.json` | same endpoint | `Bleach: Sennen Kesen-hen` (one letter off) | 2026-09-12 | Still 6 hits, same top result id `41467` — typo tolerance survives the fixture layer |
| `search_zero_hits.json` | same endpoint | `Shokuguemi no Soma` | 2026-09-12 | 0 hits: `{"categories":[{"type":"anime","items":[]}]}` |
| `detail_tv.html` | `GET https://myanimelist.net/anime/41467` | — | 2026-09-12 | Bleach: Sennen Kessen-hen (TV). Trimmed to the title heading + Information block; carries its own HTML comment header. Multi-genre (`Genres:`), one studio under the plural `Studios:` label. `Source:` is anchor-rendered, text padded with literal newlines/spaces (trap #3). |
| `detail_single_genre.html` | `GET https://myanimelist.net/anime/48736` | — | 2026-09-12 | Sono Bisque Doll wa Koi wo Suru (TV). Singular `Genre:` label with one value — non-negotiable #1's fixture. `Themes:`/`Demographic:` kept as adjacent sibling divs on purpose, to prove the locator never leaks into them (trap #4). |
| `detail_movie.html` | `GET https://myanimelist.net/anime/32281` | — | 2026-09-12 | Kimi no Na wa. (Movie). `Duration: 1 hr. 46 min.` — the load-bearing D2a row. `Source:` is bare text (`Original`, no anchor) — the non-anchor half of trap #3. |
| `detail_ona.html` | `GET https://myanimelist.net/anime/35120` | — | 2026-09-12 | Devilman: Crybaby (ONA). `Type: ONA` — trap #5's fixture, returned as raw unmapped text. `Source:` anchor-rendered and newline-padded, same shape as `detail_tv.html`. |
| `detail_drift.html` | derived from `detail_tv.html` (`anime/41467`) | — | 2026-09-12 | **Not a capture** — `Type:` deliberately removed to simulate markup drift for the anchor-gate test (non-negotiable #3). Every other anchor and mapped field is byte-for-byte identical to `detail_tv.html`. |
