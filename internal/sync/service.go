package sync

import (
	"context"
	"encoding/json"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

type TriggerService struct {
	bus   events.Bus
	store changelogLookup
	log   sharedlogger.Logger
}

type changelogLookup interface {
	ListSinceTimestamp(ctx context.Context, sinceMs int64) ([]ChangelogEntry, error)
	ListAfterID(ctx context.Context, lastID int64) ([]ChangelogEntry, error)
	LastID(ctx context.Context) (int64, error)
	LastChangedAt(ctx context.Context) (*int64, error)
}

func NewTriggerService(bus events.Bus, store changelogLookup, loggers ...sharedlogger.Logger) *TriggerService {
	service := &TriggerService{bus: bus, store: store}
	if len(loggers) > 0 {
		service.log = loggers[0]
	}
	return service
}

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

func maxDurationMs(duration time.Duration) int64 {
	if duration.Milliseconds() <= 0 {
		return 1
	}
	return duration.Milliseconds()
}

func (s *TriggerService) ListChangesSince(ctx context.Context, sinceMs int64) ([]contracts.AnimeChange, int64, error) {
	if s.store == nil {
		return []contracts.AnimeChange{}, 0, nil
	}
	entries, err := s.store.ListSinceTimestamp(ctx, sinceMs)
	if err != nil {
		return nil, 0, err
	}
	lastID, err := s.store.LastID(ctx)
	if err != nil {
		return nil, 0, err
	}
	changes, _, err := toAnimeChanges(entries)
	if err != nil {
		return nil, 0, err
	}
	return changes, lastID, nil
}

func (s *TriggerService) ListChangesAfterID(ctx context.Context, lastID int64) ([]contracts.AnimeChange, int64, error) {
	if s.store == nil {
		return []contracts.AnimeChange{}, 0, nil
	}
	entries, err := s.store.ListAfterID(ctx, lastID)
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

func (s *TriggerService) LastChangedAt(ctx context.Context) (*int64, error) {
	if s.store == nil {
		return nil, nil
	}
	return s.store.LastChangedAt(ctx)
}

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
