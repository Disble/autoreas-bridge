package legacy_test

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
)

type countingEventPublisher struct {
	count  atomic.Int32
	events chan struct{}
}

// newCountingEventPublisher creates an event publisher that counts anime changes.
func newCountingEventPublisher() *countingEventPublisher {
	return &countingEventPublisher{events: make(chan struct{}, 32)}
}

func (p *countingEventPublisher) Publish(event events.Event) {
	if _, ok := event.(events.AnimeChangedEvent); ok {
		p.count.Add(1)
		select {
		case p.events <- struct{}{}:
		default:
		}
	}
}

// waitForCount waits until the publisher reaches the requested event count.
func (p *countingEventPublisher) waitForCount(t *testing.T, want int32, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if p.count.Load() >= want {
			return
		}
		select {
		case <-p.events:
		case <-time.After(10 * time.Millisecond):
		}
	}
	if got := p.count.Load(); got < want {
		t.Fatalf("expected at least %d published events before timeout, got %d", want, got)
	}
}

// assertNoNewEvents verifies that no additional events are published.
func (p *countingEventPublisher) assertNoNewEvents(t *testing.T, timeout time.Duration) {
	t.Helper()
	baseline := p.count.Load()
	select {
	case <-p.events:
		t.Fatalf("expected no watcher publications while replacement was in flight, count advanced from %d to %d", baseline, p.count.Load())
	case <-time.After(timeout):
	}
	if got := p.count.Load(); got != baseline {
		t.Fatalf("expected published event count to stay at %d, got %d", baseline, got)
	}
}

// reset clears the publisher count and pending event notifications.
func (p *countingEventPublisher) reset() {
	p.count.Store(0)
	for {
		select {
		case <-p.events:
		default:
			return
		}
	}
}

// appendAndWaitForWatcher appends data until the watcher reports readiness.
func appendAndWaitForWatcher(t *testing.T, publisher *countingEventPublisher, path string, payload []byte) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if err := appendGatewayLine(path, payload); err != nil {
			t.Fatalf("append watcher readiness payload: %v", err)
		}
		if publisher.count.Load() > 0 {
			return
		}
		select {
		case <-publisher.events:
			return
		case <-time.After(100 * time.Millisecond):
		}
	}
	publisher.waitForCount(t, 1, 100*time.Millisecond)
}

// seedBatchFixture creates the file and snapshots used by batch tests.
func seedBatchFixture(t *testing.T, db *sql.DB) (string, []legacy.BatchOperation) {
	t.Helper()
	baseA := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-a", 1))
	baseB := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-b", 1))
	desiredA := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-a", 2))
	desiredB := canonicalGatewayPayload(t, gatewayAnimeJSON("anime-b", 2))
	snapshots := bridgeSync.NewAnimeSnapshotStore(db)
	if err := snapshots.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		"anime-a": {AnimeID: "anime-a", CanonicalJSON: baseA, Hash: anime.HashSnapshot(baseA), ModifiedAt: 100},
		"anime-b": {AnimeID: "anime-b", CanonicalJSON: baseB, Hash: anime.HashSnapshot(baseB), ModifiedAt: 100},
	}, nil); err != nil {
		t.Fatalf("seed batch snapshots: %v", err)
	}
	path := writeGatewayData(t, baseA)
	if err := appendGatewayLine(path, baseB); err != nil {
		t.Fatalf("append second batch base: %v", err)
	}
	return path, []legacy.BatchOperation{
		{AnimeID: "anime-a", Base: legacy.Snapshot{AnimeID: "anime-a", CanonicalJSON: baseA, Hash: anime.HashSnapshot(baseA), ModifiedAt: 100}, Desired: desiredA},
		{AnimeID: "anime-b", Base: legacy.Snapshot{AnimeID: "anime-b", CanonicalJSON: baseB, Hash: anime.HashSnapshot(baseB), ModifiedAt: 100}, Desired: desiredB},
	}
}

// assertBatchDesired verifies that both batch records have desired progress.
func assertBatchDesired(t *testing.T, path string) {
	t.Helper()
	for _, id := range []string{"anime-a", "anime-b"} {
		payload := effectivePayload(t, path, id)
		if payload == nil || !jsonContainsProgress(t, payload, 2) {
			t.Fatalf("expected desired effective state for %s, got %s", id, payload)
		}
	}
}

// assertBatchCommittedTogether verifies the expected committed batch rows.
func assertBatchCommittedTogether(t *testing.T, db *sql.DB, want int) {
	t.Helper()
	var committed int
	if err := db.QueryRow(`SELECT COUNT(*) FROM anime_write_operations WHERE status = 'committed'`).Scan(&committed); err != nil {
		t.Fatalf("count committed operations: %v", err)
	}
	if committed != want {
		t.Fatalf("expected %d committed batch rows, got %d", want, committed)
	}
}

// effectivePayload returns the latest matching payload from a legacy data file.
func effectivePayload(t *testing.T, path, animeID string) []byte {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open effective file: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := file.Close(); closeErr != nil {
			t.Errorf("close effective file: %v", closeErr)
		}
	})
	var effective []byte
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := append([]byte(nil), scanner.Bytes()...)
		var envelope struct {
			ID string `json:"_id"`
		}
		if json.Unmarshal(line, &envelope) == nil && envelope.ID == animeID {
			effective = line
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan effective file: %v", err)
	}
	return effective
}

type failBatchFinalizeOnceStore struct {
	legacy.WriteBaseStore
	once sync.Once
}

type failStageBatchReplaceOnceStore struct {
	legacy.WriteBaseStore
	failErr error
}

func (s *failStageBatchReplaceOnceStore) StageBatchReplacement(_ context.Context, _ legacy.BatchReplacementJournal) error {
	return s.failErr
}

func (s *failBatchFinalizeOnceStore) FinalizeBatch(ctx context.Context, batchID string, committedAtMs int64) error {
	failed := false
	s.once.Do(func() { failed = true })
	if failed {
		return errors.New("injected batch finalize failure")
	}
	return s.WriteBaseStore.FinalizeBatch(ctx, batchID, committedAtMs)
}
