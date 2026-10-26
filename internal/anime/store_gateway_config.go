package anime

import (
	"context"
	"time"

	"autoreas-bridge/internal/anime/store"
)

// newStoreGatewayConfig wires all adapter dependencies into a store.GatewayConfig
// for the SQLite-native persistence gateway. Every save runs through the save
// store: deps.Saves when set, otherwise the one the snapshot lookup provides.
func newStoreGatewayConfig(
	lookup snapshotLookup,
	deps WriteServiceDeps,
	now func() time.Time,
	publishChanged func(event store.CommittedChange),
) store.GatewayConfig {
	saves := deps.Saves
	if provider, ok := lookup.(saveStoreProvider); ok && saves == nil {
		saves = provider.SaveStore()
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
		Saves:          saves,
		Rule:           deps.SaveRule,
		Conflicts:      deps.Conflicts,
		PublishChanged: publishChanged,
		Now:            now,
	}
}
