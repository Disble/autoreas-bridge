package sync

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// TriggerService exposes sync reconciliation and changelog read models to delivery layers.
type TriggerService struct {
	bus   events.Bus
	store changelogLookup
	log   sharedlogger.Logger
}

type changelogLookup interface {
	ListSinceTimestamp(ctx context.Context, sinceMs int64) ([]ChangelogEntry, error)
	ListAfterID(ctx context.Context, lastID int64) ([]ChangelogEntry, error)
	ListPending(ctx context.Context) ([]ChangelogEntry, error)
	LastID(ctx context.Context) (int64, error)
	LastChangedAt(ctx context.Context) (*int64, error)
	AcknowledgeDevice(ctx context.Context, deviceID string, lastAckChangelogID int64, lastSeenAtMs int64) error
	PruneAcknowledgedChangelog(ctx context.Context) (int64, error)
}

// NewTriggerService builds the sync trigger service.
func NewTriggerService(bus events.Bus, store changelogLookup, loggers ...sharedlogger.Logger) *TriggerService {
	service := &TriggerService{bus: bus, store: store}
	if len(loggers) > 0 {
		service.log = loggers[0]
	}
	return service
}

// TriggerReconcile publishes a sync-requested event for the rest of the bridge.
func (s *TriggerService) TriggerReconcile(context.Context) error {
	start := time.Now()
	if s.log != nil {
		s.log.Logf("sync", sharedlogger.LevelInfo, sharedlogger.Fields{
			EventType:  "sync.reconcile",
			DurationMs: maxDurationMs(time.Since(start)),
		}, "triggered reconcile request")
	}
	s.bus.Publish(events.SyncRequestedEvent{Requester: "rest-api"})
	return nil
}

// maxDurationMs converts a duration to a positive millisecond value.
func maxDurationMs(duration time.Duration) int64 {
	if duration.Milliseconds() <= 0 {
		return 1
	}
	return duration.Milliseconds()
}

// ListChangesSince returns sync changes newer than the given timestamp.
func (s *TriggerService) ListChangesSince(ctx context.Context, sinceMs int64) ([]contracts.AnimeChange, int64, error) {
	return s.listChanges(ctx, func(ctx context.Context) ([]ChangelogEntry, error) {
		return s.store.ListSinceTimestamp(ctx, sinceMs)
	})
}

// ListChangesAfterID returns sync changes whose changelog id is greater than lastID.
func (s *TriggerService) ListChangesAfterID(ctx context.Context, lastID int64) ([]contracts.AnimeChange, int64, error) {
	return s.listChanges(ctx, func(ctx context.Context) ([]ChangelogEntry, error) {
		return s.store.ListAfterID(ctx, lastID)
	})
}

// listChanges loads changelog entries and converts them to API changes.
func (s *TriggerService) listChanges(ctx context.Context, list func(context.Context) ([]ChangelogEntry, error)) ([]contracts.AnimeChange, int64, error) {
	if s.store == nil {
		return []contracts.AnimeChange{}, 0, nil
	}
	entries, err := list(ctx)
	if err != nil {
		return nil, 0, err
	}
	newLastID, err := s.store.LastID(ctx)
	if err != nil {
		return nil, 0, err
	}
	changes, _, err := toAnimeChanges(entries)
	if err != nil {
		return nil, 0, err
	}
	return changes, newLastID, nil
}

// AcknowledgeDevice records that a device has processed changelog rows through lastChangelogID.
func (s *TriggerService) AcknowledgeDevice(ctx context.Context, deviceID string, lastChangelogID int64) error {
	if s.store == nil {
		return nil
	}
	if err := s.store.AcknowledgeDevice(ctx, deviceID, lastChangelogID, time.Now().UnixMilli()); err != nil {
		return err
	}
	_, err := s.store.PruneAcknowledgedChangelog(ctx)
	return err
}

// LastChangedAt returns the newest persisted changelog timestamp.
func (s *TriggerService) LastChangedAt(ctx context.Context) (*int64, error) {
	if s.store == nil {
		return nil, nil
	}
	return s.store.LastChangedAt(ctx)
}

// ListPendingAnimeSyncs returns the pending anime summary shown in the syncing panel.
func (s *TriggerService) ListPendingAnimeSyncs(ctx context.Context) ([]contracts.SyncingAnimeItem, error) {
	if s.store == nil {
		return []contracts.SyncingAnimeItem{}, nil
	}

	entries, err := s.store.ListPending(ctx)
	if err != nil {
		return nil, err
	}

	groups := make(map[string][]ChangelogEntry, len(entries))
	for _, entry := range entries {
		groups[entry.AnimeID] = append(groups[entry.AnimeID], entry)
	}

	items := make([]contracts.SyncingAnimeItem, 0, len(groups))
	for animeID, group := range groups {
		item, include := pendingSyncItem(animeID, group)
		if include {
			items = append(items, item)
		}
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].AnimeID < items[j].AnimeID
	})

	return items, nil
}

// pendingSyncItem builds the pending sync summary for one anime.
func pendingSyncItem(animeID string, group []ChangelogEntry) (contracts.SyncingAnimeItem, bool) {
	latest := latestChangelogEntry(group)
	item := contracts.SyncingAnimeItem{AnimeID: animeID, Title: animeID, ChangeType: latest.ChangeType, PendingChanges: len(group), ChangedFields: append([]string(nil), latest.ChangedFields...), LastChangedAtMs: latest.ChangedAtMs}
	return applyPendingSnapshot(item, latest.SnapshotJSON)
}

// applyPendingSnapshot enriches a sync item from its latest snapshot payload.
func applyPendingSnapshot(item contracts.SyncingAnimeItem, payload []byte) (contracts.SyncingAnimeItem, bool) {
	if len(payload) == 0 {
		return item, true
	}
	snapshot, err := animeSnapshotToContract(payload)
	if err != nil || snapshot == nil {
		return item, true
	}
	if snapshot.Active == 0 {
		return contracts.SyncingAnimeItem{}, false
	}
	item.Active = snapshot.Active
	if snapshot.Name != "" {
		item.Title = snapshot.Name
	}
	progressCurrent := snapshot.EpisodesWatched
	item.ProgressCurrent = &progressCurrent
	if snapshot.TotalEpisodes != nil {
		progressTotal := *snapshot.TotalEpisodes
		item.ProgressTotal = &progressTotal
	}
	return item, true
}

// latestChangelogEntry returns the newest entry by change timestamp.
func latestChangelogEntry(entries []ChangelogEntry) ChangelogEntry {
	if len(entries) == 0 {
		return ChangelogEntry{}
	}
	latest := entries[0]
	for _, entry := range entries[1:] {
		if entry.ChangedAtMs > latest.ChangedAtMs {
			latest = entry
		}
	}
	return latest
}

// toAnimeChanges converts stored changelog entries into API changes.
func toAnimeChanges(entries []ChangelogEntry) ([]contracts.AnimeChange, int64, error) {
	changes := make([]contracts.AnimeChange, 0, len(entries))
	var lastID int64
	for _, entry := range entries {
		lastID = entry.ID
		change := contracts.AnimeChange{
			ID:            entry.ID,
			RecordID:      entry.AnimeID,
			ChangeType:    entry.ChangeType,
			ChangedFields: append([]string(nil), entry.ChangedFields...),
			Timestamp:     entry.ChangedAtMs,
		}
		if len(entry.SnapshotJSON) > 0 {
			snapshot, err := animeSnapshotToContract(entry.SnapshotJSON)
			if err != nil {
				continue
			}
			change.Snapshot = snapshot
		}
		changes = append(changes, change)
	}
	return changes, lastID, nil
}

// animeSnapshotToContract decodes a snapshot using current and legacy formats.
func animeSnapshotToContract(payload []byte) (*contracts.MobileAnime, error) {
	var snapshot contracts.MobileAnime
	if err := json.Unmarshal(payload, &snapshot); err == nil && snapshot.ID != "" {
		return &snapshot, nil
	}
	parsed, err := anime.MobileAnimeFromSnapshotForSync(payload)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

var _ contracts.SyncTriggerService = (*TriggerService)(nil)
