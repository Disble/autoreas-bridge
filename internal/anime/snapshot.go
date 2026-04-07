package anime

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"

	"autoreas-bridge/internal/events"
)

type SnapshotRecord struct {
	AnimeID       string
	CanonicalJSON []byte
	Hash          string
}

type ParseWarning struct {
	Line   int
	Reason string
}

func HashSnapshot(canonicalJSON []byte) string {
	sum := sha256.Sum256(canonicalJSON)
	return hex.EncodeToString(sum[:])
}

func cloneSnapshotRecords(input map[string]SnapshotRecord) map[string]SnapshotRecord {
	if input == nil {
		return nil
	}

	cloned := make(map[string]SnapshotRecord, len(input))
	for id, record := range input {
		cloned[id] = SnapshotRecord{
			AnimeID:       record.AnimeID,
			CanonicalJSON: append([]byte(nil), record.CanonicalJSON...),
			Hash:          record.Hash,
		}
	}

	return cloned
}

func DiffSnapshots(current map[string]SnapshotRecord, baseline map[string]SnapshotRecord) ([]events.AnimeChangedEvent, []string) {
	currentIDs := sortedSnapshotIDs(current)
	updates := make([]events.AnimeChangedEvent, 0, len(currentIDs))
	for _, id := range currentIDs {
		record := current[id]
		persisted, exists := baseline[id]
		if exists && persisted.Hash == record.Hash {
			continue
		}

		updates = append(updates, events.AnimeChangedEvent{
			AnimeID: id,
			Payload: append([]byte(nil), record.CanonicalJSON...),
		})
	}

	pruneIDs := make([]string, 0)
	deletes := make([]events.AnimeChangedEvent, 0)
	for id := range baseline {
		if _, exists := current[id]; !exists {
			pruneIDs = append(pruneIDs, id)
			deletes = append(deletes, events.AnimeChangedEvent{AnimeID: id, Payload: nil})
		}
	}
	sort.Strings(pruneIDs)
	sort.Slice(deletes, func(i, j int) bool {
		return deletes[i].AnimeID < deletes[j].AnimeID
	})

	eventsOut := make([]events.AnimeChangedEvent, 0, len(updates)+len(deletes))
	eventsOut = append(eventsOut, updates...)
	eventsOut = append(eventsOut, deletes...)

	return eventsOut, pruneIDs
}

func sortedSnapshotIDs(records map[string]SnapshotRecord) []string {
	ids := make([]string, 0, len(records))
	for id := range records {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
