package anime

import (
	"fmt"
	"sort"

	"autoreas-bridge/internal/api/contracts"
)

// validateScheduleDraft rejects malformed client placements before any write. It
// validates only destinations touched by the draft, so an unrelated sparse legacy
// destination cannot prevent an otherwise valid ordering operation.
func validateScheduleDraft(records []ReadRecord, command ApplyAnimeScheduleDraftCommand) error {
	seenAnimeIDs := map[string]struct{}{}
	submittedPositions := map[string]map[int]struct{}{}
	activeIDs := activeScheduleAnimeIDs(records)
	for _, entry := range command.Entries {
		if err := validateScheduleEntry(entry, activeIDs, seenAnimeIDs, submittedPositions); err != nil {
			return err
		}
	}
	return validateAffectedScheduleDestinations(normalizedSchedulePlacements(records, command), affectedScheduleDestinations(records, command))
}

// activeScheduleAnimeIDs returns IDs for active schedule records.
func activeScheduleAnimeIDs(records []ReadRecord) map[string]struct{} {
	activeIDs := map[string]struct{}{}
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Activo == 1 {
			activeIDs[item.ID] = struct{}{}
		}
	}
	return activeIDs
}

// validateScheduleEntry validates one draft entry and its placements.
func validateScheduleEntry(entry ApplyAnimeScheduleDraftEntry, activeIDs, seenAnimeIDs map[string]struct{}, submittedPositions map[string]map[int]struct{}) error {
	if _, ok := activeIDs[entry.AnimeID]; !ok {
		return fmt.Errorf("schedule draft anime %s is not active", entry.AnimeID)
	}
	if _, ok := seenAnimeIDs[entry.AnimeID]; ok {
		return fmt.Errorf("duplicate anime entry %s", entry.AnimeID)
	}
	seenAnimeIDs[entry.AnimeID] = struct{}{}
	seen := map[string]struct{}{}
	for _, placement := range entry.Placements {
		if err := validateSchedulePlacement(entry.AnimeID, placement, seen, submittedPositions); err != nil {
			return err
		}
	}
	return nil
}

// validateSchedulePlacement validates one placement and reserves its position.
func validateSchedulePlacement(animeID string, placement contracts.MobileAnimeDay, seen map[string]struct{}, submittedPositions map[string]map[int]struct{}) error {
	if _, ok := allowedScheduleDestinations[placement.Dia]; !ok {
		return fmt.Errorf("invalid schedule destination %s", placement.Dia)
	}
	if placement.Orden <= 0 {
		return fmt.Errorf("invalid schedule order %d for anime %s", placement.Orden, animeID)
	}
	key := fmt.Sprintf("%s#%d", placement.Dia, placement.Orden)
	if _, ok := seen[key]; ok {
		return fmt.Errorf("duplicate placement %s for anime %s", key, animeID)
	}
	seen[key] = struct{}{}
	return reserveSubmittedPosition(placement, submittedPositions)
}

// reserveSubmittedPosition reserves a submitted destination position.
func reserveSubmittedPosition(placement contracts.MobileAnimeDay, submittedPositions map[string]map[int]struct{}) error {
	if submittedPositions[placement.Dia] == nil {
		submittedPositions[placement.Dia] = map[int]struct{}{}
	}
	if _, exists := submittedPositions[placement.Dia][placement.Orden]; exists {
		return fmt.Errorf("non-contiguous positions for %s", placement.Dia)
	}
	submittedPositions[placement.Dia][placement.Orden] = struct{}{}
	return nil
}

// validateAffectedScheduleDestinations validates contiguity for affected destinations.
func validateAffectedScheduleDestinations(placementsByAnime map[string][]contracts.MobileAnimeDay, affected map[string]struct{}) error {
	for destination := range affected {
		if !schedulePositionsAreContiguous(positionsForDestination(placementsByAnime, destination)) {
			return fmt.Errorf("non-contiguous positions for %s", destination)
		}
	}
	return nil
}

// positionsForDestination collects all orders for a destination.
func positionsForDestination(placementsByAnime map[string][]contracts.MobileAnimeDay, destination string) []int {
	positions := make([]int, 0)
	for _, placements := range placementsByAnime {
		for _, placement := range placements {
			if placement.Dia == destination {
				positions = append(positions, placement.Orden)
			}
		}
	}
	return positions
}

// schedulePositionsAreContiguous reports whether positions form a contiguous sequence.
func schedulePositionsAreContiguous(positions []int) bool {
	sort.Ints(positions)
	for index, position := range positions {
		if position != index+1 {
			return false
		}
	}
	return true
}
