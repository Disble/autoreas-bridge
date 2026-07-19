package season

import (
	"context"

	"autoreas-bridge/internal/season/domain"
)

// RecheckAvailability probes episode availability for every matched, uncreated
// row and records it (Availability + AvailableEpisodes) — it NEVER creates an
// anime. It ALSO refreshes AvailableEpisodes for already-created rows still
// parked in the "Sin ver" Estrenos section (resolved via the batched
// AnimeGateway.CurrentPlacements), leaving Availability/MatchStatus/AnimeID
// untouched so a created row never re-enters the creation-eligible state.
// Creating is a separate, explicit, consent-gated action (creation and
// soft-delete are the only irreversible steps of the workflow). A probe error
// leaves a row unchanged; the run never fails as a whole. res.Checked counts
// every row probed either path. Reports the names that NEWLY became available
// for creation (a row already available, or an already-created row, is never
// reported).
func (s *Service) RecheckAvailability(ctx context.Context, seasonID string) (RecheckResult, error) {
	if s.probe == nil {
		return RecheckResult{}, ErrAvailabilityDepsUnavailable
	}
	rows, err := s.repo.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		return RecheckResult{}, err
	}
	placements := s.lookupCreatedPlacements(ctx, rows)
	var res RecheckResult
	for _, row := range rows {
		if handled, err := s.recheckCreateCandidate(ctx, row, &res); handled || err != nil {
			if err != nil {
				return res, err
			}
			continue
		}
		if err := s.refreshCreatedPlacementAvailability(ctx, row, placements, &res); err != nil {
			return res, err
		}
	}
	return res, nil
}

// lookupCreatedPlacements loads schedule placements for created anime rows.
func (s *Service) lookupCreatedPlacements(ctx context.Context, rows []domain.SeasonAnime) map[string][]domain.Placement {
	createdAnimeIDs := make([]string, 0)
	for _, row := range rows {
		if row.Availability == domain.AvailabilityCreated && row.MatchStatus == domain.MatchMatched && row.AnimeID != "" {
			createdAnimeIDs = append(createdAnimeIDs, row.AnimeID)
		}
	}
	if len(createdAnimeIDs) == 0 {
		return nil
	}
	placements, _ := s.gateway.CurrentPlacements(ctx, createdAnimeIDs)
	return placements
}

// recheckCreateCandidate checks whether a row can be created in the anime store.
func (s *Service) recheckCreateCandidate(ctx context.Context, row domain.SeasonAnime, res *RecheckResult) (bool, error) {
	if row.MatchStatus != domain.MatchMatched || row.Availability == domain.AvailabilityCreated {
		return false, nil
	}
	res.Checked++
	chapters, probeErr := s.probe.AvailableEpisodes(ctx, row.MatchedSlug)
	if probeErr != nil {
		return true, nil
	}
	wasAvailable := row.Availability == domain.AvailabilityAvailable
	if chapters >= 1 {
		row.Availability = domain.AvailabilityAvailable
		row.AvailableEpisodes = chapters
		if !wasAvailable {
			res.Available = append(res.Available, row.RawName)
		}
	} else {
		row.Availability = domain.AvailabilityWaiting
		row.AvailableEpisodes = 0
	}
	return true, s.repo.UpdateSeasonAnime(ctx, row)
}

// refreshCreatedPlacementAvailability updates availability for created placements.
func (s *Service) refreshCreatedPlacementAvailability(ctx context.Context, row domain.SeasonAnime, placements map[string][]domain.Placement, res *RecheckResult) error {
	if row.Availability != domain.AvailabilityCreated || row.MatchStatus != domain.MatchMatched || row.AnimeID == "" {
		return nil
	}
	if !isPlacedInSinVer(placements[row.AnimeID]) {
		return nil
	}
	res.Checked++
	chapters, probeErr := s.probe.AvailableEpisodes(ctx, row.MatchedSlug)
	if probeErr != nil {
		return nil
	}
	row.AvailableEpisodes = chapters
	return s.repo.UpdateSeasonAnime(ctx, row)
}

// isPlacedInSinVer reports whether placements include the unseen queue.
func isPlacedInSinVer(placements []domain.Placement) bool {
	return len(placements) > 0 && placements[0].Dia == sinVerSection
}
