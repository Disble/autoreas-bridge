package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/legacy"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestAppStartupRecoversStagedWritesBeforeObserversAndEvents(t *testing.T) {
	ctx := context.Background()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	base := []byte(`{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"activo":true}`)
	desired := []byte(`{"_id":"anime-1","nombre":"Test","nrocapvisto":3,"estado":2,"activo":true}`)
	_, base, err = legacy.Decode(base)
	if err != nil {
		t.Fatalf("canonicalize base: %v", err)
	}
	_, desired, err = legacy.Decode(desired)
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
	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	if err := os.WriteFile(dataPath, append(desired, '\n'), 0o600); err != nil {
		t.Fatalf("write effective desired state: %v", err)
	}

	order := &startupRecoveryOrder{db: db, operationID: "startup-operation"}
	writer := &startupRecoveryWriter{path: dataPath, order: order}
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return db, nil }
	app.resolveAnimeDataPath = func() (string, error) { return dataPath, nil }
	app.newUpdateWriter = func(anime.UpdateWriterConfig) anime.UpdateWriter { return writer }
	app.newStartupCoordinator = func(anime.StartupCoordinatorConfig) anime.StartupCoordinator {
		return &startupRecoveryCoordinator{order: order}
	}
	app.newRuntimeWatcher = func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
		return &startupRecoveryWatcher{order: order}
	}
	app.startup(ctx)
	if app.startupErr != nil {
		t.Fatalf("startup: %v", app.startupErr)
	}
	want := []string{
		"writer-started",
		"event-after-committed-pending1",
		"coordinator-after-committed-pending0",
		"watcher-after-committed-pending0",
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
	path  string
	order *startupRecoveryOrder
}

func (w *startupRecoveryWriter) StartAsync(context.Context)                        { w.order.record("writer-started") }
func (*startupRecoveryWriter) Wait()                                               {}
func (*startupRecoveryWriter) Err() error                                          { return nil }
func (*startupRecoveryWriter) RequestWrite(context.Context, string, []byte) error  { return nil }
func (*startupRecoveryWriter) RequestAppend(context.Context, string, []byte) error { return nil }
func (w *startupRecoveryWriter) PublishCommitted(string, string, []byte) {
	w.order.record("event-after")
}
func (w *startupRecoveryWriter) LegacyFilePath() string { return w.path }

type startupRecoveryCoordinator struct{ order *startupRecoveryOrder }

func (c *startupRecoveryCoordinator) StartAsync(context.Context) { c.order.record("coordinator-after") }
func (*startupRecoveryCoordinator) Wait()                        {}
func (*startupRecoveryCoordinator) Err() error                   { return nil }
func (*startupRecoveryCoordinator) ContextErr() error            { return nil }

type startupRecoveryWatcher struct{ order *startupRecoveryOrder }

func (w *startupRecoveryWatcher) StartAsync(context.Context) { w.order.record("watcher-after") }
func (*startupRecoveryWatcher) Wait()                        {}
func (*startupRecoveryWatcher) Err() error                   { return nil }
