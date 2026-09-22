package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/obserr"
	"autoreas-bridge/internal/observability/syncdiag"
)

// seedSyncDiagReport inserts one diagnostics report through the real write
// path, with explicit degraded and previous-cycle values so tests control
// exactly which nullable columns land as NULL.
func seedSyncDiagReport(t *testing.T, store *syncdiag.Store, cycleID string, reportedAtMS int64, deviceID string, degraded *string, previous *syncdiag.PreviousCycle) {
	t.Helper()
	if _, err := store.InsertReport(context.Background(), syncdiag.Record{
		DeviceID:                  deviceID,
		ReportedAtMS:              reportedAtMS,
		CycleID:                   cycleID,
		Degraded:                  degraded,
		TriggerSource:             "foreground_service",
		AppState:                  "background",
		ConsecutiveUnclosedCycles: 1,
		PendingOpsCount:           3,
		Cursor:                    42,
		PreviousCycle:             previous,
	}); err != nil {
		t.Fatalf("insert report %s: %v", cycleID, err)
	}
}

// TestListDeviceSyncDiagnosticsPreservesCoreAnswers pins the binding to the
// core reader's newest-first page over one real temporary database, its
// device predicate, and its nil round-trip for absent optional columns.
func TestListDeviceSyncDiagnosticsPreservesCoreAnswers(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	store := syncdiag.NewStore(db, syncdiag.StoreConfig{})
	seedSyncDiagReport(t, store, "diag-old", 1000, "device-1", nil, nil)
	degraded := "events"
	seedSyncDiagReport(t, store, "diag-mid", 2000, "device-2", &degraded, &syncdiag.PreviousCycle{Outcome: "completed"})
	seedSyncDiagReport(t, store, "diag-new", 3000, "device-1", nil, nil)

	core := syncdiag.NewReader(db)
	app := &App{bridgeDB: db, syncDiagReader: core}
	ctx := context.Background()

	coreAll, err := core.List(ctx, syncdiag.ReportQuery{})
	if err != nil {
		t.Fatalf("core list: %v", err)
	}
	desktopAll := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
	assertSyncDiagReportsMatch(t, desktopAll.Items, coreAll)

	coreDevice, err := core.List(ctx, syncdiag.ReportQuery{DeviceID: "device-1"})
	if err != nil {
		t.Fatalf("core device list: %v", err)
	}
	desktopDevice := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{DeviceID: "device-1"})
	assertSyncDiagReportsMatch(t, desktopDevice.Items, coreDevice)
	if len(desktopDevice.Items) != 2 {
		t.Fatalf("expected the device predicate to return device-1's 2 reports, got %#v", desktopDevice.Items)
	}

	// The newest report was seeded bare, so every optional column must
	// arrive as a nil pointer through the binding, never as a zero value.
	bare := desktopAll.Items[0]
	if bare.CycleID != "diag-new" || bare.Degraded != nil || bare.PreviousOutcome != nil || bare.PreviousElapsedMS != nil || bare.PreviousErrorFingerprint != nil {
		t.Fatalf("expected the bare report to round-trip nil optionals, got %#v", bare)
	}
	if desktopAll.Items[1].Degraded == nil || *desktopAll.Items[1].Degraded != "events" {
		t.Fatalf("expected the degraded marker to round-trip, got %#v", desktopAll.Items[1].Degraded)
	}
}

// assertSyncDiagReportsMatch compares the bound reports against the core
// reader's reports field by field.
func assertSyncDiagReportsMatch(t *testing.T, items []contracts.DeviceSyncDiagnosticReport, core []syncdiag.Report) {
	t.Helper()

	if len(items) != len(core) {
		t.Fatalf("expected %d reports, got %d (%#v)", len(core), len(items), items)
	}
	for index := range core {
		if items[index].DeviceID != core[index].DeviceID ||
			items[index].ReportedAtMS != core[index].ReportedAtMS ||
			items[index].CycleID != core[index].CycleID ||
			items[index].TriggerSource != core[index].TriggerSource ||
			items[index].AppState != core[index].AppState ||
			items[index].ConsecutiveUnclosedCycles != core[index].ConsecutiveUnclosedCycles ||
			items[index].PendingOpsCount != core[index].PendingOpsCount ||
			items[index].Cursor != core[index].Cursor {
			t.Fatalf("report %d differs: got %#v want %#v", index, items[index], core[index])
		}
		if !syncDiagPointerMatches(items[index].Degraded, core[index].Degraded) ||
			!syncDiagPointerMatches(items[index].PreviousOutcome, core[index].PreviousOutcome) ||
			!syncDiagPointerMatches(items[index].PreviousErrorFingerprint, core[index].PreviousErrorFingerprint) {
			t.Fatalf("report %d nullable columns differ: got %#v want %#v", index, items[index], core[index])
		}
		if !syncDiagInt64PointerMatches(items[index].PreviousElapsedMS, core[index].PreviousElapsedMS) {
			t.Fatalf("report %d previous elapsed differs: got %#v want %#v", index, items[index].PreviousElapsedMS, core[index].PreviousElapsedMS)
		}
	}
}

// syncDiagPointerMatches reports whether two nullable strings agree,
// treating nil and nil as equal.
func syncDiagPointerMatches(got, want *string) bool {
	if got == nil || want == nil {
		return got == want
	}
	return *got == *want
}

// syncDiagInt64PointerMatches reports whether two nullable int64s agree,
// treating nil and nil as equal.
func syncDiagInt64PointerMatches(got, want *int64) bool {
	if got == nil || want == nil {
		return got == want
	}
	return *got == *want
}

// TestListDeviceSyncDiagnosticsNilReaderReturnsDegradedEmptyNonNilItems
// asserts an unwired reader degrades to an empty, never-nil list.
func TestListDeviceSyncDiagnosticsNilReaderReturnsDegradedEmptyNonNilItems(t *testing.T) {
	t.Parallel()

	result := (&App{}).ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
	if !result.Degraded {
		t.Fatal("expected a nil syncDiagReader to degrade")
	}
	if result.Items == nil || len(result.Items) != 0 {
		t.Fatalf("expected a non-nil empty Items slice, got %#v", result.Items)
	}
}

// TestListDeviceSyncDiagnosticsResultIsNeverJSONNull asserts the serialized
// result carries an empty JSON array, never null, even when degraded.
func TestListDeviceSyncDiagnosticsResultIsNeverJSONNull(t *testing.T) {
	t.Parallel()

	result := (&App{}).ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if !strings.Contains(string(encoded), `"items":[]`) {
		t.Fatalf(`expected "items":[] in the serialized result, got %s`, encoded)
	}
	if strings.Contains(string(encoded), "null") {
		t.Fatalf("expected no JSON null anywhere in the result, got %s", encoded)
	}
}

// TestConfigureSyncDiagReaderIsNilSafeAndBuildsOnce mirrors
// TestConfigureEventReaderIsNilSafeAndBuildsOnce for the diagnostics reader
// seam, including the operator contract: a successful wiring builds exactly
// once and says nothing to the log.
func TestConfigureSyncDiagReaderIsNilSafeAndBuildsOnce(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: db, newSyncDiagReader: syncdiag.NewReader})

	app.configureSyncDiagReader()
	if app.syncDiagReader == nil {
		t.Fatal("expected configureSyncDiagReader to build a reader when bridgeDB is set")
	}
	first := app.syncDiagReader
	app.configureSyncDiagReader()
	if app.syncDiagReader != first {
		t.Fatal("expected configureSyncDiagReader to be a no-op once a reader already exists")
	}
	if entries := memLogger.Recent(); len(entries) != 0 {
		t.Fatalf("expected a successful wiring to log nothing, got %#v", entries)
	}
}

// TestConfigureSyncDiagReaderNoopWhenBridgeDBNil asserts the configure seam
// never builds a reader over a missing database handle, even when a
// constructor is wired: the nil-handle guard, not a missing constructor, is
// what keeps an unwired database from reaching the reader.
func TestConfigureSyncDiagReaderNoopWhenBridgeDBNil(t *testing.T) {
	t.Parallel()

	app := &App{newSyncDiagReader: syncdiag.NewReader}
	app.configureSyncDiagReader()
	if app.syncDiagReader != nil {
		t.Fatal("expected configureSyncDiagReader to stay nil when bridgeDB is nil")
	}
}

// TestConfigureSyncDiagReaderNoopWhenConstructorNil mirrors
// TestConfigureEventReaderNoopWhenConstructorNil: a bootstrap that deliberately
// leaves the constructor seam nil gets no reader and no recovered-crash report,
// because the guard returns before any call is attempted.
func TestConfigureSyncDiagReaderNoopWhenConstructorNil(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: db})

	app.configureSyncDiagReader()
	if app.syncDiagReader != nil {
		t.Fatal("expected configureSyncDiagReader to stay nil when newSyncDiagReader is nil")
	}
	if entries := memLogger.Recent(); len(entries) != 0 {
		t.Fatalf("expected a guarded no-op to log nothing, got %#v", entries)
	}
}

// TestConfigureSyncDiagReaderSurvivesAnUnusableBridgeHandle mirrors
// TestConfigureEventReaderSurvivesAnUnusableBridgeHandle: syncdiag.NewReader
// probes device_sync_diagnostics on construction, and database/sql panics
// rather than erroring on a bare, unopened handle. The best-effort read path
// must degrade with exactly one operator warning, never abort the boot.
func TestConfigureSyncDiagReaderSurvivesAnUnusableBridgeHandle(t *testing.T) {
	t.Parallel()

	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: &sql.DB{}, newSyncDiagReader: syncdiag.NewReader})

	app.configureSyncDiagReader()
	if app.syncDiagReader != nil {
		t.Fatal("expected an unusable bridge handle to leave the sync diagnostics reader unwired")
	}
	entries := memLogger.Recent()
	if len(entries) != 1 {
		t.Fatalf("expected exactly one warning for the recovered failure, got %#v", entries)
	}
	if entries[0].Domain != "api" || entries[0].Level != "warn" {
		t.Fatalf("expected an api-domain warning, got domain %q level %q", entries[0].Domain, entries[0].Level)
	}
	if !strings.Contains(entries[0].Message, "failed to wire the sync diagnostics reader") {
		t.Fatalf("expected the warning to name the failure, got %q", entries[0].Message)
	}
}

// TestConfigureSyncDiagReaderSurvivesAnUnusableHandleWithNoLogger mirrors
// TestConfigureEventReaderSurvivesAnUnusableHandleWithNoLogger: the seam can
// run before the shared logger exists, and warning through a nil logger would
// panic inside the deferred recover, turning the startup guard into the thing
// that kills startup.
func TestConfigureSyncDiagReaderSurvivesAnUnusableHandleWithNoLogger(t *testing.T) {
	t.Parallel()

	app := &App{bridgeDB: &sql.DB{}, newSyncDiagReader: syncdiag.NewReader}

	app.configureSyncDiagReader()
	if app.syncDiagReader != nil {
		t.Fatal("expected an unusable bridge handle to leave the sync diagnostics reader unwired")
	}
}

// TestEnsureCaptureRuntimeDependenciesWiresTheSyncDiagReaderDefault asserts
// the wiring default fills only a missing sync-diagnostics constructor seam:
// a fresh app gets the real reader constructor, and a seam an earlier wiring
// step injected is never overwritten with the default.
func TestEnsureCaptureRuntimeDependenciesWiresTheSyncDiagReaderDefault(t *testing.T) {
	t.Parallel()

	fresh := &App{}
	fresh.ensureCaptureRuntimeDependencies()
	if fresh.newSyncDiagReader == nil {
		t.Fatal("expected ensureCaptureRuntimeDependencies to default the sync diagnostics reader seam")
	}

	var seamCalled bool
	app := &App{newSyncDiagReader: func(*sql.DB) *syncdiag.Reader {
		seamCalled = true
		return syncdiag.NewReader(nil)
	}}
	app.ensureCaptureRuntimeDependencies()
	_ = app.newSyncDiagReader(nil)
	if !seamCalled {
		t.Fatal("expected the injected sync diagnostics seam to survive the defaults")
	}
}

// TestListDeviceSyncDiagnosticsAppliesCoreLimitContract seeds more reports
// than every limit bound and asserts the bound read pages behaviourally: the
// default page, a one-row page, an ordinary bounded page, and the hard
// ceiling -- no reader constant is restated, only returned page sizes.
func TestListDeviceSyncDiagnosticsAppliesCoreLimitContract(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	store := syncdiag.NewStore(db, syncdiag.StoreConfig{})
	for i := range 150 {
		seedSyncDiagReport(t, store, fmt.Sprintf("diag-limit-%d", i), int64(1000+i), "device-1", nil, nil)
	}
	app := &App{bridgeDB: db, syncDiagReader: syncdiag.NewReader(db)}

	assertSyncDiagPageCount(t, app, contracts.DeviceSyncDiagnosticsQuery{}, 25)
	assertSyncDiagPageCount(t, app, contracts.DeviceSyncDiagnosticsQuery{Limit: 1}, 1)
	assertSyncDiagPageCount(t, app, contracts.DeviceSyncDiagnosticsQuery{Limit: 10}, 10)
	assertSyncDiagPageCount(t, app, contracts.DeviceSyncDiagnosticsQuery{Limit: 150}, 100)
}

// assertSyncDiagPageCount fails unless the bound read returns exactly want
// reports for the query without degrading.
func assertSyncDiagPageCount(t *testing.T, app *App, query contracts.DeviceSyncDiagnosticsQuery, want int) {
	t.Helper()

	result := app.ListDeviceSyncDiagnostics(query)
	if result.Degraded {
		t.Fatalf("expected a wired read not to degrade for %#v, got %#v", query, result)
	}
	if len(result.Items) != want {
		t.Fatalf("expected %d reports for %#v, got %d (%#v)", want, query, len(result.Items), result.Items)
	}
}

// TestSyncDiagReaderDegradesWithoutTheTable asserts the core reader the
// desktop wiring hands to the binding reports an absent table as unavailable
// and answers List with the observability unavailable envelope, never a raw
// SQL error the binding would have to absorb.
func TestSyncDiagReaderDegradesWithoutTheTable(t *testing.T) {
	t.Parallel()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "tableless.db"))
	if err != nil {
		t.Fatalf("open table-less sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	reader := syncdiag.NewReader(db)
	if reader.Available() {
		t.Fatal("expected an absent table to leave the reader unavailable")
	}
	reports, err := reader.List(context.Background(), syncdiag.ReportQuery{DeviceID: "device-1"})
	if err == nil {
		t.Fatalf("expected an unavailable error for an absent table, got %#v", reports)
	}
	assertSyncDiagUnavailableEnvelope(t, err)
}

// TestSyncDiagNilReaderListDegradesWithoutPanicking asserts a nil core reader
// degrades to the unavailable envelope rather than panicking, since the
// desktop binding can run against an app whose reader was never wired.
func TestSyncDiagNilReaderListDegradesWithoutPanicking(t *testing.T) {
	t.Parallel()

	var reader *syncdiag.Reader
	_, err := reader.List(context.Background(), syncdiag.ReportQuery{})
	if err == nil {
		t.Fatal("expected an unavailable error from a nil reader")
	}
	assertSyncDiagUnavailableEnvelope(t, err)
}

// assertSyncDiagUnavailableEnvelope fails unless err is the observability
// unavailable envelope the core reader degrades with.
func assertSyncDiagUnavailableEnvelope(t *testing.T, err error) {
	t.Helper()

	var unavailable obserr.Error
	if !errors.As(err, &unavailable) {
		t.Fatalf("expected an obserr unavailable envelope, got %v", err)
	}
	if unavailable.Code != "unavailable" {
		t.Fatalf("expected the unavailable code, got %q", unavailable.Code)
	}
}
