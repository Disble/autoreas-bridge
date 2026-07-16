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

func TestBatchReplacementSerializesConcurrentOrdinaryAppend(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	paused := make(chan struct{})
	release := make(chan struct{})
	gateway := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 200, operationID: "batch-serialize",
		replaceCheckpoint: func(phase legacy.BatchReplacementPhase) error {
			if phase == legacy.BatchReplacementPhaseTempDurable {
				close(paused)
				<-release
			}
			return nil
		},
	})

	batchResult := make(chan error, 1)
	go func() { _, err := gateway.ApplyBatch(ctx, operations); batchResult <- err }()
	<-paused

	writerCtx, cancel := context.WithCancel(ctx)
	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{FilePath: path, Bus: events.NewBus()})
	writer.StartAsync(writerCtx)
	ordinary := gatewayAnimeJSON("anime-ordinary", 7)
	appendResult := make(chan error, 1)
	go func() { appendResult <- writer.RequestWrite(ctx, "anime-ordinary", ordinary) }()
	select {
	case err := <-appendResult:
		t.Fatalf("ordinary append escaped the replacement coordinator: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := <-batchResult; err != nil {
		t.Fatalf("apply batch: %v", err)
	}
	if err := <-appendResult; err != nil {
		t.Fatalf("ordinary append: %v", err)
	}
	cancel()
	writer.Wait()
	if payload := effectivePayload(t, path, "anime-ordinary"); payload == nil {
		t.Fatal("concurrent ordinary append was lost")
	}
}

func TestBatchReplacementRecoversCanonicalAfterBackupMove(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	injected := errors.New("crash after backup move")
	gateway := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 200, operationID: "batch-backup",
		replaceCheckpoint: func(phase legacy.BatchReplacementPhase) error {
			if phase == legacy.BatchReplacementPhaseBackupMoved {
				return injected
			}
			return nil
		},
	})
	if _, err := gateway.ApplyBatch(ctx, operations); !errors.Is(err, injected) {
		t.Fatalf("expected injected replacement interruption, got %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected canonical missing at crash checkpoint, got %v", err)
	}

	restarted := newGateway(t, gatewayConfig{db: db, path: path, clock: 201, operationID: "unused"})
	if err := restarted.Recover(ctx); err != nil {
		t.Fatalf("recover backup-moved batch: %v", err)
	}
	assertBatchDesired(t, path)
	assertBatchCommittedTogether(t, db, 2)
}

func TestBatchReplacementRecoveryHandlesStagedTempAndRestorationCheckpoints(t *testing.T) {
	for _, tt := range []struct {
		name        string
		phase       legacy.BatchReplacementPhase
		corruptTemp bool
	}{
		{name: "staged before file mutation", phase: legacy.BatchReplacementPhaseStaged},
		{name: "temp durable with canonical present", phase: legacy.BatchReplacementPhaseTempDurable},
		{name: "backup moved with unusable temp restores then retries", phase: legacy.BatchReplacementPhaseBackupMoved, corruptTemp: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			db := openGatewayDB(t)
			path, operations := seedBatchFixture(t, db)
			interrupted := errors.New("injected checkpoint interruption")
			first := newGateway(t, gatewayConfig{
				db: db, path: path, clock: 200, operationID: "batch-checkpoint",
				replaceCheckpoint: func(phase legacy.BatchReplacementPhase) error {
					if phase != tt.phase {
						return nil
					}
					if tt.corruptTemp {
						journal, err := bridgeSync.NewWriteBaseStore(db).GetBatchReplacement(ctx, "batch-checkpoint")
						if err != nil {
							return err
						}
						if err := os.WriteFile(journal.TempPath, []byte("corrupt"), 0o600); err != nil {
							return err
						}
					}
					return interrupted
				},
			})
			if _, err := first.ApplyBatch(ctx, operations); !errors.Is(err, interrupted) {
				t.Fatalf("expected checkpoint interruption, got %v", err)
			}
			if err := newGateway(t, gatewayConfig{db: db, path: path, clock: 201}).Recover(ctx); err != nil {
				t.Fatalf("recover checkpoint: %v", err)
			}
			assertBatchDesired(t, path)
			assertBatchCommittedTogether(t, db, 2)
		})
	}
}

func TestBatchReplacementRevalidatesGenerationBeforePromotion(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	ordinary := gatewayAnimeJSON("anime-external", 9)
	var attempts atomic.Int32
	gateway := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 200, operationID: "batch-generation",
		replaceCheckpoint: func(phase legacy.BatchReplacementPhase) error {
			if phase == legacy.BatchReplacementPhaseTempDurable && attempts.Add(1) == 1 {
				return appendGatewayLine(path, ordinary)
			}
			return nil
		},
	})
	if _, err := gateway.ApplyBatch(ctx, operations); err != nil {
		t.Fatalf("retry generation-changed batch: %v", err)
	}
	if attempts.Load() != 2 {
		t.Fatalf("expected one safe generation retry, got %d attempts", attempts.Load())
	}
	if payload := effectivePayload(t, path, "anime-external"); payload == nil {
		t.Fatal("generation retry discarded concurrent external append")
	}
}

func TestBatchReplacementPromotedBeforeFinalizeRecoversWholeBatch(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	store := bridgeSync.NewWriteBaseStore(db)
	failing := &failBatchFinalizeOnceStore{WriteBaseStore: store}
	published := make([]string, 0, 2)
	first := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 200, operationID: "batch-promoted", operations: failing,
		publishEvent: func(eventID, _ string, _ []byte) { published = append(published, eventID) },
	})
	if _, err := first.ApplyBatch(ctx, operations); err == nil {
		t.Fatal("expected injected finalize failure")
	}
	if len(published) != 0 {
		t.Fatalf("published before batch finalize: %#v", published)
	}
	assertBatchDesired(t, path)

	restarted := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 201, operationID: "unused", operations: store,
		publishEvent: func(eventID, _ string, _ []byte) { published = append(published, eventID) },
	})
	if err := restarted.Recover(ctx); err != nil {
		t.Fatalf("recover promoted batch: %v", err)
	}
	if err := restarted.DrainOutbox(ctx); err != nil {
		t.Fatalf("drain recovered batch outbox: %v", err)
	}
	if len(published) != 2 {
		t.Fatalf("expected one publication per anime after finalize, got %#v", published)
	}
	assertBatchCommittedTogether(t, db, 2)
}

func TestBatchReplacementWatcherPublishesOnlyFinalizedOutboxEvents(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	registry := anime.NewSelfEchoRegistry()
	publisher := &countingEventPublisher{}
	watcher := anime.NewRuntimeWatcher(anime.RuntimeWatcherConfig{
		FilePath: path, Parser: anime.NewSnapshotParser(), Store: bridgeSync.NewAnimeSnapshotStore(db),
		Publisher: publisher, SelfEchoRegistry: registry, DebounceWindow: 10 * time.Millisecond,
	})
	watcher.StartAsync(ctx)
	time.Sleep(50 * time.Millisecond)

	promoted := make(chan struct{})
	release := make(chan struct{})
	gateway := newGateway(t, gatewayConfig{
		db: db, path: path, clock: time.Now().UnixMilli(), operationID: "batch-watcher", replacementEcho: registry,
		publishEvent: func(_ string, _ string, _ []byte) { publisher.count.Add(1) },
		replaceCheckpoint: func(phase legacy.BatchReplacementPhase) error {
			if phase == legacy.BatchReplacementPhasePromoted {
				close(promoted)
				<-release
			}
			return nil
		},
	})
	result := make(chan error, 1)
	go func() { _, err := gateway.ApplyBatch(ctx, operations); result <- err }()
	<-promoted
	time.Sleep(100 * time.Millisecond)
	if got := publisher.count.Load(); got != 0 {
		t.Fatalf("watcher published %d replacement events before finalize", got)
	}
	close(release)
	if err := <-result; err != nil {
		t.Fatalf("apply watched batch: %v", err)
	}
	time.Sleep(100 * time.Millisecond)
	if got := publisher.count.Load(); got != 2 {
		t.Fatalf("expected exactly two finalized outbox publications, got %d", got)
	}
	cancel()
	watcher.Wait()
}

func TestBatchReplacementMixedEffectiveStateIsDivergentAsAGroup(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	injected := errors.New("stop with mixed canonical")
	first := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 200, operationID: "batch-mixed",
		replaceCheckpoint: func(phase legacy.BatchReplacementPhase) error {
			if phase != legacy.BatchReplacementPhaseTempDurable {
				return nil
			}
			mixed := append(append([]byte{}, operations[0].Desired...), '\n')
			mixed = append(mixed, append(operations[1].Base.CanonicalJSON, '\n')...)
			if err := os.WriteFile(path, mixed, 0o600); err != nil {
				return err
			}
			return injected
		},
	})
	if _, err := first.ApplyBatch(ctx, operations); !errors.Is(err, injected) {
		t.Fatalf("expected mixed-state interruption, got %v", err)
	}
	if err := newGateway(t, gatewayConfig{db: db, path: path, clock: 201}).Recover(ctx); err != nil {
		t.Fatalf("classify mixed batch: %v", err)
	}
	var superseded, committed int
	if err := db.QueryRow(`SELECT COUNT(*) FROM anime_write_operations WHERE batch_id = 'batch-mixed' AND status = 'superseded'`).Scan(&superseded); err != nil {
		t.Fatalf("count superseded batch rows: %v", err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM anime_write_operations WHERE batch_id = 'batch-mixed' AND status = 'committed'`).Scan(&committed); err != nil {
		t.Fatalf("count committed batch rows: %v", err)
	}
	if superseded != 2 || committed != 0 {
		t.Fatalf("mixed batch recovered partially: superseded=%d committed=%d", superseded, committed)
	}
}

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

func assertBatchDesired(t *testing.T, path string) {
	t.Helper()
	for _, id := range []string{"anime-a", "anime-b"} {
		payload := effectivePayload(t, path, id)
		if payload == nil || !jsonContainsProgress(t, payload, 2) {
			t.Fatalf("expected desired effective state for %s, got %s", id, payload)
		}
	}
}

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

func effectivePayload(t *testing.T, path, animeID string) []byte {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open effective file: %v", err)
	}
	defer file.Close()
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

func TestBatchReplacementReleasesEchoStateAndWatcherResumesOnAmbiguousError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	registry := anime.NewSelfEchoRegistry()
	publisher := &countingEventPublisher{}
	watcher := anime.NewRuntimeWatcher(anime.RuntimeWatcherConfig{
		FilePath: path, Parser: anime.NewSnapshotParser(), Store: bridgeSync.NewAnimeSnapshotStore(db),
		Publisher: publisher, SelfEchoRegistry: registry, DebounceWindow: 10 * time.Millisecond,
	})
	watcher.StartAsync(ctx)
	time.Sleep(50 * time.Millisecond)

	injected := errors.New("ambiguous replacement interruption")
	gateway := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 200, operationID: "batch-ambiguous-echo",
		replacementEcho: registry,
		replaceCheckpoint: func(phase legacy.BatchReplacementPhase) error {
			if phase == legacy.BatchReplacementPhasePromoted {
				return legacy.NewAmbiguousBatchReplaceError(injected)
			}
			return nil
		},
	})
	if _, err := gateway.ApplyBatch(ctx, operations); !errors.Is(err, injected) {
		t.Fatalf("expected ambiguous replacement interruption, got %v", err)
	}
	if registry.ReplacementInFlight() {
		t.Fatal("ReplacementInFlight must be false after ambiguous replacement error, was true")
	}

	external := gatewayAnimeJSON("anime-external", 7)
	if err := appendGatewayLine(path, external); err != nil {
		t.Fatalf("append external line after ambiguous error: %v", err)
	}
	time.Sleep(100 * time.Millisecond)
	if got := publisher.count.Load(); got == 0 {
		t.Fatal("watcher must resume processing after ambiguous replacement error")
	}
	cancel()
	watcher.Wait()
}

func TestBatchReplacementReleasesEchoStateOnDefiniteError(t *testing.T) {
	ctx := context.Background()
	db := openGatewayDB(t)
	path, operations := seedBatchFixture(t, db)
	registry := anime.NewSelfEchoRegistry()
	store := bridgeSync.NewWriteBaseStore(db)
	gateway := newGateway(t, gatewayConfig{
		db: db, path: path, clock: 200, operationID: "batch-definite-echo",
		replacementEcho: registry,
		operations:      &failStageBatchReplaceOnceStore{WriteBaseStore: store, failErr: errors.New("injected stage failure")},
	})
	if _, err := gateway.ApplyBatch(ctx, operations); err == nil {
		t.Fatal("expected definite replacement interruption")
	}
	if registry.ReplacementInFlight() {
		t.Fatal("ReplacementInFlight must be false after definite replacement error, was true")
	}
}

type failStageBatchReplaceOnceStore struct {
	legacy.WriteBaseStore
	failErr error
}

func (s *failStageBatchReplaceOnceStore) StageBatchReplacement(_ context.Context, _ legacy.BatchReplacementJournal) error {
	return s.failErr
}

type countingEventPublisher struct{ count atomic.Int32 }

func (p *countingEventPublisher) Publish(event events.Event) {
	if _, ok := event.(events.AnimeChangedEvent); ok {
		p.count.Add(1)
	}
}

func (s *failBatchFinalizeOnceStore) FinalizeBatch(ctx context.Context, batchID string, committedAtMs int64) error {
	failed := false
	s.once.Do(func() { failed = true })
	if failed {
		return errors.New("injected batch finalize failure")
	}
	return s.WriteBaseStore.FinalizeBatch(ctx, batchID, committedAtMs)
}
