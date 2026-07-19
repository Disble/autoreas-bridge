# Delta for availability

## MODIFIED Requirements

### Requirement: Daily availability recheck

The system SHALL, while a season is open, recheck episode-1 availability for
matched, still-waiting rows; a newly-available anime SHALL link to an existing
active anime with the same page or be created into "Sin ver", advancing the
row to created. The recheck SHALL be idempotent and SHALL NOT fail a whole run
on a single scrape error.

Additions over sdd-43: the recheck loop MUST ALSO refresh episode availability
for already-created rows that are still parked in the "Sin ver" Estrenos
section, so a "Re-check now" press (or the scheduled recheck) keeps the Daily
Board's Sin-ver episode counts live instead of frozen at creation time.

(Previously: this requirement and its scenarios used "chapter" vocabulary
(`AvailableChapters`, "chapter-1 availability", "chapter count"). SDD-52
renames the field to `AvailableEpisodes` and the prose to "episode" throughout.
No behavior changes — this is a vocabulary-only update, matching the
`available_chapters` -> `available_episodes` column rename.)

1. **Widened eligibility.** A row with `Availability == created` becomes probe
   -eligible IF, and only if, its CURRENT Estrenos section — resolved via the
   existing `AnimeGateway.CurrentPlacements` port, never a new season-repo
   field — is exactly `"Sin ver"`. Rows whose current section is `"Ver hoy"`
   or `"Visto"` MUST be excluded: no probe call, no write, no exception. A
   created row whose current section cannot be resolved (its anime id has no
   placements) MUST also be treated as ineligible (skipped), the same as an
   unresolvable row is today.
2. **Scope of the write.** For a widened-eligible created row, the recheck
   MUST update ONLY `AvailableEpisodes` from the probe result. It MUST NOT
   change `Availability` (it stays `created`), `MatchStatus`, or `AnimeID` —
   those fields remain the exclusive concern of the creation/staging flows.
   This is a MUST, not an implementation detail: overwriting `Availability`
   away from `created` would silently drop the row out of the Daily Board
   (which only renders created rows) and could make it eligible again for
   `CreateSeasonAnimes`, a regression this requirement forbids.
3. **Notification scope unchanged.** A widened-eligible created row's episode
   refresh MUST NOT contribute to `RecheckResult.Available` (the newly
   -available-for-creation report that drives the aggregate "Available today"
   notification and download chain). That report continues to reflect ONLY
   matched, uncreated rows transitioning to available, exactly as sdd-43
   specified — an already-created anime getting a new episode is not a
   creation-pending event.
4. **No side effects beyond the count.** Refreshing a Sin-ver created row's
   `AvailableEpisodes` MUST NOT create, link, or move any anime, and MUST NOT
   fail the whole run if its probe call errors (the row is left unchanged and
   the loop continues) — identical error-swallowing semantics to the existing
   matched-row probe path.
5. **Non-regression.** The existing eligibility and behavior for matched,
   uncreated rows (pending/ambiguous/not_found match rows excluded; matched
   rows probed; `Availability`/`AvailableEpisodes` updated; `Available` report
   populated only on new transitions) MUST remain exactly as sdd-43
   specified — the intake list's own recheck flow is untouched by this
   widening.

#### Scenario: newly available anime is created

- **WHEN** a waiting row's page now has episode 1
- **THEN** the anime is created into "Sin ver" and the row becomes created

#### Scenario: rerun is a no-op

- **WHEN** the recheck runs again
- **THEN** already-created rows are skipped and no duplicate anime is created

#### Scenario: new availability notifies and chains downloads

- **WHEN** a recheck creates at least one anime
- **THEN** one aggregate "Available today" notification fires and a download run
  is triggered

#### Scenario: Sin-ver created row's episode count refreshes live

- **GIVEN** a created row whose anime's current section (via
  `AnimeGateway.CurrentPlacements`) is `"Sin ver"`, with `AvailableEpisodes`
  frozen at 2 from creation time
- **WHEN** `RecheckAvailability` runs and the probe now reports 5 episodes for
  that row's page
- **THEN** the row's `AvailableEpisodes` becomes 5, and `Availability`,
  `MatchStatus`, and `AnimeID` are unchanged (still `created`)

#### Scenario: Ver hoy created row is never probed

- **GIVEN** a created row whose anime's current section is `"Ver hoy"`
- **WHEN** `RecheckAvailability` runs
- **THEN** the probe is NOT called for that row and its fields are unchanged
