package telemetry

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"slices"
	"testing"

	"autoreas-bridge/internal/observability/obserr"
)

// readerTestStore builds the real write path the reader is the counterpart
// of: both sides go through the same declared vocabulary, so a kind the
// registry does not declare cannot be seeded and then silently never read.
func readerTestStore(db *sql.DB) *Store {
	return NewStore(db, StoreConfig{Registry: DefaultRegistry()})
}

// insertReaderEvents writes already-validated events through the real store
// so the rows a read test inspects are the rows production writes.
func insertReaderEvents(t *testing.T, store *Store, events ...Event) {
	t.Helper()

	for _, event := range events {
		outcome, err := store.Insert(context.Background(), event)
		if err != nil {
			t.Fatalf("insert %s/%s: %v", event.Kind, event.Validated.EventID, err)
		}
		if outcome != Stored {
			t.Fatalf("expected %s/%s to be Stored, got %v", event.Kind, event.Validated.EventID, outcome)
		}
	}
}

// TestReaderListReturnsEnvelopeFieldsNewestFirst pins the envelope read: the
// page is newest-first by receipt time, and every column the envelope owns --
// including the two nullable ones -- round-trips as stored rather than as a
// zero value.
func TestReaderListReturnsEnvelopeFieldsNewestFirst(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	observedAt := int64(1_700_000_000_000)
	degraded := "events"
	insertReaderEvents(t, readerTestStore(db),
		Event{DeviceID: "device-1", ReportedAtMS: 1000, Kind: KindCycleReport,
			Validated: Validated{EventID: "oldest", Payload: []byte(`{"cycle_id":"oldest"}`)}},
		Event{DeviceID: "device-2", ReportedAtMS: 2000, Kind: KindCycleReport,
			Validated: Validated{EventID: "newest", ObservedAtMS: &observedAt, Degraded: &degraded, Payload: []byte(`{"cycle_id":"newest"}`)}},
		Event{DeviceID: "device-1", ReportedAtMS: 1500, Kind: KindCycleReport,
			Validated: Validated{EventID: "middle", Payload: []byte(`{"cycle_id":"middle"}`)}},
	)

	reader := NewReader(db)
	if !reader.Available() {
		t.Fatal("expected the probe to report an applied device_telemetry_events schema as available")
	}
	page, err := reader.List(context.Background(), ReportQuery{})
	if err != nil {
		t.Fatalf("list events: %v", err)
	}

	gotIDs := make([]string, 0, len(page))
	for _, event := range page {
		gotIDs = append(gotIDs, event.EventID)
	}
	if want := []string{"newest", "middle", "oldest"}; !slices.Equal(gotIDs, want) {
		t.Fatalf("expected newest-first ordering %v, got %v", want, gotIDs)
	}

	newest := page[0]
	if newest.DeviceID != "device-2" || newest.Kind != KindCycleReport || newest.ReportedAtMS != 2000 {
		t.Fatalf("expected the envelope identity columns to round-trip, got %#v", newest)
	}
	if newest.ObservedAtMS == nil || *newest.ObservedAtMS != observedAt {
		t.Fatalf("expected observed_at_ms to round-trip, got %v", newest.ObservedAtMS)
	}
	if newest.Degraded == nil || *newest.Degraded != degraded {
		t.Fatalf("expected degraded to round-trip, got %v", newest.Degraded)
	}
	if !bytes.Equal(newest.Payload, []byte(`{"cycle_id":"newest"}`)) {
		t.Fatalf("expected the stored payload verbatim, got %q", newest.Payload)
	}

	// The oldest row was written with neither nullable column, so both must
	// arrive as nil -- an absent fidelity signal is not the empty string.
	oldest := page[2]
	if oldest.ObservedAtMS != nil || oldest.Degraded != nil {
		t.Fatalf("expected absent nullable columns to stay nil, got %#v", oldest)
	}
}

// TestReaderListKindPredicateIsolatesOneKind asserts the envelope read can be
// scoped to one kind, and that an unscoped query is the one that returns
// every kind. One table holds every kind, so this predicate is the only thing
// keeping one kind's rows out of another kind's read surface.
func TestReaderListKindPredicateIsolatesOneKind(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	insertReaderEvents(t, readerTestStore(db),
		Event{DeviceID: "device-1", ReportedAtMS: 1000, Kind: KindCycleReport,
			Validated: Validated{EventID: "cycle-1", Payload: []byte(`{"cycle_id":"cycle-1"}`)}},
		// The payload is deliberately minimal: this test is about the kind
		// predicate, not about episode_action's own stored contract.
		Event{DeviceID: "device-1", ReportedAtMS: 2000, Kind: KindEpisodeAction,
			Validated: Validated{EventID: "observation-1", Payload: []byte(`{"action":"episode_plus_one"}`)}},
	)

	reader := NewReader(db)
	for _, tc := range []struct {
		name string
		kind KindName
		want []string
	}{
		{"cycle_report only", KindCycleReport, []string{"cycle-1"}},
		{"episode_action only", KindEpisodeAction, []string{"observation-1"}},
		{"unscoped returns every kind", "", []string{"observation-1", "cycle-1"}},
	} {
		page, err := reader.List(context.Background(), ReportQuery{Kind: tc.kind})
		if err != nil {
			t.Fatalf("%s: list events: %v", tc.name, err)
		}
		gotIDs := make([]string, 0, len(page))
		for _, event := range page {
			gotIDs = append(gotIDs, event.EventID)
		}
		if !slices.Equal(gotIDs, tc.want) {
			t.Fatalf("%s: expected %v, got %v", tc.name, tc.want, gotIDs)
		}
	}
}

// TestReaderListDevicePredicateRestrictsThePageAndEmptyOneDoesNot asserts the
// device predicate is applied only when a device is named: an empty DeviceID
// is "every device", never "the empty-named device".
func TestReaderListDevicePredicateRestrictsThePageAndEmptyOneDoesNot(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	insertReaderEvents(t, readerTestStore(db),
		Event{DeviceID: "device-1", ReportedAtMS: 1000, Kind: KindCycleReport, Validated: Validated{EventID: "one"}},
		Event{DeviceID: "device-2", ReportedAtMS: 2000, Kind: KindCycleReport, Validated: Validated{EventID: "two"}},
		Event{DeviceID: "device-1", ReportedAtMS: 3000, Kind: KindCycleReport, Validated: Validated{EventID: "three"}},
	)

	reader := NewReader(db)
	scoped, err := reader.List(context.Background(), ReportQuery{DeviceID: "device-1"})
	if err != nil {
		t.Fatalf("scoped list: %v", err)
	}
	if len(scoped) != 2 || scoped[0].EventID != "three" {
		t.Fatalf("expected device-1's 2 newest-first events, got %#v", scoped)
	}
	unscoped, err := reader.List(context.Background(), ReportQuery{})
	if err != nil {
		t.Fatalf("unscoped list: %v", err)
	}
	if len(unscoped) != 3 {
		t.Fatalf("expected an empty device predicate to apply no filter, got %d events", len(unscoped))
	}
}

// TestReaderListClampsTheLimitInSQL asserts the page bound is a reader
// contract, not a caller courtesy: a caller above the ceiling gets exactly
// the ceiling, and a caller that names no limit gets the default. Both are
// asserted as returned page sizes over a table holding more rows than either
// bound, so a post-query truncation of a larger result set is indistinguishable
// -- and equally correct -- from a SQL LIMIT.
func TestReaderListClampsTheLimitInSQL(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	seedEvents(t, db, KindCycleReport, 150, 1000)
	reader := NewReader(db)

	for _, tc := range []struct {
		name  string
		limit int
		want  int
	}{
		{"above the ceiling is clamped", 150, 100},
		{"the ceiling is returned as asked", 100, 100},
		{"an ordinary bound is honoured", 10, 10},
		// One is the boundary that separates "zero or negative means the default"
		// from "a caller asking for fewer rows than the default gets exactly what
		// it asked for". Without it, widening the first guard by a single step
		// (limit <= 0 to limit <= 1) changes this reader's answer for limit 1 and
		// no test notices: every other case here is either above that boundary or
		// already inside the default branch.
		{"a bound below the default is honoured", 1, 1},
		{"zero means the default", 0, 25},
		{"negative means the default", -1, 25},
	} {
		page, err := reader.List(context.Background(), ReportQuery{Limit: tc.limit})
		if err != nil {
			t.Fatalf("%s: list events: %v", tc.name, err)
		}
		if len(page) != tc.want {
			t.Fatalf("%s: expected %d rows for limit %d, got %d", tc.name, tc.want, tc.limit, len(page))
		}
	}
}

// TestReaderDegradesWithoutTheTable asserts a database predating the table is
// reported as unavailable instead of failing the read: the probe answers
// false and every query returns the observability unavailable envelope, which
// the desktop binding already knows how to degrade.
func TestReaderDegradesWithoutTheTable(t *testing.T) {
	t.Parallel()

	reader := NewReader(openTelemetryTestDB(t))
	if reader.Available() {
		t.Fatal("expected a schema-less database to leave the reader unavailable")
	}
	page, err := reader.List(context.Background(), ReportQuery{DeviceID: "device-1"})
	if err == nil {
		t.Fatalf("expected an unavailable error for an absent table, got %#v", page)
	}
	assertReaderUnavailableEnvelope(t, err)
}

// TestReaderListDegradesOnANilReader asserts a reader that was never wired
// degrades rather than panicking, since the desktop binding and the kind
// projection can both run against a nil reader.
func TestReaderListDegradesOnANilReader(t *testing.T) {
	t.Parallel()

	var reader *Reader
	page, err := reader.List(context.Background(), ReportQuery{})
	if err == nil {
		t.Fatalf("expected an unavailable error from a nil reader, got %#v", page)
	}
	assertReaderUnavailableEnvelope(t, err)
}

// assertReaderUnavailableEnvelope fails unless err is the observability
// unavailable envelope the reader degrades with.
func assertReaderUnavailableEnvelope(t *testing.T, err error) {
	t.Helper()

	var unavailable obserr.Error
	if !errors.As(err, &unavailable) {
		t.Fatalf("expected an obserr unavailable envelope, got %v", err)
	}
	if unavailable.Code != "unavailable" {
		t.Fatalf("expected the unavailable code, got %q", unavailable.Code)
	}
}
