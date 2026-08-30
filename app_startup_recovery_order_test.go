package main

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"reflect"
	"sync"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/store"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestAppStartupRecoversStagedWritesBeforeEvents proves the SDD-55 cold-cut
// recovery order: a staged-but-not-yet-finalized write from a prior crash is
// recovered and its anime.changed outbox event is published as part of
// startup, before observability wiring finishes -- with zero animes.dat
// dependence (RecoverWrites finalizes straight to SQLite; see ADR-55-1).
func TestAppStartupRecoversStagedWritesBeforeEvents(t *testing.T) {
	ctx := context.Background()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	base := []byte(`{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"active":true}`)
	desired := []byte(`{"id":"anime-1","name":"Test","episodesWatched":3,"status":2,"active":true}`)
	_, base, err = store.Decode(base)
	if err != nil {
		t.Fatalf("canonicalize base: %v", err)
	}
	_, desired, err = store.Decode(desired)
	if err != nil {
		t.Fatalf("canonicalize desired: %v", err)
	}
	if err := bridgeSync.NewAnimeSnapshotStore(db).ReplaceBaseline(ctx, map[string]anime.SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: base, Hash: anime.HashSnapshot(base), ModifiedAt: 100},
	}, nil); err != nil {
		t.Fatalf("seed snapshot: %v", err)
	}
	if err := bridgeSync.NewWriteBaseStore(db).Stage(ctx, anime.WriteOperation{
		OperationID: "startup-operation", AnimeID: "anime-1",
		BaseModifiedAt: 100, IntendedModifiedAt: 200,
		BaseSnapshotJSON: base, BaseHash: anime.HashSnapshot(base),
		DesiredSnapshotJSON: desired, DesiredHash: anime.HashSnapshot(desired),
		Status: anime.WriteOperationStatusStaged, CreatedAtMs: 150,
	}); err != nil {
		t.Fatalf("stage startup operation: %v", err)
	}
	order := &startupRecoveryOrder{db: db, operationID: "startup-operation"}
	writer := &startupRecoveryWriter{order: order}
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return db, nil }
	app.newUpdateWriter = func(anime.UpdateWriterConfig) anime.UpdateWriter { return writer }
	app.startup(ctx)
	if app.startupErr != nil {
		t.Fatalf("startup: %v", app.startupErr)
	}
	want := []string{
		"writer-started",
		"event-after-committed-pending1",
	}
	if got := order.values(); !reflect.DeepEqual(got, want) {
		t.Fatalf("startup recovery order mismatch:\nwant %v\n got %v", want, got)
	}
}

type startupRecoveryOrder struct {
	db          *sql.DB
	operationID string
	mu          sync.Mutex
	steps       []string
}

// record appends a startup step and its current persistence state.
func (o *startupRecoveryOrder) record(prefix string) {
	status := ""
	_ = o.db.QueryRow(`SELECT status FROM anime_write_operations WHERE operation_id = ?`, o.operationID).Scan(&status)
	if prefix != "writer-started" {
		pending := -1
		_ = o.db.QueryRow(`SELECT COUNT(*) FROM anime_changed_outbox WHERE status = 'pending'`).Scan(&pending)
		prefix = fmt.Sprintf("%s-%s-pending%d", prefix, status, pending)
	}
	o.mu.Lock()
	o.steps = append(o.steps, prefix)
	o.mu.Unlock()
}

// values returns a snapshot of the recorded startup steps.
func (o *startupRecoveryOrder) values() []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]string(nil), o.steps...)
}

type startupRecoveryWriter struct {
	order *startupRecoveryOrder
}

func (w *startupRecoveryWriter) StartAsync(context.Context)                       { w.order.record("writer-started") }
func (*startupRecoveryWriter) Wait()                                              {}
func (*startupRecoveryWriter) Err() error                                         { return nil }
func (*startupRecoveryWriter) RequestWrite(context.Context, string, []byte) error { return nil }
func (w *startupRecoveryWriter) PublishCommitted(string, string, []byte, []string) {
	w.order.record("event-after")
}
