package main

import (
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/eventlog"
)

// TestSearchRuntimeEventsNilReaderDegradesWithNeverNilItems asserts an unwired
// reader degrades instead of panicking, and still hands the frontend a slice it
// can range over -- the same never-panic contract ListCaptureTransactions has.
func TestSearchRuntimeEventsNilReaderDegradesWithNeverNilItems(t *testing.T) {
	t.Parallel()
	app := &App{}

	page := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 10})

	if !page.Degraded {
		t.Fatal("expected a nil eventReader to degrade")
	}
	if page.Available {
		t.Fatal("expected an unwired reader to report the store as unavailable")
	}
	if page.Items == nil {
		t.Fatal("expected a nil-safe (non-nil) empty Items slice")
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected an empty page, got %#v", page.Items)
	}
}

// TestSearchRuntimeEventsMissingTableIsUnavailableNotDegraded asserts the two
// failure states stay distinct: a database predating runtime_events is an
// expected, explainable absence, not a broken read. Collapsing them would
// report a failing query as an old database.
func TestSearchRuntimeEventsMissingTableIsUnavailableNotDegraded(t *testing.T) {
	t.Parallel()
	db := openDBWithoutRuntimeEventsTable(t)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	page := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 10})

	if page.Available {
		t.Fatal("expected a database without runtime_events to report Available false")
	}
	if page.Degraded {
		t.Fatal("expected a missing table to be an absence, not a degraded read")
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected no rows from an absent table, got %#v", page.Items)
	}
}

// TestSearchRuntimeEventsQueryErrorDegradesWhileStoreStaysAvailable asserts a
// failing read is reported as degraded while the store itself is still
// correctly reported as present -- the other half of the distinction above.
func TestSearchRuntimeEventsQueryErrorDegradesWhileStoreStaysAvailable(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	page := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 10, Cursor: "not-a-cursor"})

	if !page.Degraded {
		t.Fatal("expected an undecodable cursor to degrade the read")
	}
	if !page.Available {
		t.Fatal("expected a failed query to leave the store reported as available")
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected no rows from a failed query, got %#v", page.Items)
	}
}

// TestSearchRuntimeEventsMapsEveryRowFieldIncludingMetadata asserts the
// reader-to-DTO mapping carries every persisted field, so the surface can render
// domain, level, message, timestamp, correlation, entity and event type after a
// restart rather than a partially-populated row.
func TestSearchRuntimeEventsMapsEveryRowFieldIncludingMetadata(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedRuntimeEvent(t, db, eventlog.EventRecord{
		OccurredAtMS:  1755000000000,
		Domain:        "download",
		Level:         "warn",
		Message:       "run finished with skips",
		CorrelationID: "run-42",
		EntityID:      "anime-7",
		EventType:     "download.run-finished",
		DurationMS:    1250,
		Metadata:      map[string]any{"skipped": "3"},
	})
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	page := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 10})

	if len(page.Items) != 1 {
		t.Fatalf("expected 1 item, got %d (%#v)", len(page.Items), page.Items)
	}
	row := page.Items[0]
	if row.ID == 0 {
		t.Fatal("expected the persisted surrogate id to be carried")
	}
	if row.OccurredAtMS != 1755000000000 {
		t.Fatalf("expected occurredAtMs 1755000000000, got %d", row.OccurredAtMS)
	}
	if row.Domain != "download" || row.Level != "warn" {
		t.Fatalf("expected domain download / level warn, got %q / %q", row.Domain, row.Level)
	}
	if row.Message != "run finished with skips" {
		t.Fatalf("expected the message to round-trip, got %q", row.Message)
	}
	if row.CorrelationID != "run-42" || row.EntityID != "anime-7" {
		t.Fatalf("expected correlation run-42 / entity anime-7, got %q / %q", row.CorrelationID, row.EntityID)
	}
	if row.EventType != "download.run-finished" {
		t.Fatalf("expected event type download.run-finished, got %q", row.EventType)
	}
	if row.DurationMS != 1250 {
		t.Fatalf("expected durationMs 1250, got %d", row.DurationMS)
	}
	if row.Metadata["skipped"] != "3" {
		t.Fatalf("expected metadata skipped=3, got %#v", row.Metadata)
	}
}

// TestSearchRuntimeEventsComposesPopulatedFiltersAsConjunction asserts a domain,
// a level and a time window supplied together narrow to their intersection
// rather than their union.
func TestSearchRuntimeEventsComposesPopulatedFiltersAsConjunction(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 1000, Domain: "sync", Level: "error", Message: "all three match"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 2000, Domain: "sync", Level: "info", Message: "wrong level"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 3000, Domain: "download", Level: "error", Message: "wrong domain"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 9000, Domain: "sync", Level: "error", Message: "outside the window"})
	windowEnd := int64(5000)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	page := app.SearchRuntimeEvents(contracts.EventQuery{
		Limit:   10,
		Filters: contracts.EventFilterQuery{Domain: "sync", Level: "error", EndMS: &windowEnd},
	})

	if got := runtimeEventMessages(page.Items); len(got) != 1 || got[0] != "all three match" {
		t.Fatalf("expected only the event matching all three filters, got %#v", got)
	}
}

// TestSearchRuntimeEventsCarriesFilterFieldsTheReaderSupports asserts the
// remaining filter fields reach the reader rather than being silently dropped
// by the DTO mapping.
func TestSearchRuntimeEventsCarriesFilterFieldsTheReaderSupports(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedRuntimeEvent(t, db, eventlog.EventRecord{
		OccurredAtMS: 1000, Domain: "sync", Level: "info", Message: "wanted",
		CorrelationID: "run-1", EntityID: "anime-1", EventType: "sync.applied",
	})
	seedRuntimeEvent(t, db, eventlog.EventRecord{
		OccurredAtMS: 2000, Domain: "sync", Level: "info", Message: "other",
		CorrelationID: "run-2", EntityID: "anime-2", EventType: "sync.rejected",
	})
	windowStart := int64(500)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	cases := []struct {
		name    string
		filters contracts.EventFilterQuery
	}{
		{"correlation id", contracts.EventFilterQuery{CorrelationID: "run-1"}},
		{"entity id", contracts.EventFilterQuery{EntityID: "anime-1"}},
		{"event type", contracts.EventFilterQuery{EventType: "sync.applied"}},
		{"free text", contracts.EventFilterQuery{Text: "wanted"}},
		{"start of window", contracts.EventFilterQuery{StartMS: &windowStart, EventType: "sync.applied"}},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			page := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 10, Filters: testCase.filters})
			if got := runtimeEventMessages(page.Items); len(got) != 1 || got[0] != "wanted" {
				t.Fatalf("expected the %s filter to select only the wanted event, got %#v", testCase.name, got)
			}
		})
	}
}

// TestSearchRuntimeEventsIsNewestFirstAndCarriesLimitAndCursor asserts the page
// contract the rail depends on: newest-first order, the applied limit, and a
// continuation cursor that actually reaches the next-older rows.
func TestSearchRuntimeEventsIsNewestFirstAndCarriesLimitAndCursor(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 1000, Domain: "sync", Level: "info", Message: "oldest"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 2000, Domain: "sync", Level: "info", Message: "middle"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 3000, Domain: "sync", Level: "info", Message: "newest"})
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	first := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 2})

	if got := runtimeEventMessages(first.Items); len(got) != 2 || got[0] != "newest" || got[1] != "middle" {
		t.Fatalf("expected the two newest events in newest-first order, got %#v", got)
	}
	if first.AppliedLimit != 2 {
		t.Fatalf("expected appliedLimit 2, got %d", first.AppliedLimit)
	}
	if first.NextCursor == "" {
		t.Fatal("expected a continuation cursor while older events remain")
	}
	if !first.Available || first.Degraded {
		t.Fatalf("expected a populated page to be available and not degraded, got %#v", first)
	}

	second := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 2, Cursor: first.NextCursor})

	if got := runtimeEventMessages(second.Items); len(got) != 1 || got[0] != "oldest" {
		t.Fatalf("expected the cursor to reach the remaining older event, got %#v", got)
	}
	if second.NextCursor != "" {
		t.Fatalf("expected exhausted pagination to carry no cursor, got %q", second.NextCursor)
	}
}

// TestSearchRuntimeEventsNoMatchIsAnEmptyPageNotAnError asserts an unmatched
// filter set returns valid pagination metadata over zero rows, rather than an
// error or a degraded envelope that the surface would render as a fault.
func TestSearchRuntimeEventsNoMatchIsAnEmptyPageNotAnError(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 1000, Domain: "sync", Level: "info", Message: "present"})
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	page := app.SearchRuntimeEvents(contracts.EventQuery{
		Limit:   10,
		Filters: contracts.EventFilterQuery{Domain: "no-such-domain"},
	})

	if len(page.Items) != 0 {
		t.Fatalf("expected no rows for an unmatched domain, got %#v", page.Items)
	}
	if page.Degraded {
		t.Fatal("expected an unmatched filter to be an empty page, not a degraded read")
	}
	if !page.Available {
		t.Fatal("expected the store to stay reported as available for an unmatched filter")
	}
	if page.AppliedLimit != 10 {
		t.Fatalf("expected appliedLimit 10 on an empty page, got %d", page.AppliedLimit)
	}
}
