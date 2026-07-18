package anime

import (
	"context"
	"time"

	"autoreas-bridge/internal/anime/legacy"
)

// newLegacyGatewayConfig wires all adapter dependencies into a legacy.GatewayConfig
// for the NeDB datastore gateway.
func newLegacyGatewayConfig(
	store snapshotLookup,
	filePath string,
	writeBases WriteBaseStore,
	deps WriteServiceDeps,
	now func() time.Time,
	appendPayload func(context.Context, string, []byte) error,
	publishChanged func(string, string, []byte),
) legacy.GatewayConfig {
	var outbox legacy.AnimeChangedOutboxStore
	if configured, ok := writeBases.(legacy.AnimeChangedOutboxStore); ok {
		outbox = configured
	}
	return legacy.GatewayConfig{
		LoadSnapshot: func(ctx context.Context, id string) (legacy.Snapshot, error) {
			record, err := store.GetSnapshot(ctx, id)
			return toLegacySnapshot(record), err
		},
		ListSnapshots: func(ctx context.Context) (map[string]legacy.Snapshot, error) {
			records, err := store.ListSnapshots(ctx)
			result := make(map[string]legacy.Snapshot, len(records))
			for id, record := range records {
				result[id] = toLegacySnapshot(record)
			}
			return result, err
		},
		FilePath:       filePath,
		Operations:     writeBases,
		Outbox:         outbox,
		Conflicts:      deps.Conflicts,
		Append:         appendPayload,
		PublishChanged: publishChanged,
		Now:            now,
	}
}
