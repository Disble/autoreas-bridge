package domain

import "sort"

// Placement is one weekday (or Estrenos section) plus the anime's position within
// it — the season projection of a legacy `dias` entry `{dia, orden}`. Orden is an
// explicit number the user assigns; it is NOT derived from array position.
type Placement struct {
	Dia   string
	Orden int
}

// SchedulePatchIntent is the full desired `dias` for one anime whose schedule
// changed. The service turns each into a single anime write that replaces the
// whole dias array with these explicit {dia, orden} entries.
type SchedulePatchIntent struct {
	AnimeID string
	Dias    []Placement
}

// PlanSchedule diffs the current placements against the draft and emits an intent
// per anime whose placements changed (carrying the FULL desired dias). Pure and
// idempotent: an anime whose draft equals its current state produces no intent,
// and an anime absent from the draft is left untouched (the board schedules, it
// never demotes). Comparison is position-insensitive within the array — it is the
// {dia → orden} mapping that matters.
func PlanSchedule(current, draft map[string][]Placement) []SchedulePatchIntent {
	ids := make([]string, 0, len(draft))
	for id := range draft {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	var intents []SchedulePatchIntent
	for _, id := range ids {
		desired := draft[id]
		if placementsEqual(current[id], desired) {
			continue
		}
		intents = append(intents, SchedulePatchIntent{AnimeID: id, Dias: desired})
	}
	return intents
}

// placementsEqual reports whether two placement sets carry the same {dia → orden}
// mapping (order within the slice is irrelevant).
func placementsEqual(a, b []Placement) bool {
	if len(a) != len(b) {
		return false
	}
	am := make(map[string]int, len(a))
	for _, p := range a {
		am[p.Dia] = p.Orden
	}
	for _, p := range b {
		if orden, ok := am[p.Dia]; !ok || orden != p.Orden {
			return false
		}
	}
	return true
}
