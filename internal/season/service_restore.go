package season

import (
	"context"

	"autoreas-bridge/internal/season/domain"
)

// RestoreName brings a discarded intake row back as it was before the discard.
// Discarding overwrites only MatchStatus, so the status is derived from what the
// row still holds: a matched page comes back matched, candidates without a page
// come back ambiguous, and anything else comes back pending so the next matching
// run picks it up. A row that is not discarded is left unchanged, which keeps a
// repeated restore (a double-pressed Undo) harmless. Unlike the Raw-retype revive
// (reviveDiscardedSeasonAnime), the matched page and candidates are kept.
func (s *Service) RestoreName(ctx context.Context, rowID string) error {
	return s.mutateSeasonAnime(ctx, rowID, func(sa *domain.SeasonAnime) error {
		if sa.MatchStatus == domain.MatchDiscarded {
			sa.MatchStatus = restoredMatchStatus(*sa)
		}
		return nil
	})
}

// restoredMatchStatus derives the match status a discarded row returns to.
func restoredMatchStatus(sa domain.SeasonAnime) domain.MatchStatus {
	switch {
	case sa.MatchedSlug != "":
		return domain.MatchMatched
	case len(sa.Candidates) > 0:
		return domain.MatchAmbiguous
	default:
		return domain.MatchPending
	}
}
