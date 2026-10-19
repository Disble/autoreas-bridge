package desktop

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"
)

// seedFreePages writes and deletes 50 rows of 4 KiB, leaving their pages on the freelist.
func seedFreePages(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`CREATE TABLE vacuum_wiring (body TEXT NOT NULL)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	for range 50 {
		if _, err := db.Exec(`INSERT INTO vacuum_wiring (body) VALUES (?)`, strings.Repeat("x", 4096)); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
	if _, err := db.Exec(`DELETE FROM vacuum_wiring`); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

// freelistCount returns PRAGMA freelist_count.
func freelistCount(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`PRAGMA freelist_count`).Scan(&count); err != nil {
		t.Fatalf("freelist_count: %v", err)
	}
	return count
}

// waitFor polls done every 5 ms and fails with failure when it is still false after 5 s.
func waitFor(t *testing.T, done func() bool, failure string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatal(failure)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// TestStartIncrementalVacuumLoopReclaimsPagesAndLogsFailuresUntilShutdown pins the wiring:
// the loop runs on the catch-up context over the app's database and reports a failed pass
// through the shared logger, stops when shutdown cancels that context, and an app without a
// database starts nothing.
func TestStartIncrementalVacuumLoopReclaimsPagesAndLogsFailuresUntilShutdown(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	seedFreePages(t, db)
	if freelistCount(t, db) == 0 {
		t.Fatal("expected free pages before the loop runs")
	}

	shared, mem := sweepTestLogger()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	(&App{bridgeDB: db, catchUpContext: ctx, sharedLogger: shared}).startIncrementalVacuumLoop(5 * time.Millisecond)

	waitFor(t, func() bool { return freelistCount(t, db) == 0 }, "the loop did not reclaim the free pages within 5s")
	if got := warnMessages(mem); len(got) != 0 {
		t.Fatalf("expected no warnings for successful passes, got %q", got)
	}

	// Shutdown cancels the catch-up context before the database closes: from then on the
	// loop runs no pass, so the closed database never produces a warning.
	cancel()
	time.Sleep(20 * time.Millisecond)
	if err := db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	if got := warnMessages(mem); len(got) != 0 {
		t.Fatalf("expected no pass after shutdown, got %q", got)
	}

	// A pass that fails while the app runs is reported through the shared logger.
	running, stop := context.WithCancel(context.Background())
	defer stop()
	(&App{bridgeDB: db, catchUpContext: running, sharedLogger: shared}).startIncrementalVacuumLoop(5 * time.Millisecond)
	waitFor(t, func() bool { return len(warnMessages(mem)) > 0 }, "a failed pass was not logged within 5s")
	if got := mem.Recent()[0]; got.Domain != "sync" || !strings.HasPrefix(got.Message, "incremental vacuum: ") {
		t.Fatalf("expected a sync incremental vacuum warning, got %#v", got)
	}

	// An app without a database starts no loop; a started one would panic on its first pass.
	(&App{catchUpContext: running, sharedLogger: shared}).startIncrementalVacuumLoop(time.Millisecond)
	time.Sleep(20 * time.Millisecond)
}
