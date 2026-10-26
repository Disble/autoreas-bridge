package season

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/persistence"
	"autoreas-bridge/internal/season/domain"
)

// WatchedSection is the Ver hoy → Visto auto-transition, decided inside the
// anime save that watches the episode. A save that leaves animeID in "Ver hoy"
// with at least one episode watched (they start at 0) moves it to "Visto" when
// it is a created anime of the open season; WatchedSection then returns
// "Visto", and "" otherwise. It reads the season through q, the save's own
// transaction, so the move is part of the same write instead of a second save.
func WatchedSection(ctx context.Context, q persistence.Querier, animeID, section string, progress float64) (string, error) {
	if section != verHoySection || progress < 1 || animeID == "" {
		return "", nil
	}
	var created bool
	err := q.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM season_animes
			WHERE season_id = (SELECT id FROM seasons WHERE status = 'open' LIMIT 1)
			  AND anime_id = ? AND availability = ?
		)`, animeID, string(domain.AvailabilityCreated)).Scan(&created)
	if err != nil {
		return "", fmt.Errorf("read the season state of anime %q: %w", animeID, err)
	}
	if !created {
		return "", nil
	}
	return vistoSection, nil
}
