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
		latest := latestChangelogEntry(group)
		item := contracts.SyncingAnimeItem{
			AnimeID:         animeID,
			Title:           animeID,
			ChangeType:      latest.ChangeType,
			PendingChanges:  len(group),
			ChangedFields:   append([]string(nil), latest.ChangedFields...),
			LastChangedAtMs: latest.ChangedAtMs,
		}

		if len(latest.SnapshotJSON) > 0 {
			snapshot, snapshotErr := animeSnapshotToContract(latest.SnapshotJSON)
			if snapshotErr == nil && snapshot != nil {
				if snapshot.Activo == 0 {
					continue
				}
				item.Activo = snapshot.Activo
				if snapshot.Nombre != "" {
					item.Title = snapshot.Nombre
				}
				progressCurrent := snapshot.NroCapVisto
				item.ProgressCurrent = &progressCurrent
				if snapshot.TotalCap != nil {
					progressTotal := *snapshot.TotalCap
					item.ProgressTotal = &progressTotal
				}
			}
		}

		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].AnimeID < items[j].AnimeID
	})

	return items, nil
}

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
