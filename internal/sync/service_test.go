package sync

import (
	"context"
	"errors"
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
				SnapshotJSON:  []byte(`{"id":"anime-active","name":"Active Anime","episodesWatched":5,"active":true}`),
				ChangedAtMs:   200,
			},
			{
				ID:            1,
				AnimeID:       "anime-inactive",
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"activo"},
				SnapshotJSON:  []byte(`{"id":"anime-inactive","name":"Inactive Anime","episodesWatched":3,"active":false}`),
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

func (s *recordingAckStore) AcknowledgeDevice(_ context.Context, deviceID string, lastAckChangelogID, lastSeenAtMs int64) error {
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
				SnapshotJSON:  []byte(`{"id":"anime-1","name":"Dungeon Meshi","episodesWatched":18,"totalEpisodes":24,"active":true}`),
				ChangedAtMs:   300,
			},
			{
				ID:            2,
				AnimeID:       "anime-1",
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"nrocapvisto"},
				SnapshotJSON:  []byte(`{"id":"anime-1","name":"Dungeon Meshi","episodesWatched":17,"totalEpisodes":24,"active":true}`),
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

	assertPendingAnimeSyncItems(t, got)
}

// assertPendingAnimeSyncItems verifies the ordered pending sync summaries.
func assertPendingAnimeSyncItems(t *testing.T, got []contracts.SyncingAnimeItem) {
	t.Helper()
	first, second := got[0], got[1]
	if first.AnimeID != "anime-1" || first.Title != "Dungeon Meshi" || first.PendingChanges != 2 || first.ProgressCurrent == nil || *first.ProgressCurrent != 18 || first.ProgressTotal == nil || *first.ProgressTotal != 24 || second.AnimeID != "anime-2" || second.Title != "anime-2" {
		t.Fatalf("unexpected pending sync items: %#v", got)
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

// entries returns a copy of the recorded sync log entries.
func (l *recordingSyncLogger) entries() []sharedlogger.LogEntry {
	out := make([]sharedlogger.LogEntry, len(l.entriesList))
	copy(out, l.entriesList)
	return out
}

// prunedChangelogLookup reproduces the state PruneAcknowledgedChangelog leaves
// behind: once every device has acknowledged, the rows are deleted, so
// `SELECT MAX(id) FROM changelog` is NULL and LastID reports 0 even though the
// devices legitimately hold a much higher cursor.
type prunedChangelogLookup struct {
	stubPendingLookup
	lastID  int64
	entries []ChangelogEntry
}

func (s prunedChangelogLookup) LastID(context.Context) (int64, error) {
	return s.lastID, nil
}

func (s prunedChangelogLookup) ListAfterID(context.Context, int64) ([]ChangelogEntry, error) {
	return append([]ChangelogEntry(nil), s.entries...), nil
}

func TestListChangesAfterIDKeepsTheDeviceCursorWhenTheChangelogWasPruned(t *testing.T) {
	t.Parallel()

	service := NewTriggerService(events.NewBus(), prunedChangelogLookup{lastID: 0})

	changes, lastID, err := service.ListChangesAfterID(context.Background(), 2249)
	if err != nil {
		t.Fatalf("list changes after id: %v", err)
	}
	if len(changes) != 0 {
		t.Fatalf("expected no changes from an emptied changelog, got %#v", changes)
	}
	if lastID != 2249 {
		t.Fatalf("expected the device cursor 2249 to survive an emptied changelog, got %d", lastID)
	}
}

// TestListChangesAfterIDNeverReportsACursorBehindTheRequest pins the general
// property rather than only the pruned-to-zero case: any stored maximum below
// the caller's cursor would rewind a client that trusts the response.
func TestListChangesAfterIDNeverReportsACursorBehindTheRequest(t *testing.T) {
	t.Parallel()

	service := NewTriggerService(events.NewBus(), prunedChangelogLookup{lastID: 7})

	_, lastID, err := service.ListChangesAfterID(context.Background(), 2249)
	if err != nil {
		t.Fatalf("list changes after id: %v", err)
	}
	if lastID != 2249 {
		t.Fatalf("expected a stale maximum to be clamped to 2249, got %d", lastID)
	}
}

func TestListChangesAfterIDStillReportsAnAdvancedCursor(t *testing.T) {
	t.Parallel()

	service := NewTriggerService(events.NewBus(), prunedChangelogLookup{
		lastID: 2254,
		entries: []ChangelogEntry{{
			ID:            2250,
			AnimeID:       "anime-1",
			ChangeType:    ChangelogTypeUpdate,
			ChangedFields: []string{"episodesWatched"},
			ChangedAtMs:   10,
		}},
	})

	changes, lastID, err := service.ListChangesAfterID(context.Background(), 2249)
	if err != nil {
		t.Fatalf("list changes after id: %v", err)
	}
	if len(changes) != 1 {
		t.Fatalf("expected the pending change to be returned, got %#v", changes)
	}
	if lastID != 2254 {
		t.Fatalf("expected the advanced cursor 2254, got %d", lastID)
	}
}

// failingChangelogLookup fails the changelog read so the error path of
// ListChangesAfterID is exercised.
type failingChangelogLookup struct {
	stubPendingLookup
}

func (s failingChangelogLookup) ListAfterID(context.Context, int64) ([]ChangelogEntry, error) {
	return nil, errors.New("changelog unavailable")
}

// TestListChangesAfterIDReportsNoCursorWhenTheLookupFails pins the failure
// contract alongside the clamp: on error the cursor must be the zero value and
// NOT the caller's position, because a non-zero cursor returned beside an error
// is exactly the shape a careless caller would persist as progress it never
// made.
func TestListChangesAfterIDReportsNoCursorWhenTheLookupFails(t *testing.T) {
	t.Parallel()

	service := NewTriggerService(events.NewBus(), failingChangelogLookup{})

	changes, lastID, err := service.ListChangesAfterID(context.Background(), 2249)
	if err == nil {
		t.Fatal("expected the changelog failure to propagate")
	}
	if changes != nil {
		t.Fatalf("expected no changes alongside a failure, got %#v", changes)
	}
	if lastID != 0 {
		t.Fatalf("expected a zero cursor alongside a failure, got %d", lastID)
	}
}
