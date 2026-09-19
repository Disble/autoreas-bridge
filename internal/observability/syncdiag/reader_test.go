package syncdiag

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/observability/obserr"
)

// insertFixture inserts one full record fixture with an overridable device id
// through the real write path.
func insertFixture(t *testing.T, store *Store, cycleID string, reportedAtMS int64, deviceID string) {
	t.Helper()
	record := fullRecordFixture(cycleID, reportedAtMS)
	record.DeviceID = deviceID
	if _, err := store.InsertReport(context.Background(), record); err != nil {
		t.Fatalf("insert fixture %s: %v", cycleID, err)
	}
}

// assertUnavailableDiagnostic fails unless err is the observability
// unavailable envelope, not a bare error.
func assertUnavailableDiagnostic(t *testing.T, err error) {
	t.Helper()
	var unavailable obserr.Error
	if !errors.As(err, &unavailable) {
		t.Fatalf("expected an obserr unavailable envelope, got %v", err)
	}
	if unavailable.Code != "unavailable" {
		t.Fatalf("expected unavailable code, got %q", unavailable.Code)
	}
}

// TestListReturnsReportsNewestFirst asserts List orders by reported_at_ms
// descending regardless of insertion order.
func TestListReturnsReportsNewestFirst(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	store := NewStore(db, StoreConfig{})
	insertFixture(t, store, "reader-old", 1000, "device-1")
	insertFixture(t, store, "reader-mid", 2000, "device-1")
	insertFixture(t, store, "reader-new", 3000, "device-1")

	reader := NewReader(db)
	reports, err := reader.List(context.Background(), ReportQuery{})
	if err != nil {
		t.Fatalf("list reports: %v", err)
	}

	want := []string{"reader-new", "reader-mid", "reader-old"}
	if len(reports) != len(want) {
		t.Fatalf("expected %d reports, got %d (%#v)", len(want), len(reports), reports)
	}
	for index, report := range reports {
		if report.CycleID != want[index] {
			t.Fatalf("expected newest-first order %v, got %#v", want, reports)
		}
	}
}

// TestListDevicePredicateFiltersInSQL asserts a populated DeviceID restricts
// the page to that device while an empty DeviceID returns every device.
func TestListDevicePredicateFiltersInSQL(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	store := NewStore(db, StoreConfig{})
	insertFixture(t, store, "filter-device-1", 1000, "device-1")
	insertFixture(t, store, "filter-device-2", 2000, "device-2")
	insertFixture(t, store, "filter-device-1b", 3000, "device-1")

	reader := NewReader(db)

	filtered, err := reader.List(context.Background(), ReportQuery{DeviceID: "device-1"})
	if err != nil {
		t.Fatalf("list by device: %v", err)
	}
	if len(filtered) != 2 {
		t.Fatalf("expected only device-1's 2 reports, got %#v", filtered)
	}
	for _, report := range filtered {
		if report.DeviceID != "device-1" {
			t.Fatalf("expected every report to belong to device-1, got %#v", filtered)
		}
	}

	everything, err := reader.List(context.Background(), ReportQuery{})
	if err != nil {
		t.Fatalf("list without device: %v", err)
	}
	if len(everything) != 3 {
		t.Fatalf("expected an empty DeviceID to apply no device predicate, got %#v", everything)
	}
}

// TestListAppliesDefaultLimitAndHardCeiling seeds more rows than both bounds
// and asserts the returned counts as literals, not the production symbols:
// asserting against a constant a test exists to pin would let a mutated
// constant silently shift the assertion along with the behavior.
func TestListAppliesDefaultLimitAndHardCeiling(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	seedDiagnosticsRows(t, db, 150, 0)
	reader := NewReader(db)
	ctx := context.Background()

	defaulted, err := reader.List(ctx, ReportQuery{})
	if err != nil {
		t.Fatalf("list with zero limit: %v", err)
	}
	if len(defaulted) != 25 {
		t.Fatalf("expected a zero Limit to return the default 25 rows, got %d", len(defaulted))
	}

	ceilinged, err := reader.List(ctx, ReportQuery{Limit: 150})
	if err != nil {
		t.Fatalf("list with oversized limit: %v", err)
	}
	if len(ceilinged) != 100 {
		t.Fatalf("expected an oversized Limit to clamp to 100 rows, got %d", len(ceilinged))
	}

	single, err := reader.List(ctx, ReportQuery{Limit: 1})
	if err != nil {
		t.Fatalf("list with limit 1: %v", err)
	}
	if len(single) != 1 {
		t.Fatalf("expected a positive Limit of 1 to return exactly 1 row, got %d", len(single))
	}
	if single[0].CycleID != "seed-149" {
		t.Fatalf("expected the single-row page to hold the newest report, got %#v", single)
	}

	negative, err := reader.List(ctx, ReportQuery{Limit: -3})
	if err != nil {
		t.Fatalf("list with negative limit: %v", err)
	}
	if len(negative) != 25 {
		t.Fatalf("expected a negative Limit to return the default 25 rows, got %d", len(negative))
	}
}

// TestListNilReaderDegradesToUnavailableEnvelope asserts a nil *Reader
// degrades to the observability unavailable envelope instead of panicking on
// the nil receiver -- the degrade gate the desktop wiring relies on when
// startup never wired a reader.
func TestListNilReaderDegradesToUnavailableEnvelope(t *testing.T) {
	t.Parallel()

	var reader *Reader
	reports, err := reader.List(context.Background(), ReportQuery{DeviceID: "device-1"})
	if err == nil {
		t.Fatalf("expected an unavailable error from a nil reader, got %#v", reports)
	}
	assertUnavailableDiagnostic(t, err)
}

// TestListAbsentTableReturnsUnavailableEvenWithDeviceFilter asserts a
// database without the table yields the observability unavailable envelope
// rather than an empty slice, and that a device predicate cannot bypass the
// availability gate.
func TestListAbsentTableReturnsUnavailableEvenWithDeviceFilter(t *testing.T) {
	t.Parallel()

	reader := NewReader(openSyncDiagTestDB(t))
	ctx := context.Background()
	if reader.Available() {
		t.Fatalf("expected Available to report false when device_sync_diagnostics is absent")
	}

	for name, query := range map[string]ReportQuery{
		"no device filter":   {},
		"with device filter": {DeviceID: "device-1"},
		"with limit too":     {DeviceID: "device-1", Limit: 10},
	} {
		reports, err := reader.List(ctx, query)
		if err == nil {
			t.Fatalf("%s: expected an error for an absent table, got %#v", name, reports)
		}
		assertUnavailableDiagnostic(t, err)
	}
}

// TestListHardCeilingBoundaryIsInclusiveOnTheExactMax pins both sides of the
// maxReportLimit boundary through the package symbols, never literals: a
// request for exactly maxReportLimit rows must not be clamped downwards, and
// a request one above it must return exactly maxReportLimit rows.
func TestListHardCeilingBoundaryIsInclusiveOnTheExactMax(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	seedDiagnosticsRows(t, db, maxReportLimit, 0)
	reader := NewReader(db)
	ctx := context.Background()

	exact, err := reader.List(ctx, ReportQuery{Limit: maxReportLimit})
	if err != nil {
		t.Fatalf("list with a Limit of exactly maxReportLimit: %v", err)
	}
	if len(exact) != maxReportLimit {
		t.Fatalf("expected a Limit of exactly maxReportLimit to return %d rows unclamped, got %d", maxReportLimit, len(exact))
	}

	above, err := reader.List(ctx, ReportQuery{Limit: maxReportLimit + 1})
	if err != nil {
		t.Fatalf("list with a Limit one above maxReportLimit: %v", err)
	}
	if len(above) != maxReportLimit {
		t.Fatalf("expected a Limit one above maxReportLimit to clamp to %d rows, got %d", maxReportLimit, len(above))
	}
}

// TestListNilOptionalsRoundTripAsNil asserts an absent degraded marker and
// an absent previous-cycle object round-trip as nil pointers, never as zero
// values, while a fully populated report round-trips every pointer's value.
func TestListNilOptionalsRoundTripAsNil(t *testing.T) {
	t.Parallel()

	db := openSyncDiagStoreTestDB(t)
	store := NewStore(db, StoreConfig{})

	bare := fullRecordFixture("reader-bare", 1000)
	bare.Degraded = nil
	bare.PreviousCycle = nil
	if _, err := store.InsertReport(context.Background(), bare); err != nil {
		t.Fatalf("insert bare fixture: %v", err)
	}
	if _, err := store.InsertReport(context.Background(), fullRecordFixture("reader-full", 2000)); err != nil {
		t.Fatalf("insert full fixture: %v", err)
	}

	reader := NewReader(db)
	reports, err := reader.List(context.Background(), ReportQuery{})
	if err != nil {
		t.Fatalf("list reports: %v", err)
	}

	var bareReport, fullReport *Report
	for index := range reports {
		switch reports[index].CycleID {
		case "reader-bare":
			bareReport = &reports[index]
		case "reader-full":
			fullReport = &reports[index]
		}
	}
	if bareReport == nil || fullReport == nil {
		t.Fatalf("expected both seeded reports back, got %#v", reports)
	}
	assertBareReportRoundTripsNil(t, bareReport)
	assertFullReportRoundTripsPointers(t, fullReport)
}

// assertBareReportRoundTripsNil fails unless every optional column of the
// bare report is a nil pointer, never a zero value.
func assertBareReportRoundTripsNil(t *testing.T, bareReport *Report) {
	t.Helper()

	if bareReport.Degraded != nil {
		t.Fatalf("expected nil Degraded, got %#v", bareReport.Degraded)
	}
	if bareReport.PreviousOutcome != nil || bareReport.PreviousElapsedMS != nil || bareReport.PreviousErrorFingerprint != nil {
		t.Fatalf("expected all previous-cycle pointers nil, got %#v", bareReport)
	}
}

// assertFullReportRoundTripsPointers fails unless the fully populated
// report round-trips every optional pointer's exact stored value.
func assertFullReportRoundTripsPointers(t *testing.T, fullReport *Report) {
	t.Helper()

	assertNullableStringValue(t, "Degraded", fullReport.Degraded, "events")
	assertNullableStringValue(t, "PreviousOutcome", fullReport.PreviousOutcome, "completed")
	assertNullableStringValue(t, "PreviousErrorFingerprint", fullReport.PreviousErrorFingerprint, "3f2a91b0")
	if fullReport.PreviousElapsedMS == nil || *fullReport.PreviousElapsedMS != 500 {
		t.Fatalf("expected PreviousElapsedMS to round-trip as 500, got %#v", fullReport.PreviousElapsedMS)
	}
}

// assertNullableStringValue fails unless the named nullable column came back
// non-nil with exactly the expected value.
func assertNullableStringValue(t *testing.T, name string, got *string, want string) {
	t.Helper()

	if got == nil || *got != want {
		t.Fatalf("expected %s to round-trip as %q, got %#v", name, want, got)
	}
}
