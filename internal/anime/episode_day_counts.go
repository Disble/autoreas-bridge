package anime

import "context"

// EpisodeDayCount is a single weekday's active-progress count, mirroring
// Legacy's buscarMedalla (episodes-cover-pipeline spec, "Per-day
// active-progress count mirrors Legacy's buscarMedalla semantics").
type EpisodeDayCount struct {
	Day   string
	Count int
}

// ListEpisodeDayCounts counts, per weekday, the anime entries that are
// active-or-have-no-active-flag AND have estado > 0 (any non-"Viendo"
// state). Only days with a non-zero count are present in the result, per
// design G5 ("emit only non-zero to keep the payload minimal").
//
// Drift note (code wins, deliberate): Legacy's buscarMedalla treats activo
// as tri-state (true/absent counted, only explicit false excluded). The
// bridge collapses activo to an int and ListEpisodeSchedule already treats
// Activo == 0 as inactive; this query reuses that SAME predicate for
// internal consistency with the schedule the badges annotate.
func (s *EpisodeService) ListEpisodeDayCounts(ctx context.Context) ([]EpisodeDayCount, error) {
	items, err := s.query.ListMobileAnimes(ctx)
	if err != nil {
		return nil, err
	}

	counts := make(map[string]int)
	order := make([]string, 0)
	for _, item := range items {
		if item.Activo == 0 || item.Estado <= 0 {
			continue
		}
		for _, day := range item.Dias {
			if _, seen := counts[day.Dia]; !seen {
				order = append(order, day.Dia)
			}
			counts[day.Dia]++
		}
	}

	result := make([]EpisodeDayCount, 0, len(order))
	for _, day := range order {
		if counts[day] == 0 {
			continue
		}
		result = append(result, EpisodeDayCount{Day: day, Count: counts[day]})
	}
	return result, nil
}
