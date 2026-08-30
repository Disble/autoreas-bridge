package anime

import (
	"context"
	"time"

	"autoreas-bridge/internal/anime/store"
)

// newStoreGatewayConfig wires all adapter dependencies into a store.GatewayConfig
// for the SQLite-native persistence gateway. SDD-55 Slice B: the file-append
// port (FilePath/Append) is gone entirely -- persist() and ApplyBatch finalize
// straight into SQLite (ADR-55-1/ADR-55-3).
func newStoreGatewayConfig(
	lookup snapshotLookup,
	writeBases WriteBaseStore,
	deps WriteServiceDeps,
	now func() time.Time,
	publishChanged func(eventID, animeID string, payload []byte, changedFields []string),
) store.GatewayConfig {
	var outbox store.AnimeChangedOutboxStore
	if configured, ok := writeBases.(store.AnimeChangedOutboxStore); ok {
		outbox = configured
	}
	return store.GatewayConfig{
		LoadSnapshot: func(ctx context.Context, id string) (store.Snapshot, error) {
			record, err := lookup.GetSnapshot(ctx, id)
			return toLegacySnapshot(record), err
		},
		ListSnapshots: func(ctx context.Context) (map[string]store.Snapshot, error) {
			records, err := lookup.ListSnapshots(ctx)
			result := make(map[string]store.Snapshot, len(records))
			for id, record := range records {
				result[id] = toLegacySnapshot(record)
			}
			return result, err
		},
		Operations:     writeBases,
		Outbox:         outbox,
		Conflicts:      deps.Conflicts,
		PublishChanged: publishChanged,
		Now:            now,
	}
}
