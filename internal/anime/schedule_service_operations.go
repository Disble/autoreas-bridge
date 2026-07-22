package anime

import (
	"bytes"

	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
)

// buildScheduleOperations creates legacy batch operations for desired placements.
func buildScheduleOperations(recordsByID map[string]ReadRecord, desiredPlacements map[string][]contracts.MobileAnimeDay) ([]store.BatchOperation, error) {
	operations := make([]store.BatchOperation, 0, len(recordsByID))
	for animeID, record := range recordsByID {
		operation, changed, err := buildScheduleOperation(animeID, record, desiredPlacements[animeID])
		if err != nil {
			return nil, err
		}
		if changed {
			operations = append(operations, operation)
		}
	}
	return operations, nil
}

// buildScheduleOperation creates one legacy operation when placements changed.
func buildScheduleOperation(animeID string, record ReadRecord, placements []contracts.MobileAnimeDay) (store.BatchOperation, bool, error) {
	raw, _, _, err := store.DecodeForUpdate(record.Snapshot.CanonicalJSON)
	if err != nil {
		return store.BatchOperation{}, false, err
	}
	raw.SetDays(toLegacyScheduleDays(placements))
	desired, err := raw.MarshalJSON()
	if err != nil {
		return store.BatchOperation{}, false, err
	}
	if bytes.Equal(desired, record.Snapshot.CanonicalJSON) {
		return store.BatchOperation{}, false, nil
	}
	return store.BatchOperation{AnimeID: animeID, Base: toLegacySnapshot(record.Snapshot), Desired: desired}, true, nil
}

// toLegacyScheduleDays converts contract placements to legacy anime days.
func toLegacyScheduleDays(placements []contracts.MobileAnimeDay) []store.AnimeDay {
	days := make([]store.AnimeDay, 0, len(placements))
	for _, placement := range placements {
		days = append(days, store.AnimeDay{Day: placement.Day, Order: float64(placement.Order)})
	}
	return days
}
