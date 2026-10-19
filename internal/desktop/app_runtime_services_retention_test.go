package desktop

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"
)

// TestStartRetentionSweepLoopSweepsAtStartAndLogsFailuresUntilShutdown pins the wiring: the
// loop sweeps the app's database at start on the catch-up context, stops when shutdown cancels
// that context, reports a failed pass through the shared logger, and an app without a database
// starts nothing.
func TestStartRetentionSweepLoopSweepsAtStartAndLogsFailuresUntilShutdown(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "expired", 1)

	shared, mem := sweepTestLogger()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// The interval is an hour, so only the start-up sweep can delete the row, and it runs
	// before the call returns.
	(&App{bridgeDB: db, catchUpContext: ctx, sharedLogger: shared}).startRetentionSweepLoop(time.Hour)

	if got := countCaptureRows(t, db); got != 0 {
		t.Fatalf("expected the start-up sweep to delete the expired row before returning, got %d rows", got)
	}
	if got := warnMessages(mem); len(got) != 0 {
		t.Fatalf("expected no warnings for a successful sweep, got %q", got)
	}

	// Shutdown cancels the catch-up context before the database closes: from then on the loop
	// runs no pass, so the closed database never produces a warning.
	cancel()
	time.Sleep(20 * time.Millisecond)
	if err := db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	if got := warnMessages(mem); len(got) != 0 {
		t.Fatalf("expected no pass after shutdown, got %q", got)
	}

	// A failed start-up sweep and every failed tick are reported through the shared logger.
	running, stop := context.WithCancel(context.Background())
	defer stop()
	(&App{bridgeDB: db, catchUpContext: running, sharedLogger: shared}).startRetentionSweepLoop(5 * time.Millisecond)
	if got := warnMessages(mem); len(got) != 1 {
		t.Fatalf("expected the failed start-up sweep logged before returning, got %q", got)
	}
	waitFor(t, func() bool { return len(warnMessages(mem)) > 1 }, "a failed tick was not logged within 5s")
	if got := mem.Recent()[0]; got.Domain != "sync" || !strings.HasPrefix(got.Message, "retention sweep: ") {
		t.Fatalf("expected a sync retention sweep warning, got %#v", got)
	}

	// The bare, unopened *sql.DB{} of degraded bootstraps panics on query; the start-up sweep
	// reports it instead of taking startup down.
	bare, bareMem := sweepTestLogger()
	(&App{bridgeDB: &sql.DB{}, catchUpContext: running, sharedLogger: bare}).startRetentionSweepLoop(time.Hour)
	if got := warnMessages(bareMem); len(got) != 1 || !strings.HasPrefix(got[0], "retention sweep: ") {
		t.Fatalf("expected the recovered panic logged once, got %q", got)
	}

	// An app without a database starts no loop; a started one would log ErrNoDatabase.
	quiet, quietMem := sweepTestLogger()
	(&App{catchUpContext: running, sharedLogger: quiet}).startRetentionSweepLoop(time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	if got := warnMessages(quietMem); len(got) != 0 {
		t.Fatalf("expected no loop without a database, got %q", got)
	}
}
