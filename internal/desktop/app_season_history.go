package desktop

// Past-seasons history read model (SDD read-only view). These bindings expose
// closed seasons and a specific season by id so the workspace can show the full
// workflow read-only when no season is open. All degrade to empty/nil when the
// season service is unavailable and never panic.

// ListSeasons returns every season (open + closed), newest first.
func (a *App) ListSeasons() []SeasonDTO {
	if a.seasonService == nil {
		return []SeasonDTO{}
	}
	seasons, err := a.seasonService.ListSeasons(a.seasonCtx())
	if err != nil {
		return []SeasonDTO{}
	}
	out := make([]SeasonDTO, 0, len(seasons))
	for i := range seasons {
		out = append(out, seasonToDTO(&seasons[i]))
	}
	return out
}

// GetPastSeason returns a single season by id for the read-only detail view, or
// null when absent or unavailable.
func (a *App) GetPastSeason(seasonID string) *SeasonDTO {
	if a.seasonService == nil {
		return nil
	}
	season, err := a.seasonService.SeasonByID(a.seasonCtx(), seasonID)
	if err != nil || season == nil {
		return nil
	}
	dto := seasonToDTO(season)
	return &dto
}

// GetPastSeasonAnimes returns a specific season's intake rows for the read-only
// detail view. Empty when absent or unavailable.
func (a *App) GetPastSeasonAnimes(seasonID string) []SeasonAnimeDTO {
	if a.seasonService == nil {
		return []SeasonAnimeDTO{}
	}
	rows, err := a.seasonService.ListSeasonAnimes(a.seasonCtx(), seasonID)
	if err != nil {
		return []SeasonAnimeDTO{}
	}
	return a.seasonAnimeDTOs(a.seasonCtx(), rows)
}

// GetSeasonOrderingSnapshot returns the ordering board the season actually had
// when it closed, decoded from the payload stored at close time (P3). It is a
// read-only history read: live anime data is never consulted, so a closed
// season's board is returned even when the live animes have changed since. When
// no board was captured — an unwired service, an unknown or unreadable season,
// an empty payload (every season closed before P3), or malformed JSON — it
// reports Recorded=false with empty collections instead of an error or a
// fabricated board.
func (a *App) GetSeasonOrderingSnapshot(seasonID string) SeasonOrderingSnapshotDTO {
	if a.seasonService == nil {
		return emptySeasonOrderingSnapshot()
	}
	season, err := a.seasonService.SeasonByID(a.seasonCtx(), seasonID)
	if err != nil || season == nil {
		return emptySeasonOrderingSnapshot()
	}
	return orderingSnapshotFromClosure(season.ClosureJSON)
}
