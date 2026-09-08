package syncdiag

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/persistence"
)

// openSyncDiagStoreTestDB creates a temporary SQLite database with the
// device_sync_diagnostics schema already applied.
func openSyncDiagStoreTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db := openSyncDiagTestDB(t)
	for _, table := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s schema: %v", table.Name, err)
		}
	}
	return db
}

// fullRecordFixture builds a Record with every field populated, including a
// non-nil PreviousCycle and one recent event, so individual tests can null
// out exactly the field under test.
func fullRecordFixture(cycleID string, reportedAtMS int64) Record {
	degraded := "events"
	previousCycleID := "prev-" + cycleID
	previousTriggerSource := "manual"
	previousLastStage := "closed"
	previousStartedAt := int64(1000)
	previousElapsedMS := int64(500)
	previousErrorName := "unknown"
	previousNativeErrcodeByte := 5
	previousErrorStage := "unknown"
	previousErrorCause := "unknown"
	previousErrorFingerprint := "3f2a91b0"

	return Record{
		DeviceID:                  "device-1",
		ReportedAtMS:              reportedAtMS,
		CycleID:                   cycleID,
		Degraded:                  &degraded,
		TriggerSource:             "foreground_service",
		AppState:                  "background",
		ConsecutiveUnclosedCycles: 0,
		PendingOpsCount:           2,
		Cursor:                    42,
		RecentEvents: []RecentEvent{
			{Source: "sync_cycle", Event: "mutation_failed", Cause: "io_error", FirstAt: 100, LastAt: 200, Count: 3},
		},
		PreviousCycle: &PreviousCycle{
			CycleID:           &previousCycleID,
			TriggerSource:     &previousTriggerSource,
			Outcome:           "completed",
			LastStage:         &previousLastStage,
			StartedAt:         &previousStartedAt,
			ElapsedMS:         &previousElapsedMS,
			ErrorName:         &previousErrorName,
			NativeErrcodeByte: &previousNativeErrcodeByte,
			ErrorStage:        &previousErrorStage,
			ErrorCause:        &previousErrorCause,
			ErrorFingerprint:  &previousErrorFingerprint,
		},
	}
}

// countDiagnosticsRows returns the current device_sync_diagnostics row count.
func countDiagnosticsRows(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM device_sync_diagnostics`).Scan(&count); err != nil {
		t.Fatalf("count device_sync_diagnostics: %v", err)
	}
	return count
}

// seedDiagnosticsRows bulk-inserts count minimal rows in one transaction
// (bypassing InsertReport) with distinct cycle_id and ascending
// reported_at_ms, so retention tests can reach past the 5,000-row cap
// without paying per-row commit cost.
func seedDiagnosticsRows(t *testing.T, db *sql.DB, count int, startAtMS int64) {
	t.Helper()
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()
	stmt, err := tx.Prepare(`
		INSERT INTO device_sync_diagnostics (
			device_id, reported_at_ms, cycle_id, trigger_source, app_state,
			consecutive_unclosed_cycles, pending_ops_count, cursor, recent_events_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		t.Fatalf("prepare seed stmt: %v", err)
	}
	defer func() { _ = stmt.Close() }()
	for i := range count {
		cycleID := fmt.Sprintf("seed-%d", i)
		if _, err := stmt.Exec("device-seed", startAtMS+int64(i), cycleID, "foreground_service", "background", 0, 0, 0, "[]"); err != nil {
			t.Fatalf("seed row %d: %v", i, err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed tx: %v", err)
	}
}

// TestInsertReportStoresRow asserts a full Record round-trips into
// device_sync_diagnostics.
func TestInsertReportStoresRow(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	store := NewStore(db, StoreConfig{})
	record := fullRecordFixture("stores-row-cycle", 1000)

	outcome, err := store.InsertReport(context.Background(), record)
	if err != nil {
		t.Fatalf("insert report: %v", err)
	}
	if outcome != Stored {
		t.Fatalf("expected Stored outcome, got %v", outcome)
	}

	var deviceID, cycleID, degraded, previousOutcome, previousCycleID, recentEventsJSON string
	err = db.QueryRow(`
		SELECT device_id, cycle_id, degraded, previous_outcome, previous_cycle_id, recent_events_json
		FROM device_sync_diagnostics WHERE cycle_id = ?
	`, record.CycleID).Scan(&deviceID, &cycleID, &degraded, &previousOutcome, &previousCycleID, &recentEventsJSON)
	if err != nil {
		t.Fatalf("query inserted row: %v", err)
	}
	if deviceID != record.DeviceID || cycleID != record.CycleID || degraded != *record.Degraded {
		t.Fatalf("unexpected stored envelope columns: device_id=%q cycle_id=%q degraded=%q", deviceID, cycleID, degraded)
	}
	if previousOutcome != record.PreviousCycle.Outcome || previousCycleID != *record.PreviousCycle.CycleID {
		t.Fatalf("unexpected stored previous-cycle columns: previous_outcome=%q previous_cycle_id=%q", previousOutcome, previousCycleID)
	}
	if !strings.Contains(recentEventsJSON, "mutation_failed") {
		t.Fatalf("expected recent_events_json to contain the seeded event, got %q", recentEventsJSON)
	}
}

// TestInsertReportDuplicateCycleIDReturnsDuplicateAndNoSecondRow asserts a
// re-inserted cycle_id is a no-op that still lets the caller retry blind and
// remain correct.
func TestInsertReportDuplicateCycleIDReturnsDuplicateAndNoSecondRow(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	store := NewStore(db, StoreConfig{})
	record := fullRecordFixture("duplicate-cycle", 1000)

	first, err := store.InsertReport(context.Background(), record)
	if err != nil {
		t.Fatalf("first insert: %v", err)
	}
	if first != Stored {
		t.Fatalf("expected first insert to be Stored, got %v", first)
	}

	second, err := store.InsertReport(context.Background(), record)
	if err != nil {
		t.Fatalf("second insert: %v", err)
	}
	if second != Duplicate {
		t.Fatalf("expected second insert to be Duplicate, got %v", second)
	}

	if count := countDiagnosticsRows(t, db); count != 1 {
		t.Fatalf("expected exactly one row for the duplicated cycle_id, got %d", count)
	}
}

// TestInsertReportPreviousCycleFieldsNullable asserts every previous_*
// column except previous_outcome is independently nullable.
func TestInsertReportPreviousCycleFieldsNullable(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		column  string
		nullify func(pc *PreviousCycle)
	}{
		{"previous_cycle_id", "previous_cycle_id", func(pc *PreviousCycle) { pc.CycleID = nil }},
		{"previous_trigger_source", "previous_trigger_source", func(pc *PreviousCycle) { pc.TriggerSource = nil }},
		{"previous_last_stage", "previous_last_stage", func(pc *PreviousCycle) { pc.LastStage = nil }},
		{"previous_started_at", "previous_started_at", func(pc *PreviousCycle) { pc.StartedAt = nil }},
		{"previous_elapsed_ms", "previous_elapsed_ms", func(pc *PreviousCycle) { pc.ElapsedMS = nil }},
		{"previous_error_name", "previous_error_name", func(pc *PreviousCycle) { pc.ErrorName = nil }},
		{"previous_native_errcode_byte", "previous_native_errcode_byte", func(pc *PreviousCycle) { pc.NativeErrcodeByte = nil }},
		{"previous_error_stage", "previous_error_stage", func(pc *PreviousCycle) { pc.ErrorStage = nil }},
		{"previous_error_cause", "previous_error_cause", func(pc *PreviousCycle) { pc.ErrorCause = nil }},
		{"previous_error_fingerprint", "previous_error_fingerprint", func(pc *PreviousCycle) { pc.ErrorFingerprint = nil }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertPreviousCycleColumnNullable(t, tc.name, tc.column, tc.nullify)
		})
	}
}

// assertPreviousCycleColumnNullable inserts a full record with one
// previous-cycle field cleared and asserts that column persists as NULL while
// previous_outcome, the only field guaranteed non-null inside previous_cycle,
// survives untouched.
func assertPreviousCycleColumnNullable(t *testing.T, name, column string, nullify func(pc *PreviousCycle)) {
	t.Helper()

	db := openSyncDiagStoreTestDB(t)
	store := NewStore(db, StoreConfig{})
	record := fullRecordFixture("nullable-"+name, 1000)
	nullify(record.PreviousCycle)

	if _, err := store.InsertReport(context.Background(), record); err != nil {
		t.Fatalf("insert report: %v", err)
	}

	var value sql.NullString
	// NOSONAR go:S2077 -- column is a compile-time literal from the caller's
	// table, never external input; SQLite cannot bind an identifier as a
	// parameter.
	query := fmt.Sprintf(`SELECT %s FROM device_sync_diagnostics WHERE cycle_id = ?`, column) // NOSONAR
	if err := db.QueryRow(query, record.CycleID).Scan(&value); err != nil {
		t.Fatalf("query %s: %v", column, err)
	}
	if value.Valid {
		t.Fatalf("expected %s to be NULL, got %q", column, value.String)
	}

	var outcome string
	if err := db.QueryRow(`SELECT previous_outcome FROM device_sync_diagnostics WHERE cycle_id = ?`, record.CycleID).Scan(&outcome); err != nil {
		t.Fatalf("query previous_outcome: %v", err)
	}
	if outcome != "completed" {
		t.Fatalf("expected previous_outcome to remain non-null, got %q", outcome)
	}
}

// TestInsertReportShedsUnderHeldConnection is MANDATORY, LOAD-BEARING -- do
// not weaken. Neither a status-only nor an elapsed-only assertion proves
// shedding: a response-deadline implementation also returns at the budget,
// it just keeps running afterward, still queued for the connection, and
// lands its row once the holder releases. Steps 3-4 below (release, then
// re-check the table) are the only observable difference between a correct
// implementation and a broken one.
func TestInsertReportShedsUnderHeldConnection(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	db.SetMaxOpenConns(1)

	// (1) Hold the single shared connection with another writer.
	holder, err := db.Begin()
	if err != nil {
		t.Fatalf("begin holder tx: %v", err)
	}

	budget := 150 * time.Millisecond
	store := NewStore(db, StoreConfig{WriteBudget: budget})

	// (2) Issue the diagnostics insert under the held connection.
	start := time.Now()
	outcome, err := store.InsertReport(context.Background(), fullRecordFixture("shed-cycle", 2000))
	elapsed := time.Since(start)

	if !errors.Is(err, ErrWriteBudget) {
		t.Fatalf("expected ErrWriteBudget, got %v", err)
	}
	if outcome != Shed {
		t.Fatalf("expected Shed outcome, got %v", outcome)
	}
	slack := 850 * time.Millisecond
	if elapsed < budget || elapsed > budget+slack {
		t.Fatalf("expected elapsed in [%v, %v], got %v", budget, budget+slack, elapsed)
	}

	// (3) Release the holder.
	if err := holder.Rollback(); err != nil {
		t.Fatalf("release holder: %v", err)
	}

	// A correct implementation already gave up its place in the
	// connection-pool wait queue when the deadline fired, so nothing lands
	// here. A response-deadline implementation would still be queued at
	// this point and would insert the row once freed.
	time.Sleep(2 * budget)

	// (4) Re-check the table: the shed row must never appear.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM device_sync_diagnostics WHERE cycle_id = ?`, "shed-cycle").Scan(&count); err != nil {
		t.Fatalf("count shed rows: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected the shed row to never be inserted, got %d rows", count)
	}
}

// TestPrunesOnFirstWriteOfProcess adopts eventlog's actual mechanism
// (s.successful++; if s.successful > 1 && s.successful%pruneEvery != 0 {
// return }): the first write of every process prunes unconditionally, so a
// fresh Store over a table already past the cap must not wait for a full
// pruneEvery cadence window before enforcing it.
//
// Expected counts are literals, not the retentionLimit/pruneEvery symbols
// themselves: asserting against the production constant a test exists to
// pin would let a mutated constant silently shift the assertion along with
// the behavior it is supposed to catch.
func TestPrunesOnFirstWriteOfProcess(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	seedDiagnosticsRows(t, db, 5010, 0)

	store := NewStore(db, StoreConfig{})
	if _, err := store.InsertReport(context.Background(), fullRecordFixture("fresh-process-cycle", 100000)); err != nil {
		t.Fatalf("insert report: %v", err)
	}

	if count := countDiagnosticsRows(t, db); count != 5000 {
		t.Fatalf("expected the first write of the process to prune unconditionally down to 5000, got %d", count)
	}
}

// TestPrunesOnCadenceNotOnEveryWrite asserts pruning fires exactly on the
// pruneEvery-th successful write of a running process, not before and not
// after -- the companion to TestPrunesOnFirstWriteOfProcess, which only
// exercises the first-write branch and cannot distinguish "prunes on every
// write past the first" from "prunes only on the cadence boundary". Seeding
// starts already over the cap (not merely near it): the second write's
// no-prune assertion is the only thing that can tell "successful > 1" apart
// from an off-by-one "successful > 2", and that distinction is invisible
// unless the table already has rows past the cap left to delete at that
// exact point. Expected counts are literals for the same reason as
// TestPrunesOnFirstWriteOfProcess.
func TestPrunesOnCadenceNotOnEveryWrite(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	seedDiagnosticsRows(t, db, 5050, 0)
	store := NewStore(db, StoreConfig{})

	// Write 1 (successful=1): the first write of the process prunes
	// unconditionally: 5050+1 seeded+inserted rows prune down to the cap.
	if _, err := store.InsertReport(context.Background(), fullRecordFixture("cadence-cycle-1", 10000)); err != nil {
		t.Fatalf("insert 1: %v", err)
	}
	if count := countDiagnosticsRows(t, db); count != 5000 {
		t.Fatalf("expected the first write to prune down to 5000, got %d", count)
	}

	// Write 2 (successful=2) must NOT prune: the table is already back at
	// the cap, so this one row is left over the cap until the next cadence
	// boundary. This is the only observable point distinguishing
	// "successful > 1" from an off-by-one "successful > 2" boundary --
	// both would agree at successful=1 (never skips) and from
	// successful=3 onward (both skip identically).
	if _, err := store.InsertReport(context.Background(), fullRecordFixture("cadence-cycle-2", 10001)); err != nil {
		t.Fatalf("insert 2: %v", err)
	}
	if count := countDiagnosticsRows(t, db); count != 5001 {
		t.Fatalf("expected write 2 to leave one row over the cap unpruned, got %d", count)
	}

	// Writes 3..99 (successful counts 3..99) must NOT prune either: the row
	// count keeps growing past the cap by one per write.
	for successful := 3; successful <= 99; successful++ {
		cycleID := fmt.Sprintf("cadence-cycle-%d", successful)
		if _, err := store.InsertReport(context.Background(), fullRecordFixture(cycleID, int64(10000+successful))); err != nil {
			t.Fatalf("insert %d: %v", successful, err)
		}
	}
	if count := countDiagnosticsRows(t, db); count != 5098 {
		t.Fatalf("expected no pruning between writes 2 and 99, got %d rows (want 5098)", count)
	}

	// Write 100 (successful=100) hits the cadence boundary and must prune
	// back down to the cap.
	if _, err := store.InsertReport(context.Background(), fullRecordFixture("cadence-cycle-100", 10100)); err != nil {
		t.Fatalf("insert 100: %v", err)
	}
	if count := countDiagnosticsRows(t, db); count != 5000 {
		t.Fatalf("expected the cadence write to prune down to 5000, got %d", count)
	}
}

// TestRetentionHoldsRowCountUnderSustainedWrites asserts the row count never
// exceeds the cap by more than one prune cycle's writes, including across a
// second Store simulating a process restart, and that a conflict no-op
// never advances the prune counter. Expected counts are literals for the
// same reason as TestPrunesOnFirstWriteOfProcess.
func TestRetentionHoldsRowCountUnderSustainedWrites(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	seedDiagnosticsRows(t, db, 5010, 0)

	store1 := NewStore(db, StoreConfig{})
	for i := range 5 {
		cycleID := fmt.Sprintf("store1-cycle-%d", i)
		if _, err := store1.InsertReport(context.Background(), fullRecordFixture(cycleID, int64(100000+i))); err != nil {
			t.Fatalf("store1 insert %d: %v", i, err)
		}
	}
	if count := countDiagnosticsRows(t, db); count > 5100 {
		t.Fatalf("expected row count within cap+cadence after store1 writes, got %d", count)
	}

	// Simulate a process restart: a fresh Store resets the in-memory
	// successful counter, so its first write must still prune
	// unconditionally rather than waiting for another full cadence window.
	store2 := NewStore(db, StoreConfig{})
	if _, err := store2.InsertReport(context.Background(), fullRecordFixture("store2-cycle-restart", 200000)); err != nil {
		t.Fatalf("store2 insert: %v", err)
	}
	if store2.successful != 1 {
		t.Fatalf("expected store2's first write to count as successful write 1, got %d", store2.successful)
	}
	if count := countDiagnosticsRows(t, db); count != 5000 {
		t.Fatalf("expected store2's first write to prune unconditionally down to 5000, got %d", count)
	}

	// A conflict no-op (duplicate cycle_id) must never advance the prune
	// counter, so it never counts toward the next prune cadence window.
	outcome, err := store2.InsertReport(context.Background(), fullRecordFixture("store2-cycle-restart", 200001))
	if err != nil {
		t.Fatalf("duplicate insert: %v", err)
	}
	if outcome != Duplicate {
		t.Fatalf("expected duplicate outcome, got %v", outcome)
	}
	if store2.successful != 1 {
		t.Fatalf("expected a conflict no-op to leave the prune counter unchanged, got %d", store2.successful)
	}
}

// TestNewStoreDefaultsWriteBudgetOnlyWhenNonPositive asserts NewStore
// honors any positive configured budget as-is and defaults only a
// non-positive one -- exercising the exact <= 0 boundary rather than only
// the zero-value case every other test in this file uses.
func TestNewStoreDefaultsWriteBudgetOnlyWhenNonPositive(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)

	honored := NewStore(db, StoreConfig{WriteBudget: 1})
	if honored.writeBudget != 1 {
		t.Fatalf("expected a positive 1ns WriteBudget to be honored as-is, got %v", honored.writeBudget)
	}

	defaulted := NewStore(db, StoreConfig{})
	if defaulted.writeBudget != 2*time.Second {
		t.Fatalf("expected a zero WriteBudget to default to 2s, got %v", defaulted.writeBudget)
	}
}

// TestInsertReportStoresEmptyRecentEventsAsJSONArray asserts a nil
// RecentEvents slice is stored as the literal JSON array "[]", never as the
// json.Marshal(nil) result "null" -- matching the recent_events_json DDL
// comment (NOT NULL, '[]' when empty).
func TestInsertReportStoresEmptyRecentEventsAsJSONArray(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	store := NewStore(db, StoreConfig{})
	record := fullRecordFixture("empty-events-cycle", 1000)
	record.RecentEvents = nil

	if _, err := store.InsertReport(context.Background(), record); err != nil {
		t.Fatalf("insert report: %v", err)
	}

	var recentEventsJSON string
	if err := db.QueryRow(`SELECT recent_events_json FROM device_sync_diagnostics WHERE cycle_id = ?`, record.CycleID).Scan(&recentEventsJSON); err != nil {
		t.Fatalf("query recent_events_json: %v", err)
	}
	if recentEventsJSON != "[]" {
		t.Fatalf("expected recent_events_json to be the literal empty array, got %q", recentEventsJSON)
	}
}
