package download

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
)

// listActiveAnimesToday returns active animes selected for the current mode and day.
func (s *Service) listActiveAnimesToday(ctx context.Context) ([]contracts.MobileAnime, error) {
	if s.deps.Animes == nil {
		return nil, nil
	}

	all, err := s.deps.Animes.ListMobileAnimes(ctx)
	if err != nil {
		return nil, fmt.Errorf("list mobile animes: %w", err)
	}

	target := config.SpanishWeekdayName(s.deps.Clock())
	if s.deps.SeasonMode(ctx) {
		target = seasonModeDiaName
	}

	active := make([]contracts.MobileAnime, 0, len(all))
	for _, anime := range all {
		if anime.Activo != 1 {
			continue
		}
		for _, d := range anime.Dias {
			if d.Dia == target {
				active = append(active, anime)
				break
			}
		}
	}
	return active, nil
}

// ensureJDOnline checks and requests the configured JDownloader device online.
func (s *Service) ensureJDOnline(ctx context.Context) bool {
	if s.deps.JD == nil {
		return false
	}
	if err := s.deps.JD.EnsureOnline(ctx, s.deps.JDDeviceName, true); err != nil {
		return false
	}
	return true
}
