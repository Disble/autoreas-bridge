package retention

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"
	"time"
)

// TestSweepKeepsCaptureClassesAndDropsTheRestAfterTheRecorderSpan pins the recorder rule for
// request_captures: a row is kept for exactly RecorderSpan, then only the journal, the WebSocket
// ledger and rows inside a live incident window survive.
func TestSweepKeepsCaptureClassesAndDropsTheRestAfterTheRecorderSpan(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	stale := recorderCutoffMS - 1
	operations := `{"operation_refs":[{"anime_id":"a1","operation":"update","outcome":"applied"}]}`
	windowStart, windowEnd := stale-10_000, stale-5_000
	insertIncident(t, db, "live", sweepNow.Add(-time.Hour).UnixMilli(), windowStart, windowEnd)
	expiredOccurrence := ledgerCutoffMS - 1
	insertIncident(t, db, "expired", expiredOccurrence, stale-30_000, stale-20_000)
	// An incident exactly LedgerSpan old is still kept, so it still pins its window.
	insertIncident(t, db, "at-horizon", ledgerCutoffMS, stale-40_000, stale-35_000)
	for _, capture := range []testCapture{
		{id: "get-at-cutoff", kind: "get", atMS: recorderCutoffMS},
		{id: "get-stale", kind: "get", atMS: stale},
		{id: "post-stale", kind: "post", atMS: stale},
		{id: "put-stale", kind: "put", atMS: stale},
		{id: "patch-stale", kind: "patch", atMS: stale},
		{id: "delete-stale", kind: "delete", atMS: stale},
		{id: "reconcile-with-operations", kind: "reconcile", atMS: stale, correlation: operations},
		{id: "reconcile-without-operations", kind: "reconcile", atMS: stale},
		{id: "reconcile-other-anime-key", kind: "reconcile", atMS: stale, correlation: `{"anime_ids":["a1"],"operation_refs":[]}`},
		{id: "get-with-operations", kind: "get", atMS: stale, correlation: operations},
		{id: "ws-broadcast", kind: "ws_broadcast", atMS: stale},
		{id: "ws-no-underscore", kind: "wsxconnect", atMS: stale},
		{id: "window-start", kind: "get", atMS: windowStart},
		{id: "window-end", kind: "get", atMS: windowEnd},
		{id: "before-window", kind: "get", atMS: windowStart - 1},
		{id: "after-window", kind: "get", atMS: windowEnd + 1},
		{id: "expired-incident-window", kind: "get", atMS: stale - 25_000},
		{id: "horizon-incident-window", kind: "get", atMS: stale - 37_000},
	} {
		insertCapture(t, db, capture)
	}

	result := sweep(t, db)

	assertSurvivors(t, "capture", stringColumn(t, db, `SELECT request_id FROM request_captures`), []string{
		"get-at-cutoff", "post-stale", "put-stale", "patch-stale", "delete-stale",
		"reconcile-with-operations", "ws-broadcast", "window-start", "window-end", "horizon-incident-window",
	})
	if result.Captures != 8 {
		t.Fatalf("expected 8 captures deleted, got %d", result.Captures)
	}
}

// TestSweepKeepsNonNoiseEventsAndDropsNoiseAfterTheRecorderSpan pins the recorder rule for
// runtime_events: noise is deleted after RecorderSpan unless an incident window covers it.
func TestSweepKeepsNonNoiseEventsAndDropsNoiseAfterTheRecorderSpan(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	stale := recorderCutoffMS - 1
	windowStart, windowEnd := stale-10_000, stale-5_000
	insertIncident(t, db, "live", sweepNow.Add(-time.Hour).UnixMilli(), windowStart, windowEnd)
	insertIncident(t, db, "expired", ledgerCutoffMS-1, stale-30_000, stale-20_000)
	reconcile, tracer := eventType("sync.reconcile"), eventType("tracer.step")
	for _, event := range []testEvent{
		{message: "reconcile-at-cutoff", eventType: reconcile, atMS: recorderCutoffMS},
		{message: "reconcile-stale", eventType: reconcile, atMS: stale},
		{message: "tracer-step-stale", eventType: tracer, atMS: stale},
		{message: StartupMarker, eventType: tracer, atMS: stale},
		{message: "untyped-stale", atMS: stale},
		{message: "other-type-stale", eventType: eventType("anime.changed"), atMS: stale},
		{message: "window-start", eventType: reconcile, atMS: windowStart},
		{message: "window-end", eventType: tracer, atMS: windowEnd},
		{message: "before-window", eventType: reconcile, atMS: windowStart - 1},
		{message: "after-window", eventType: tracer, atMS: windowEnd + 1},
		{message: "expired-incident-window", eventType: reconcile, atMS: stale - 25_000},
	} {
		insertEvent(t, db, event)
	}

	result := sweep(t, db)

	assertSurvivors(t, "event", stringColumn(t, db, `SELECT message FROM runtime_events`), []string{
		"reconcile-at-cutoff", StartupMarker, "untyped-stale", "other-type-stale", "window-start", "window-end",
	})
	if result.Events != 5 {
		t.Fatalf("expected 5 events deleted, got %d", result.Events)
	}
}

// TestSweepDeletesEverythingOlderThanTheLedgerSpan pins the 90-day horizon on every
// observability table: a row exactly LedgerSpan old survives, one millisecond older is gone,
// whatever its class.
func TestSweepDeletesEverythingOlderThanTheLedgerSpan(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	expired := ledgerCutoffMS - 1
	for _, capture := range []testCapture{
		{id: "post-at-horizon", kind: "post", atMS: ledgerCutoffMS},
		{id: "post-expired", kind: "post", atMS: expired},
		{id: "ws-at-horizon", kind: "ws_connect", atMS: ledgerCutoffMS},
		{id: "ws-expired", kind: "ws_connect", atMS: expired},
	} {
		insertCapture(t, db, capture)
	}
	insertEvent(t, db, testEvent{message: "event-at-horizon", atMS: ledgerCutoffMS})
	insertEvent(t, db, testEvent{message: "event-expired", atMS: expired})
	insertIncident(t, db, "at-horizon", ledgerCutoffMS, ledgerCutoffMS-1, ledgerCutoffMS)
	insertIncident(t, db, "expired", expired, expired, expired)
	for label, hourMS := range map[string]int64{"rollup-at-horizon": ledgerCutoffMS, "rollup-expired": expired} {
		if _, err := db.Exec(`INSERT INTO request_rollup_hourly (hour_ms, route_template, status_class, device_id, request_count, max_duration_ms)
			VALUES (?, ?, 2, '', 1, 1)`, hourMS, label); err != nil {
			t.Fatalf("insert rollup: %v", err)
		}
	}
	for label, lastSeenMS := range map[string]int64{"version-at-horizon": ledgerCutoffMS, "version-expired": expired} {
		if _, err := db.Exec(`INSERT INTO response_versions (route_template, body_hash, body, first_seen_ms, last_seen_ms, seen_count)
			VALUES (?, 'h', '{}', ?, ?, 1)`, label, expired, lastSeenMS); err != nil {
			t.Fatalf("insert version: %v", err)
		}
	}

	result := sweep(t, db)

	assertSurvivors(t, "capture", stringColumn(t, db, `SELECT request_id FROM request_captures`), []string{"post-at-horizon", "ws-at-horizon"})
	assertSurvivors(t, "event", stringColumn(t, db, `SELECT message FROM runtime_events`), []string{"event-at-horizon"})
	assertSurvivors(t, "incident", stringColumn(t, db, `SELECT fingerprint FROM incidents`), []string{"at-horizon"})
	assertSurvivors(t, "rollup", stringColumn(t, db, `SELECT route_template FROM request_rollup_hourly`), []string{"rollup-at-horizon"})
	assertSurvivors(t, "version", stringColumn(t, db, `SELECT route_template FROM response_versions`), []string{"version-at-horizon"})
	want := SweepResult{Captures: 2, Events: 1, Rollups: 1, Versions: 1, Incidents: 1}
	if result != want {
		t.Fatalf("expected %+v, got %+v", want, result)
	}
}

// TestSweepKeepsTheFirstAndLatestOccurrencesPerFingerprint pins the incident trim: per
// fingerprint the first KeepFirst and the latest KeepLatest by (occurred_at_ms, id) survive.
func TestSweepKeepsTheFirstAndLatestOccurrencesPerFingerprint(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	base := sweepNow.Add(-time.Hour).UnixMilli()
	// Eight occurrences inserted out of time order, so the trim must sort by occurred_at_ms.
	for _, offset := range []int64{5, 1, 8, 3, 2, 7, 4, 6} {
		insertIncident(t, db, "eight", base+offset, base, base)
	}
	insertIncident(t, db, "two", base, base, base)
	insertIncident(t, db, "two", base+1, base, base)
	// Seven occurrences at one instant: the id breaks the tie, so the fourth inserted goes.
	for range 7 {
		insertIncident(t, db, "tied", base, base, base)
	}

	result := sweep(t, db)

	assertSurvivors(t, "eight", stringColumn(t, db, `SELECT CAST(occurred_at_ms - `+fmt.Sprint(base)+` AS TEXT) FROM incidents WHERE fingerprint = 'eight'`),
		[]string{"1", "2", "3", "6", "7", "8"})
	if got := stringColumn(t, db, `SELECT fingerprint FROM incidents WHERE fingerprint = 'two'`); len(got) != 2 {
		t.Fatalf("expected both occurrences of a short fingerprint kept, got %q", got)
	}
	tiedIDs := stringColumn(t, db, `SELECT CAST(id - (SELECT MIN(id) FROM incidents WHERE fingerprint = 'tied') AS TEXT) FROM incidents WHERE fingerprint = 'tied'`)
	assertSurvivors(t, "tied", tiedIDs, []string{"0", "1", "2", "4", "5", "6"})
	if result.Incidents != 3 {
		t.Fatalf("expected 3 incidents trimmed, got %d", result.Incidents)
	}
}

// TestSweepLeavesNonObservabilityTablesUntouched seeds every observability table with expired
// rows and proves the sweep changes the row count of no other table.
func TestSweepLeavesNonObservabilityTablesUntouched(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	if _, err := db.Exec(`INSERT INTO app_settings (key, value) VALUES ('retention.probe', 'kept')`); err != nil {
		t.Fatalf("seed app setting: %v", err)
	}
	insertCapture(t, db, testCapture{id: "expired", kind: "get", atMS: 1})
	insertEvent(t, db, testEvent{message: "expired", atMS: 1})
	before := otherTableCounts(t, db)

	result := sweep(t, db)

	if result.Captures != 1 || result.Events != 1 {
		t.Fatalf("expected the seeded observability rows deleted, got %+v", result)
	}
	after := otherTableCounts(t, db)
	if fmt.Sprint(before) != fmt.Sprint(after) {
		t.Fatalf("non-observability row counts changed:\nbefore %v\n after %v", before, after)
	}
	if before["app_settings"] == 0 {
		t.Fatal("expected the seeded app setting to be counted")
	}
}

// otherTableCounts returns the row count of every table the sweep does not own.
func otherTableCounts(t *testing.T, db *sql.DB) map[string]int {
	t.Helper()
	owned := map[string]bool{"request_captures": true, "runtime_events": true, "request_rollup_hourly": true, "response_versions": true, "incidents": true}
	counts := map[string]int{}
	for _, table := range stringColumn(t, db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`) {
		if owned[table] {
			continue
		}
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM "` + table + `"`).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		counts[table] = count
	}
	return counts
}

// TestSweepReportsTheFailingStep proves a failed statement surfaces as an error naming its step.
func TestSweepReportsTheFailingStep(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	if _, err := db.Exec(`DROP TABLE incidents`); err != nil {
		t.Fatalf("drop incidents: %v", err)
	}

	if _, err := Sweep(context.Background(), db, sweepNow); err == nil {
		t.Fatal("expected an error when a swept table is missing")
	}
	if _, err := Sweep(context.Background(), nil, sweepNow); !errors.Is(err, ErrNoDatabase) {
		t.Fatalf("expected ErrNoDatabase for a nil database, got %v", err)
	}
}

// TestRunLoopSweepsEveryIntervalAndStopsOnCancel pins the runner: it sweeps on every tick,
// reports a failed pass through logf, and returns when its context is cancelled.
func TestRunLoopSweepsEveryIntervalAndStopsOnCancel(t *testing.T) {
	t.Parallel()

	db := openSweepTestDB(t)
	insertCapture(t, db, testCapture{id: "stale", kind: "get", atMS: time.Now().Add(-3 * time.Hour).UnixMilli()})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		RunLoop(ctx, db, 5*time.Millisecond, func(format string, args ...any) { t.Errorf("unexpected log: "+format, args...) })
		close(done)
	}()

	deadline := time.Now().Add(5 * time.Second)
	for len(stringColumn(t, db, `SELECT request_id FROM request_captures`)) != 0 {
		if time.Now().After(deadline) {
			t.Fatal("the loop did not sweep within 5s")
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the loop did not stop after cancel")
	}

	logged := make(chan string, 1)
	failing, stop := context.WithCancel(context.Background())
	defer stop()
	if _, err := db.Exec(`DROP TABLE incidents`); err != nil {
		t.Fatalf("drop incidents: %v", err)
	}
	go RunLoop(failing, db, 5*time.Millisecond, func(format string, args ...any) {
		select {
		case logged <- fmt.Sprintf(format, args...):
		default:
		}
	})
	select {
	case message := <-logged:
		if len(message) < len("retention sweep: ") || message[:len("retention sweep: ")] != "retention sweep: " {
			t.Fatalf("expected a retention sweep message, got %q", message)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("a failed pass was not logged within 5s")
	}
}
