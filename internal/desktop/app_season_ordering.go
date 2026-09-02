package desktop

// GetSeasonOrderingBoard aggregates the ordering board: the rail is the approved
// (verdict Aprobado, linked, still in an Estrenos section) season candidates; the
// grid is every active anime already scheduled on a weekday (continuing titles +
// placed newcomers). Newcomers (this season's approved) are flagged.
func (a *App) GetSeasonOrderingBoard() OrderingBoardDTO {
	empty := OrderingBoardDTO{Rail: []OrderingCardDTO{}, Grid: []OrderingCardDTO{}}
	if a.seasonService == nil || a.animeQuery == nil {
		return empty
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil || active == nil {
		return empty
	}
	rows, err := a.seasonService.ListSeasonAnimes(a.seasonCtx(), active.ID)
	if err != nil {
		return empty
	}
	approved := approvedSeasonAnimeIDs(rows, active.MinApprovalGrade)
	animes, err := a.animeQuery.ListMobileAnimes(a.seasonCtx())
	if err != nil {
		return empty
	}
	board := OrderingBoardDTO{Rail: []OrderingCardDTO{}, Grid: []OrderingCardDTO{}, AppliedAt: millisPtrDTO(active.AppliedAt)}
	populateOrderingBoard(&board, animes, approved)
	return board
}
