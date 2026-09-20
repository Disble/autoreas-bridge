package desktop

import (
	"slices"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/readcap"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/syncdiag"
)

// wiredObservabilityFactsApp builds an App whose observability read path is
// fully wired over one temporary bridge database, so the facts binding takes
// its reporting path instead of the degraded one.
func wiredObservabilityFactsApp(t *testing.T) *App {
	t.Helper()

	db := captureAppTestDB(t)

	return &App{
		bridgeDB:       db,
		captureReader:  requestcapture.NewReader(db),
		eventReader:    eventlog.NewReader(db),
		syncDiagReader: syncdiag.NewReader(db),
	}
}

// TestGetObservabilityFactsReportsParityFromTheManifest pins the binding's
// parity block to the desktop declaration and the readcap catalog: the
// catalog total, the exposed names, and each exclusion with its registered
// reason.
func TestGetObservabilityFactsReportsParityFromTheManifest(t *testing.T) {
	t.Parallel()

	facts := wiredObservabilityFactsApp(t).GetObservabilityFacts()

	if facts.Degraded {
		t.Fatal("expected a wired app to report undegraded facts")
	}
	if got, want := facts.Parity.CatalogTotal, len(readcap.Names()); got != want {
		t.Fatalf("expected catalog total %d, got %d", want, got)
	}
	if got, want := facts.Parity.ExposedCapabilities, ObservabilityCapabilities(); !slices.Equal(got, want) {
		t.Fatalf("exposed capabilities differ: got %#v want %#v", got, want)
	}

	excluded := ObservabilityExcludedCapabilities()
	if got, want := len(facts.Parity.ExcludedCapabilities), len(excluded); got != want {
		t.Fatalf("expected %d exclusions, got %#v", want, facts.Parity.ExcludedCapabilities)
	}
	for _, exclusion := range facts.Parity.ExcludedCapabilities {
		reason, found := excluded[exclusion.Name]
		if !found {
			t.Fatalf("unexpected exclusion %q", exclusion.Name)
		}
		if exclusion.Reason != reason {
			t.Fatalf("exclusion %q reason differs: got %q want %q", exclusion.Name, exclusion.Reason, reason)
		}
	}
}

// TestGetObservabilityFactsReportsEachStoreRetention pins each reported
// retention limit and sample cap both to its owning package's accessor and to
// its literal value: the accessor comparison kills a binding that reports a
// different store's limit, and the literal kills an accessor that stops
// returning its documented cap.
func TestGetObservabilityFactsReportsEachStoreRetention(t *testing.T) {
	t.Parallel()

	facts := wiredObservabilityFactsApp(t).GetObservabilityFacts()

	for _, tc := range []struct {
		name     string
		reported int
		accessor int
		want     int
	}{
		{"capture rows", facts.Retention.CaptureRows, requestcapture.RetentionLimit(), 5000},
		{"event rows", facts.Retention.EventRows, eventlog.RowCap(), 20000},
		{"sync diagnostic rows", facts.Retention.SyncDiagnosticRows, syncdiag.RetentionLimit(), 5000},
		{"event summary samples", facts.SampleCaps.EventSamples, eventlog.SummarySampleCap(), 5},
		{"capture summary error samples", facts.SampleCaps.CaptureErrorSamples, requestcapture.SummaryErrorSampleLimit(), 5},
	} {
		if tc.reported != tc.accessor {
			t.Fatalf("%s: expected the binding to report the owning accessor's %d, got %d", tc.name, tc.accessor, tc.reported)
		}
		if tc.reported != tc.want {
			t.Fatalf("%s: expected retention limit %d, got %d", tc.name, tc.want, tc.reported)
		}
	}
}

// TestGetObservabilityFactsDegradesOnUnwiredReadPath proves an unwired
// observability read path degrades to a zeroed, non-nil result instead of
// panicking, one row per dependency the binding requires.
func TestGetObservabilityFactsDegradesOnUnwiredReadPath(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	readers := struct {
		capture  *requestcapture.Reader
		event    *eventlog.Reader
		syncDiag *syncdiag.Reader
	}{
		capture:  requestcapture.NewReader(db),
		event:    eventlog.NewReader(db),
		syncDiag: syncdiag.NewReader(db),
	}

	for _, tc := range []struct {
		name string
		app  *App
	}{
		{
			name: "nil bridge database",
			app:  &App{captureReader: readers.capture, eventReader: readers.event, syncDiagReader: readers.syncDiag},
		},
		{
			name: "nil capture reader",
			app:  &App{bridgeDB: db, eventReader: readers.event, syncDiagReader: readers.syncDiag},
		},
		{
			name: "nil event reader",
			app:  &App{bridgeDB: db, captureReader: readers.capture, syncDiagReader: readers.syncDiag},
		},
		{
			name: "nil sync diagnostics reader",
			app:  &App{bridgeDB: db, captureReader: readers.capture, eventReader: readers.event},
		},
	} {
		facts := tc.app.GetObservabilityFacts()

		if !facts.Degraded {
			t.Fatalf("%s: expected a degraded result, got %#v", tc.name, facts)
		}
		if facts.Parity.ExposedCapabilities == nil || len(facts.Parity.ExposedCapabilities) != 0 {
			t.Fatalf("%s: expected a non-nil empty exposed list, got %#v", tc.name, facts.Parity.ExposedCapabilities)
		}
		if facts.Parity.ExcludedCapabilities == nil || len(facts.Parity.ExcludedCapabilities) != 0 {
			t.Fatalf("%s: expected a non-nil empty excluded list, got %#v", tc.name, facts.Parity.ExcludedCapabilities)
		}
		if facts.Parity.CatalogTotal != 0 {
			t.Fatalf("%s: expected a zeroed catalog total, got %d", tc.name, facts.Parity.CatalogTotal)
		}
		if facts.Retention != (contracts.ObservabilityRetentionLimits{}) {
			t.Fatalf("%s: expected zeroed retention limits, got %#v", tc.name, facts.Retention)
		}
		if facts.SampleCaps != (contracts.ObservabilitySampleCaps{}) {
			t.Fatalf("%s: expected zeroed sample caps, got %#v", tc.name, facts.SampleCaps)
		}
	}
}
