package desktop

// Past-seasons history read model (SDD read-only view). These bindings expose
// closed seasons and a specific season by id so the workspace can show the full
// workflow read-only when no season is open. They run through the season module
// handle: a module that is not ready, or a failed read, is the binding's error,
// never an empty or absent answer.

// ListSeasons returns every season (open + closed), newest first.
func (a *App) ListSeasons() ([]SeasonDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) ([]SeasonDTO, error) {
		seasons, err := s.season.ListSeasons(a.seasonCtx())
		if err != nil {
			return nil, err
		}
		out := make([]SeasonDTO, 0, len(seasons))
		for i := range seasons {
			out = append(out, seasonToDTO(&seasons[i]))
		}
		return out, nil
	})
}

// GetPastSeason returns a single season by id for the read-only detail view, or
// null when no season has that id.
func (a *App) GetPastSeason(seasonID string) (*SeasonDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) (*SeasonDTO, error) {
		season, err := s.season.SeasonByID(a.seasonCtx(), seasonID)
		if err != nil || season == nil {
			return nil, err
		}
		dto := seasonToDTO(season)
		return &dto, nil
	})
}

// GetPastSeasonAnimes returns a specific season's intake rows for the read-only
// detail view; an unknown season has none.
func (a *App) GetPastSeasonAnimes(seasonID string) ([]SeasonAnimeDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) ([]SeasonAnimeDTO, error) {
		rows, err := s.season.ListSeasonAnimes(a.seasonCtx(), seasonID)
		if err != nil {
			return nil, err
		}
		return seasonAnimeDTOs(a.seasonCtx(), s.animes, rows), nil
	})
}

// GetSeasonOrderingSnapshot returns the ordering board the season actually had
// when it closed, decoded from the payload stored at close time (P3). It is a
// read-only history read: live anime data is never consulted, so a closed
// season's board is returned even when the live animes have changed since. When
// no board was captured — an unknown season, an empty payload (every season
// closed before P3), or malformed JSON — it reports Recorded=false with empty
// collections instead of a fabricated board. A failed season read is the
// binding's error.
func (a *App) GetSeasonOrderingSnapshot(seasonID string) (SeasonOrderingSnapshotDTO, error) {
	return a.moduleSet().season.Use(func(s seasonServices) (SeasonOrderingSnapshotDTO, error) {
		season, err := s.season.SeasonByID(a.seasonCtx(), seasonID)
		if err != nil {
			return SeasonOrderingSnapshotDTO{}, err
		}
		if season == nil {
			return emptySeasonOrderingSnapshot(), nil
		}
		return orderingSnapshotFromClosure(season.ClosureJSON), nil
	})
}
