package main

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
