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
	"autoreas-bridge/internal/observability/telemetry"
)

// previousCycleSeed is the wire previous_cycle object a seeding helper sends:
// the three values the desktop DTO exposes, and only them, so a test states
// exactly which previous-cycle facts the report carried.
type previousCycleSeed struct {
	outcome          string
	elapsedMS        int64
	errorFingerprint string
}

// cycleReportBody builds a valid cycle_report wire body. Seeding through the
// real body keeps the stored payload the payload production stores; a seeded
// payload built by hand would pin a shape no client can produce.
func cycleReportBody(t *testing.T, cycleID string, degraded *string, previous *previousCycleSeed) []byte {
	t.Helper()

	var previousCycle any
	if previous != nil {
		object := map[string]any{"outcome": previous.outcome}
		// A zero elapsed or an empty fingerprint means "not reported" for
		// this seeding helper: the wire vocabulary rejects an empty
		// fingerprint, so sending one would make a convenience default look
		// like a malformed client report.
		if previous.elapsedMS != 0 {
			object["elapsed_ms"] = previous.elapsedMS
		}
		if previous.errorFingerprint != "" {
			object["error_fingerprint"] = previous.errorFingerprint
		}
		previousCycle = object
	}
	body, err := json.Marshal(map[string]any{
		"cycle_id":       cycleID,
		"degraded":       degraded,
		"trigger_source": "foreground_service",
		"app_state":      "background",
		"previous_cycle": previousCycle,
		"counters": map[string]any{
			"consecutive_unclosed_cycles": 1,
			"pending_ops_count":           3,
			"cursor":                      42,
		},
	})
	if err != nil {
		t.Fatalf("marshal cycle report body: %v", err)
	}
	return body
}

// syncDiagTestStore builds the real telemetry write path the desktop read
// path is the counterpart of, over the app's own bridge database.
func syncDiagTestStore(db *sql.DB) *telemetry.Store {
	return telemetry.NewStore(db, telemetry.StoreConfig{Registry: telemetry.DefaultRegistry()})
}

// seedSyncDiagReport inserts one diagnostics report through the real write
// path, with explicit degraded and previous-cycle values so tests control
// exactly which optional values land as NULL.
func seedSyncDiagReport(t *testing.T, store *telemetry.Store, cycleID string, reportedAtMS int64, deviceID string, degraded *string, previous *previousCycleSeed) {
	t.Helper()

	validated, err := telemetry.CycleReportKind{}.Decode(cycleReportBody(t, cycleID, degraded, previous))
	if err != nil {
		t.Fatalf("decode report %s: %v", cycleID, err)
	}
	outcome, err := store.Insert(context.Background(), telemetry.Event{
		DeviceID:     deviceID,
		ReportedAtMS: reportedAtMS,
		Kind:         telemetry.KindCycleReport,
		Validated:    validated,
	})
	if err != nil {
		t.Fatalf("insert report %s: %v", cycleID, err)
	}
	if outcome != telemetry.Stored {
		t.Fatalf("expected report %s to be Stored, got %v", cycleID, outcome)
	}
}

// TestListDeviceSyncDiagnosticsReadsTheTableTheWritePathFills is the
// regression guard for the write/read split: the ingestion path stores into
// device_telemetry_events, so the binding must read that same table. The row
// count is asserted in the new table first, and only then is the binding's
// answer read back, because a binding still pointed at the retired
// device_sync_diagnostics table answers an empty page -- which no test
// asserting "no error" would ever notice.
func TestListDeviceSyncDiagnosticsReadsTheTableTheWritePathFills(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	degraded := "events"
	seedSyncDiagReport(t, syncDiagTestStore(db), "cycle-live", 4000, "device-1", &degraded,
		&previousCycleSeed{outcome: "failed", elapsedMS: 1500, errorFingerprint: "deadbeef"})

	assertSyncDiagRowCount(t, db, telemetry.KindCycleReport, 1)

	app := &App{bridgeDB: db, syncDiagReader: telemetry.NewReader(db)}
	result := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{DeviceID: "device-1"})
	if result.Degraded {
		t.Fatalf("expected a wired read over a live table not to degrade, got %#v", result)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected the stored report to be read back through the binding, got %#v", result.Items)
	}
	assertLiveSyncDiagItem(t, result.Items[0], degraded)
}

// assertSyncDiagRowCount fails unless one kind holds exactly want rows, which
// is what proves the write path and the read path name the same table.
func assertSyncDiagRowCount(t *testing.T, db *sql.DB, kind telemetry.KindName, want int) {
	t.Helper()

	var stored int
	if err := db.QueryRow(`SELECT COUNT(*) FROM device_telemetry_events WHERE kind = ?`, kind).Scan(&stored); err != nil {
		t.Fatalf("count stored telemetry rows: %v", err)
	}
	if stored != want {
		t.Fatalf("expected the write path to store exactly %d %s rows, got %d", want, kind, stored)
	}
}

// assertLiveSyncDiagItem fails unless every DTO field of a stored cycle
// report is populated, including the three values that moved from their own
// columns into the stored payload's previous_cycle object.
func assertLiveSyncDiagItem(t *testing.T, item contracts.DeviceSyncDiagnosticReport, degraded string) {
	t.Helper()

	if item.DeviceID != "device-1" || item.ReportedAtMS != 4000 || item.CycleID != "cycle-live" {
		t.Fatalf("expected the envelope's device, clock and cycle identity, got %#v", item)
	}
	if item.TriggerSource != "foreground_service" || item.AppState != "background" ||
		item.ConsecutiveUnclosedCycles != 1 || item.PendingOpsCount != 3 || item.Cursor != 42 {
		t.Fatalf("expected the payload's scalars to populate the DTO, got %#v", item)
	}
	if item.Degraded == nil || *item.Degraded != degraded {
		t.Fatalf("expected the envelope's degraded column in the DTO, got %v", item.Degraded)
	}
	if item.PreviousOutcome == nil || *item.PreviousOutcome != "failed" {
		t.Fatalf("expected the previous outcome to populate the DTO, got %v", item.PreviousOutcome)
	}
	if item.PreviousElapsedMS == nil || *item.PreviousElapsedMS != 1500 {
		t.Fatalf("expected the previous elapsed to populate the DTO, got %v", item.PreviousElapsedMS)
	}
	if item.PreviousErrorFingerprint == nil || *item.PreviousErrorFingerprint != "deadbeef" {
		t.Fatalf("expected the previous error fingerprint to populate the DTO, got %v", item.PreviousErrorFingerprint)
	}
}

// TestListDeviceSyncDiagnosticsPreservesCoreAnswers pins the binding to the
// kind projection's newest-first page over one real temporary database, its
// device predicate, and its nil round-trip for absent optional values.
func TestListDeviceSyncDiagnosticsPreservesCoreAnswers(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	store := syncDiagTestStore(db)
	seedSyncDiagReport(t, store, "diag-old", 1000, "device-1", nil, nil)
	degraded := "events"
	seedSyncDiagReport(t, store, "diag-mid", 2000, "device-2", &degraded, &previousCycleSeed{outcome: "completed"})
	seedSyncDiagReport(t, store, "diag-new", 3000, "device-1", nil, nil)

	core := telemetry.NewReader(db)
	app := &App{bridgeDB: db, syncDiagReader: core}
	ctx := context.Background()

	coreAll, err := core.ListCycleReports(ctx, telemetry.CycleReportQuery{})
	if err != nil {
		t.Fatalf("core list: %v", err)
	}
	desktopAll := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
	assertSyncDiagReportsMatch(t, desktopAll.Items, coreAll)

	coreDevice, err := core.ListCycleReports(ctx, telemetry.CycleReportQuery{DeviceID: "device-1"})
	if err != nil {
		t.Fatalf("core device list: %v", err)
	}
	desktopDevice := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{DeviceID: "device-1"})
	assertSyncDiagReportsMatch(t, desktopDevice.Items, coreDevice)
	if len(desktopDevice.Items) != 2 {
		t.Fatalf("expected the device predicate to return device-1's 2 reports, got %#v", desktopDevice.Items)
	}

	// The newest report was seeded bare, so every optional value must arrive
	// as a nil pointer through the binding, never as a zero value.
	bare := desktopAll.Items[0]
	if bare.CycleID != "diag-new" || bare.Degraded != nil || bare.PreviousOutcome != nil || bare.PreviousElapsedMS != nil || bare.PreviousErrorFingerprint != nil {
		t.Fatalf("expected the bare report to round-trip nil optionals, got %#v", bare)
	}
	if desktopAll.Items[1].Degraded == nil || *desktopAll.Items[1].Degraded != "events" {
		t.Fatalf("expected the degraded marker to round-trip, got %#v", desktopAll.Items[1].Degraded)
	}
}

// TestListDeviceSyncDiagnosticsExcludesAnotherKind asserts the binding reads
// only cycle reports out of the shared table: an episode_action row is a
// different kind's data and must never render as a sync-cycle report.
func TestListDeviceSyncDiagnosticsExcludesAnotherKind(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	store := syncDiagTestStore(db)
	seedSyncDiagReport(t, store, "diag-only", 1000, "device-1", nil, nil)
	if _, err := store.Insert(context.Background(), telemetry.Event{
		DeviceID: "device-1", ReportedAtMS: 2000, Kind: telemetry.KindEpisodeAction,
		Validated: telemetry.Validated{EventID: "observation-1", Payload: []byte(`{"action":"episode_plus_one"}`)},
	}); err != nil {
		t.Fatalf("insert episode action: %v", err)
	}

	app := &App{bridgeDB: db, syncDiagReader: telemetry.NewReader(db)}
	result := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
	if len(result.Items) != 1 || result.Items[0].CycleID != "diag-only" {
		t.Fatalf("expected only the cycle_report row through the binding, got %#v", result.Items)
	}
}

// TestListDeviceSyncDiagnosticsReadsACorruptPayloadRow asserts a row whose
// payload cannot be read is still attributed and still listed, with the
// unreadable values absent: one unreadable row must not empty a device's
// diagnostics view, and it must never panic the binding.
func TestListDeviceSyncDiagnosticsReadsACorruptPayloadRow(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	// Written without the kind's decoder on purpose: this is the row shape the
	// write path cannot produce and the read path must still survive.
	if _, err := db.Exec(`
		INSERT INTO device_telemetry_events (device_id, reported_at_ms, kind, event_id, payload_json)
		VALUES ('device-7', 6000, ?, 'cycle-corrupt', '{"cycle_id":')
	`, telemetry.KindCycleReport); err != nil {
		t.Fatalf("seed corrupt payload row: %v", err)
	}

	app := &App{bridgeDB: db, syncDiagReader: telemetry.NewReader(db)}
	result := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
	if len(result.Items) != 1 {
		t.Fatalf("expected the corrupt row to still be listed, got %#v", result)
	}
	item := result.Items[0]
	if item.DeviceID != "device-7" || item.ReportedAtMS != 6000 || item.CycleID != "cycle-corrupt" {
		t.Fatalf("expected the envelope's attribution to survive a corrupt payload, got %#v", item)
	}
	if item.TriggerSource != "" || item.Cursor != 0 ||
		item.PreviousOutcome != nil || item.PreviousElapsedMS != nil || item.PreviousErrorFingerprint != nil {
		t.Fatalf("expected the unreadable payload values to stay absent, got %#v", item)
	}
}

// assertSyncDiagReportsMatch compares the bound reports against the kind
// projection's reports field by field.
func assertSyncDiagReportsMatch(t *testing.T, items []contracts.DeviceSyncDiagnosticReport, core []telemetry.CycleReport) {
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
			t.Fatalf("report %d nullable values differ: got %#v want %#v", index, items[index], core[index])
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
	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: db, newSyncDiagReader: telemetry.NewReader})

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

	app := &App{newSyncDiagReader: telemetry.NewReader}
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
// TestConfigureEventReaderSurvivesAnUnusableBridgeHandle: telemetry.NewReader
// probes device_telemetry_events on construction, and database/sql panics
// rather than erroring on a bare, unopened handle. The best-effort read path
// must degrade with exactly one operator warning, never abort the boot.
func TestConfigureSyncDiagReaderSurvivesAnUnusableBridgeHandle(t *testing.T) {
	t.Parallel()

	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: &sql.DB{}, newSyncDiagReader: telemetry.NewReader})

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

	app := &App{bridgeDB: &sql.DB{}, newSyncDiagReader: telemetry.NewReader}

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
	app := &App{newSyncDiagReader: func(*sql.DB) *telemetry.Reader {
		seamCalled = true
		return telemetry.NewReader(nil)
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
	store := syncDiagTestStore(db)
	for i := range 150 {
		seedSyncDiagReport(t, store, fmt.Sprintf("diag-limit-%d", i), int64(1000+i), "device-1", nil, nil)
	}
	app := &App{bridgeDB: db, syncDiagReader: telemetry.NewReader(db)}

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

// TestSyncDiagReaderDegradesWithoutTheTable asserts the reader the desktop
// wiring hands to the binding reports an absent table as unavailable and
// answers List with the observability unavailable envelope, never a raw SQL
// error the binding would have to absorb.
func TestSyncDiagReaderDegradesWithoutTheTable(t *testing.T) {
	t.Parallel()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "tableless.db"))
	if err != nil {
		t.Fatalf("open table-less sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	reader := telemetry.NewReader(db)
	if reader.Available() {
		t.Fatal("expected an absent table to leave the reader unavailable")
	}
	events, err := reader.List(context.Background(), telemetry.ReportQuery{Kind: telemetry.KindCycleReport, DeviceID: "device-1"})
	if err == nil {
		t.Fatalf("expected an unavailable error for an absent table, got %#v", events)
	}
	assertSyncDiagUnavailableEnvelope(t, err)
}

// TestSyncDiagNilReaderListDegradesWithoutPanicking asserts a nil reader
// degrades to the unavailable envelope rather than panicking, since the
// desktop binding can run against an app whose reader was never wired.
func TestSyncDiagNilReaderListDegradesWithoutPanicking(t *testing.T) {
	t.Parallel()

	var reader *telemetry.Reader
	_, err := reader.List(context.Background(), telemetry.ReportQuery{})
	if err == nil {
		t.Fatal("expected an unavailable error from a nil reader")
	}
	assertSyncDiagUnavailableEnvelope(t, err)
}

// assertSyncDiagUnavailableEnvelope fails unless err is the observability
// unavailable envelope the reader degrades with.
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
