package download

import (
	"context"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// TestSQLiteStoreReconcileInterruptedRunsFinalizesNonTerminalRowsOnceAsInterrupted
// reopens a database holding a crashed running row, reconciles it as
// interrupted, and reconciles nothing once every run is terminal.
func TestSQLiteStoreReconcileInterruptedRunsFinalizesNonTerminalRowsOnceAsInterrupted(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.OpenRun(ctx, Run{RunID: "crashed-run", StartedAtMs: 100, Trigger: "scheduled"}); err != nil {
		t.Fatalf("OpenRun: %v", err)
	}
	_ = db.Close()
	db2, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("re-open db: %v", err)
	}
	t.Cleanup(func() { _ = db2.Close() })
	store2 := NewSQLiteStore(db2)
	reconciled, err := store2.ReconcileInterruptedRuns(ctx, 999)
	if err != nil {
		t.Fatalf("ReconcileInterruptedRuns: %v", err)
	}
	if reconciled != 1 {
		t.Fatalf("expected 1 row reconciled, got %d", reconciled)
	}
	runs, err := store2.ListRuns(ctx, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 || runs[0].Status != "interrupted" || runs[0].FinishedAtMs == nil || *runs[0].FinishedAtMs != 999 {
		t.Fatalf("unexpected reconciled runs payload: %#v", runs)
	}

	reconciled, err = store2.ReconcileInterruptedRuns(ctx, 1999)
	if err != nil {
		t.Fatalf("second ReconcileInterruptedRuns: %v", err)
	}
	if reconciled != 0 {
		t.Fatalf("expected 0 rows reconciled when every run is already terminal, got %d", reconciled)
	}
}
