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

	target := config.WeekdayName(s.deps.Clock())
	if s.deps.SeasonMode(ctx) {
		target = seasonModeDiaName
	}

	active := make([]contracts.MobileAnime, 0, len(all))
	for _, anime := range all {
		if anime.Activo != 1 {
			continue
		}
		for _, d := range anime.Dias {
			if englishWeekday(d.Dia) == target {
				active = append(active, anime)
				break
			}
		}
	}
	return active, nil
}

// spanishToEnglishWeekday translates the Legacy-Spanish schedule-day literals stored inside
// anime_snapshots (e.g. "Lunes") into their English-domain equivalent for comparison against
// config.WeekdayName (SDD-55 ADR-55-4: read-time mapping, no stored change; the stored
// literal is never dropped or renamed).
var spanishToEnglishWeekday = map[string]string{
	"Lunes":     "Monday",
	"Martes":    "Tuesday",
	"Miércoles": "Wednesday",
	"Jueves":    "Thursday",
	"Viernes":   "Friday",
	"Sábado":    "Saturday",
	"Domingo":   "Sunday",
}

// englishWeekday returns the English-domain equivalent of a stored schedule-day literal.
// Values that are not one of the seven Spanish weekday names (e.g. the seasonModeDiaName
// "Ver hoy" sentinel) pass through unchanged, since they compare directly against target.
func englishWeekday(dia string) string {
	if mapped, ok := spanishToEnglishWeekday[dia]; ok {
		return mapped
	}
	return dia
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
