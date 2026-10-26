package anime

import (
	"context"
	"time"

	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/logger"
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
		PublishChanged: logRecordedChangelog(deps.Logger, publishChanged),
		Now:            now,
	}
}

// logRecordedChangelog writes the sync.changelog log row of each committed
// change before publishing it. The save stored that changelog row inside its
// transaction; Activity reads this log row as a step of the change.
func logRecordedChangelog(log logger.Logger, publish func(store.CommittedChange)) func(store.CommittedChange) {
	if log == nil {
		return publish
	}
	return func(event store.CommittedChange) {
		log.Logf("sync", logger.LevelInfo, logger.Fields{
			EntityID:      event.AnimeID,
			EventType:     "sync.changelog",
			CorrelationID: event.EventID,
			Metadata: map[string]any{
				"sourceEventId": event.EventID,
				"changeType":    event.ChangeType,
				"changedFields": event.ChangedFields,
			},
		}, "recorded pending changelog for %s", event.AnimeID)
		if publish != nil {
			publish(event)
		}
	}
}
