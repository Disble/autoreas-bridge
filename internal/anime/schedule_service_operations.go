package anime

import (
	"bytes"

	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/api/contracts"
)

// buildScheduleOperations creates legacy batch operations for desired placements.
func buildScheduleOperations(recordsByID map[string]ReadRecord, desiredPlacements map[string][]contracts.MobileAnimeDay) ([]legacy.BatchOperation, error) {
	operations := make([]legacy.BatchOperation, 0, len(recordsByID))
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
func buildScheduleOperation(animeID string, record ReadRecord, placements []contracts.MobileAnimeDay) (legacy.BatchOperation, bool, error) {
	raw, _, _, err := legacy.DecodeForUpdate(record.Snapshot.CanonicalJSON)
	if err != nil {
		return legacy.BatchOperation{}, false, err
	}
	raw.SetDays(toLegacyScheduleDays(placements))
	desired, err := raw.MarshalJSON()
	if err != nil {
		return legacy.BatchOperation{}, false, err
	}
	if bytes.Equal(desired, record.Snapshot.CanonicalJSON) {
		return legacy.BatchOperation{}, false, nil
	}
	return legacy.BatchOperation{AnimeID: animeID, Base: toLegacySnapshot(record.Snapshot), Desired: desired}, true, nil
}

// toLegacyScheduleDays converts contract placements to legacy anime days.
func toLegacyScheduleDays(placements []contracts.MobileAnimeDay) []legacy.AnimeDay {
	days := make([]legacy.AnimeDay, 0, len(placements))
	for _, placement := range placements {
		days = append(days, legacy.AnimeDay{Dia: placement.Dia, Orden: float64(placement.Orden)})
	}
	return days
}
