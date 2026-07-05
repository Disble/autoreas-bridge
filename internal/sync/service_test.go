package sync

import (
	"context"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

func TestTriggerServicePublishesSyncRequestedEvent(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	logger := &recordingSyncLogger{}
	published := make(chan events.SyncRequestedEvent, 1)
	bus.Subscribe(events.EventNameSyncRequested, func(event events.Event) {
		syncRequested, ok := event.(events.SyncRequestedEvent)
		if ok {
			published <- syncRequested
		}
	})

	service := NewTriggerService(bus, nil, logger)
	if err := service.TriggerReconcile(context.Background()); err != nil {
		t.Fatalf("trigger reconcile: %v", err)
	}

	select {
	case event := <-published:
		if event.Requester == "" {
			t.Fatal("expected requester to be stamped")
		}
	default:
		t.Fatal("expected SyncRequestedEvent to be published")
	}

	entries := logger.entries()
	if len(entries) != 1 || entries[0].Domain != "sync" || entries[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected sync info log, got %#v", entries)
	}

	reconcileEntry := entries[0]
	if reconcileEntry.EventType != "sync.reconcile" {
		t.Fatalf("expected EventType 'sync.reconcile', got %q", reconcileEntry.EventType)
	}
	if reconcileEntry.DurationMs <= 0 {
		t.Fatalf("expected DurationMs > 0, got %d", reconcileEntry.DurationMs)
	}
}

func TestTriggerServiceListPendingAnimeSyncsFiltersInactiveAnimes(t *testing.T) {
	t.Parallel()

	service := NewTriggerService(events.NewBus(), stubPendingLookup{
		pending: []ChangelogEntry{
			{
				ID:            2,
				AnimeID:       "anime-active",
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"nrocapvisto"},
				SnapshotJSON:  []byte(`{"_id":"anime-active","nombre":"Active Anime","nrocapvisto":5,"activo":true}`),
				ChangedAtMs:   200,
			},
			{
				ID:            1,
				AnimeID:       "anime-inactive",
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"activo"},
				SnapshotJSON:  []byte(`{"_id":"anime-inactive","nombre":"Inactive Anime","nrocapvisto":3,"activo":false}`),
				ChangedAtMs:   100,
			},
		},
	})

	got, err := service.ListPendingAnimeSyncs(context.Background())
	if err != nil {
		t.Fatalf("list pending anime syncs: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 active anime sync item, got %d", len(got))
	}

	if got[0].AnimeID != "anime-active" {
		t.Fatalf("expected only active anime, got %#v", got[0])
	}
}

func TestTriggerServiceAcknowledgeDeviceUpdatesCheckpointAndPrunes(t *testing.T) {
	t.Parallel()

	store := &recordingAckStore{}
	service := NewTriggerService(events.NewBus(), store)

	if err := service.AcknowledgeDevice(context.Background(), "device-1", 42); err != nil {
		t.Fatalf("acknowledge device: %v", err)
	}

	if store.deviceID != "device-1" || store.lastAck != 42 {
		t.Fatalf("expected ack for device-1 at 42, got device=%q ack=%d", store.deviceID, store.lastAck)
	}
	if !store.pruned {
		t.Fatal("expected acknowledged changelog pruning to run")
	}
	if store.lastSeenAtMs <= 0 {
		t.Fatalf("expected last seen timestamp to be stamped, got %d", store.lastSeenAtMs)
	}
}

type recordingAckStore struct {
	stubPendingLookup
	deviceID     string
	lastAck      int64
	lastSeenAtMs int64
	pruned       bool
}

func (s *recordingAckStore) AcknowledgeDevice(_ context.Context, deviceID string, lastAckChangelogID int64, lastSeenAtMs int64) error {
	s.deviceID = deviceID
	s.lastAck = lastAckChangelogID
	s.lastSeenAtMs = lastSeenAtMs
	return nil
}

func (s *recordingAckStore) PruneAcknowledgedChangelog(context.Context) (int64, error) {
	s.pruned = true
	return 0, nil
}

func TestTriggerServiceListsPendingAnimeSyncsCollapsedByAnime(t *testing.T) {
	t.Parallel()

	service := NewTriggerService(events.NewBus(), stubPendingLookup{
		pending: []ChangelogEntry{
			{
				ID:            3,
				AnimeID:       "anime-1",
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"nrocapvisto", "estado"},
				SnapshotJSON:  []byte(`{"_id":"anime-1","nombre":"Dungeon Meshi","nrocapvisto":18,"totalcap":24,"activo":true}`),
				ChangedAtMs:   300,
			},
			{
				ID:            2,
				AnimeID:       "anime-1",
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"nrocapvisto"},
				SnapshotJSON:  []byte(`{"_id":"anime-1","nombre":"Dungeon Meshi","nrocapvisto":17,"totalcap":24,"activo":true}`),
				ChangedAtMs:   200,
			},
			{
				ID:            1,
				AnimeID:       "anime-2",
				ChangeType:    ChangelogTypeDelete,
				ChangedFields: []string{"activo"},
				SnapshotJSON:  nil,
				ChangedAtMs:   100,
			},
		},
	})

	got, err := service.ListPendingAnimeSyncs(context.Background())
	if err != nil {
		t.Fatalf("list pending anime syncs: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected 2 anime sync items, got %d", len(got))
	}

	first := got[0]
	if first.AnimeID != "anime-1" {
		t.Fatalf("expected first anime to be anime-1, got %#v", first)
	}
	if first.Title != "Dungeon Meshi" {
		t.Fatalf("expected title to come from latest snapshot, got %#v", first)
	}
	if first.PendingChanges != 2 {
		t.Fatalf("expected pending count 2, got %#v", first)
	}
	if first.ProgressCurrent == nil || *first.ProgressCurrent != 18 {
		t.Fatalf("expected progress current 18, got %#v", first.ProgressCurrent)
	}
	if first.ProgressTotal == nil || *first.ProgressTotal != 24 {
		t.Fatalf("expected progress total 24, got %#v", first.ProgressTotal)
	}

	second := got[1]
	if second.AnimeID != "anime-2" {
		t.Fatalf("expected second anime to be anime-2, got %#v", second)
	}
	if second.Title != "anime-2" {
		t.Fatalf("expected sparse snapshot to fall back to anime id, got %#v", second)
	}
}

type stubPendingLookup struct {
	pending []ChangelogEntry
}

func (s stubPendingLookup) ListSinceTimestamp(context.Context, int64) ([]ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListAfterID(context.Context, int64) ([]ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListPending(context.Context) ([]ChangelogEntry, error) {
	return append([]ChangelogEntry(nil), s.pending...), nil
}

func (s stubPendingLookup) LastID(context.Context) (int64, error) {
	return 0, nil
}

func (s stubPendingLookup) LastChangedAt(context.Context) (*int64, error) {
	return nil, nil
}

func (s stubPendingLookup) AcknowledgeDevice(context.Context, string, int64, int64) error {
	return nil
}

func (s stubPendingLookup) PruneAcknowledgedChangelog(context.Context) (int64, error) {
	return 0, nil
}

var _ interface {
	ListSinceTimestamp(context.Context, int64) ([]ChangelogEntry, error)
	ListAfterID(context.Context, int64) ([]ChangelogEntry, error)
	ListPending(context.Context) ([]ChangelogEntry, error)
	LastID(context.Context) (int64, error)
	LastChangedAt(context.Context) (*int64, error)
	AcknowledgeDevice(context.Context, string, int64, int64) error
	PruneAcknowledgedChangelog(context.Context) (int64, error)
} = stubPendingLookup{}

var _ = contracts.SyncingAnimeItem{}

type recordingSyncLogger struct {
	entriesList []sharedlogger.LogEntry
}

func (l *recordingSyncLogger) Debugf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelDebug})
}

func (l *recordingSyncLogger) Infof(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelInfo, Message: "reconcile requested"})
}

func (l *recordingSyncLogger) Warnf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelWarn})
}

func (l *recordingSyncLogger) Errorf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelError})
}

func (l *recordingSyncLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{
		Domain:        domain,
		Level:         level,
		CorrelationID: fields.CorrelationID,
		EntityID:      fields.EntityID,
		EventType:     fields.EventType,
		DurationMs:    fields.DurationMs,
		Metadata:      fields.Metadata,
	})
}

func (l *recordingSyncLogger) entries() []sharedlogger.LogEntry {
	out := make([]sharedlogger.LogEntry, len(l.entriesList))
	copy(out, l.entriesList)
	return out
}
