package desktop

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season/domain"
)

// Daily board sections (Spanish data literals: they are the Estrenos section
// names the board shows).
const (
	dailySectionSinVer = "Sin ver"
	dailySectionVerHoy = "Ver hoy"
	dailySectionVisto  = "Visto"
)

// dailyBoardEntries records the Daily board as the frontend derives it from
// live data (groupCreatedBySection): only created rows reach it, in intake row
// order; each lists under the daily section of its anime's current first days
// entry, and its order is its 1-based position within that section. The result
// is never nil, so a captured empty board stays distinct from an absent one.
func dailyBoardEntries(rows []domain.SeasonAnime, animes []contracts.MobileAnime) []SeasonDailyBoardEntryDTO {
	liveSections := make(map[string]string, len(animes))
	for _, mobileAnime := range animes {
		if len(mobileAnime.Days) > 0 {
			liveSections[mobileAnime.ID] = mobileAnime.Days[0].Day
		}
	}
	entries := []SeasonDailyBoardEntryDTO{}
	counts := map[string]int{}
	for _, row := range rows {
		if row.Availability != domain.AvailabilityCreated {
			continue
		}
		section := dailySectionOf(liveSections[row.AnimeID])
		counts[section]++
		entries = append(entries, SeasonDailyBoardEntryDTO{RowID: row.ID, AnimeID: row.AnimeID, Section: section, Order: counts[section]})
	}
	return entries
}

// dailySectionOf maps an anime's live section to its Daily board section: Ver
// hoy and Visto keep theirs, a weekday placement means the anime graduated and
// lists under Visto, and anything else lists under Sin ver.
func dailySectionOf(liveSection string) string {
	if liveSection == dailySectionVerHoy || liveSection == dailySectionVisto {
		return liveSection
	}
	if _, ok := seasonWeekdays[liveSection]; ok {
		return dailySectionVisto
	}
	return dailySectionSinVer
}

// dailyBoardSnapshot maps the stored Daily board into its read model: a nil
// board (absent or null in the payload) was never recorded.
func dailyBoardSnapshot(entries []SeasonDailyBoardEntryDTO) SeasonDailyBoardSnapshotDTO {
	if entries == nil {
		return SeasonDailyBoardSnapshotDTO{Entries: []SeasonDailyBoardEntryDTO{}}
	}
	return SeasonDailyBoardSnapshotDTO{Recorded: true, Entries: entries}
}
