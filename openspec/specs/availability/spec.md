# Spec — availability

## ADDED Requirements

### Requirement: Anime creation

The system SHALL create a brand-new anime record (estado 0, nrocapvisto 0,
activo true, primeravez true, a single dias entry in a given section) through
the same durable write path as every other write, readable by Legacy.

#### Scenario: create lands in Sin ver

- **WHEN** an anime is created for "Sin ver"
- **THEN** its record has estado 0, activo true, and a dias entry `Sin ver`

### Requirement: Daily availability recheck

The system SHALL, while a season is open, recheck chapter-1 availability for
matched, still-waiting rows; a newly-available anime SHALL link to an existing
active anime with the same page or be created into "Sin ver", advancing the
row to created. The recheck SHALL be idempotent and SHALL NOT fail a whole run
on a single scrape error.

Additions over sdd-43: the recheck loop MUST ALSO refresh chapter availability
for already-created rows that are still parked in the "Sin ver" Estrenos
section, so a "Re-check now" press (or the scheduled recheck) keeps the Daily
Board's Sin-ver chapter counts live instead of frozen at creation time.

1. **Widened eligibility.** A row with `Availability == created` becomes probe
   -eligible IF, and only if, its CURRENT Estrenos section — resolved via the
   existing `AnimeGateway.CurrentPlacements` port, never a new season-repo
   field — is exactly `"Sin ver"`. Rows whose current section is `"Ver hoy"`
   or `"Visto"` MUST be excluded: no probe call, no write, no exception. A
   created row whose section cannot be resolved (its anime id has no
   placements) MUST also be treated as ineligible (skipped), the same as an
   unresolvable row is today.
2. **Scope of the write.** For a widened-eligible created row, the recheck
   MUST update ONLY `AvailableChapters` from the probe result. It MUST NOT
   change `Availability` (it stays `created`), `MatchStatus`, or `AnimeID` —
   those fields remain the exclusive concern of the creation/staging flows.
   This is a MUST, not an implementation detail: overwriting `Availability`
   away from `created` would silently drop the row out of the Daily Board
   (which only renders created rows) and could make it eligible again for
   `CreateSeasonAnimes`, a regression this requirement forbids.
3. **Notification scope unchanged.** A widened-eligible created row's chapter
   refresh MUST NOT contribute to `RecheckResult.Available` (the newly
   -available-for-creation report that drives the aggregate "Available today"
   notification and download chain). That report continues to reflect ONLY
   matched, uncreated rows transitioning to available, exactly as sdd-43
   specified — an already-created anime getting a new chapter is not a
   creation-pending event.
4. **No side effects beyond the count.** Refreshing a Sin-ver created row's
   `AvailableChapters` MUST NOT create, link, or move any anime, and MUST NOT
   fail the whole run if its probe call errors (the row is left unchanged and
   the loop continues) — identical error-swallowing semantics to the existing
   matched-row probe path.
5. **Non-regression.** The existing eligibility and behavior for matched,
   uncreated rows (pending/ambiguous/not_found match rows excluded; matched
   rows probed; `Availability`/`AvailableChapters` updated; `Available` report
   populated only on new transitions) MUST remain exactly as sdd-43
   specified — the intake list's own recheck flow is untouched by this
   widening.

#### Scenario: newly available anime is created

- **WHEN** a waiting row's page now has chapter 1
- **THEN** the anime is created into "Sin ver" and the row becomes created

#### Scenario: rerun is a no-op

- **WHEN** the recheck runs again
- **THEN** already-created rows are skipped and no duplicate anime is created

#### Scenario: new availability notifies and chains downloads

- **WHEN** a recheck creates at least one anime
- **THEN** one aggregate "Available today" notification fires and a download run
  is triggered

#### Scenario: Sin-ver created row's chapter count refreshes live

- **GIVEN** a created row whose anime's current section (via
  `AnimeGateway.CurrentPlacements`) is `"Sin ver"`, with `AvailableChapters`
  frozen at 2 from creation time
- **WHEN** `RecheckAvailability` runs and the probe now reports 5 chapters for
  that row's page
- **THEN** the row's `AvailableChapters` becomes 5, and `Availability`,
  `MatchStatus`, and `AnimeID` are unchanged (still `created`)

#### Scenario: Ver hoy created row is never probed

- **GIVEN** a created row whose anime's current section is `"Ver hoy"`
- **WHEN** `RecheckAvailability` runs
- **THEN** the probe is NOT called for that row and its fields are unchanged

#### Scenario: Visto created row is never probed

- **GIVEN** a created row whose anime's current section is `"Visto"`
- **WHEN** `RecheckAvailability` runs
- **THEN** the probe is NOT called for that row and its fields are unchanged

#### Scenario: created row with no resolvable section is skipped

- **GIVEN** a created row whose anime id has no entry in
  `AnimeGateway.CurrentPlacements`'s result (empty placements)
- **WHEN** `RecheckAvailability` runs
- **THEN** the row is skipped exactly like an unresolvable row is today: no
  probe call, no write

#### Scenario: a Sin-ver created row's refresh never triggers a new-availability report

- **GIVEN** a Sin-ver created row whose `AvailableChapters` moves from 2 to 5
  this run
- **WHEN** `RecheckAvailability` returns its `RecheckResult`
- **THEN** that row's name is NOT added to `RecheckResult.Available`

#### Scenario: a Sin-ver created row's probe error leaves the run intact

- **GIVEN** a Sin-ver created row whose probe call returns an error
- **WHEN** `RecheckAvailability` runs over multiple rows including this one
- **THEN** this row is left unchanged, the run continues, and no error is
  returned for the whole call

#### Scenario: matched, uncreated rows keep today's exact behavior (non-regression)

- **GIVEN** a season with a pending row, an ambiguous row, a not_found row, a
  matched-waiting row, and a matched-available row, none of them created
- **WHEN** `RecheckAvailability` runs
- **THEN** only the matched rows are probed (pending/ambiguous/not_found are
  skipped exactly as before), and their `Availability`/`AvailableChapters`
  update exactly as sdd-43 specified

### Requirement: Stage animes across Estrenos sections

The system SHALL let the user move an anime between Sin ver / Ver hoy / Visto
from the Daily Board, and re-check availability on demand.

Additions over sdd-43: the Daily Board's Sin-ver rows MUST surface the same
at-a-glance availability information the Intake list already shows for
matched rows, using data already present on `SeasonAnimeRow` — no new field,
no new Wails call.

1. Each Sin-ver row MUST show its live "N chapter(s) available" text (matching
   `IntakePanel`'s existing wording and singular/plural rule) driven by
   `row.availableChapters`.
2. Each Sin-ver row MUST show an open-page link icon pointing at
   `row.matchedSlug` when it is non-empty, mirroring `IntakePanel`'s pattern.
3. This new derived/lookup logic MUST live in `daily-board.helpers.ts`
   (exported, JSDoc'd) and/or `use-daily-board.ts` — `DailyBoard.tsx` stays
   dumb UI per the frontend architecture constraints (no business logic in
   `.tsx`).
4. Ver hoy and Visto row rendering is explicitly UNCHANGED: no chapter count,
   no link icon, no availability-dot semantics are added to those groups by
   this change.

#### Scenario: move to Ver hoy

- **WHEN** the user stages a created anime into "Ver hoy"
- **THEN** the anime's dias is set to `Ver hoy`

#### Scenario: Sin-ver row shows live chapter count and open-page link

- **GIVEN** a Sin-ver row with `availableChapters: 5` and a non-empty
  `matchedSlug`
- **WHEN** the Daily Board renders
- **THEN** the row shows "5 chapters available" text and an open-page link
  icon pointing at `matchedSlug`

#### Scenario: Sin-ver row singular chapter wording

- **GIVEN** a Sin-ver row with `availableChapters: 1`
- **WHEN** the Daily Board renders
- **THEN** the row shows "1 chapter available" (singular, no trailing "s")

#### Scenario: Sin-ver row with no matched slug shows no link

- **GIVEN** a Sin-ver row with an empty `matchedSlug`
- **WHEN** the Daily Board renders
- **THEN** no open-page link icon is rendered for that row

#### Scenario: Ver hoy / Visto rows are unaffected (non-regression)

- **GIVEN** a Ver hoy row and a Visto row, each with a non-zero
  `availableChapters` and a non-empty `matchedSlug`
- **WHEN** the Daily Board renders
- **THEN** neither row shows a chapter-count text or an open-page link icon —
  their rendering is byte-for-byte the same as before this change
