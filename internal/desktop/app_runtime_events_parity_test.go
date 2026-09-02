package desktop

import (
	"context"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/eventlog"
)

// TestSearchRuntimeEventsReturnsEventsPersistedBeforeARestart is the
// restart-survival criterion: an event written by one process must be readable
// by the next, with every field intact. This is what separates the persisted
// read path from the in-memory ring buffer, whose history begins at process
// start. The first handle is closed before the second opens, so the row is
// genuinely read back from disk rather than from a live connection.
func TestSearchRuntimeEventsReturnsEventsPersistedBeforeARestart(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "restart.db")

	before := openRuntimeEventsTestDBAt(t, dbPath)
	seedRuntimeEvent(t, before, eventlog.EventRecord{
		OccurredAtMS:  1755000000000,
		Domain:        "download",
		Level:         "error",
		Message:       "survives the restart",
		CorrelationID: "run-13",
		EntityID:      "anime-3",
		EventType:     "download.failed",
		DurationMS:    900,
	})
	if err := before.Close(); err != nil {
		t.Fatalf("close the pre-restart handle: %v", err)
	}

	after := openRuntimeEventsTestDBAt(t, dbPath)
	app := &App{bridgeDB: after, eventReader: eventlog.NewReader(after)}

	page := app.SearchRuntimeEvents(contracts.EventQuery{Limit: 10})

	if len(page.Items) != 1 {
		t.Fatalf("expected the persisted event to survive the restart, got %#v", page.Items)
	}
	row := page.Items[0]
	if row.Domain != "download" || row.Level != "error" {
		t.Fatalf("expected domain download / level error after the restart, got %q / %q", row.Domain, row.Level)
	}
	if row.Message != "survives the restart" {
		t.Fatalf("expected the message intact after the restart, got %q", row.Message)
	}
	if row.OccurredAtMS != 1755000000000 {
		t.Fatalf("expected occurredAtMs 1755000000000 after the restart, got %d", row.OccurredAtMS)
	}
	if row.CorrelationID != "run-13" || row.EntityID != "anime-3" {
		t.Fatalf("expected correlation run-13 / entity anime-3 after the restart, got %q / %q", row.CorrelationID, row.EntityID)
	}
	if row.EventType != "download.failed" {
		t.Fatalf("expected event type download.failed after the restart, got %q", row.EventType)
	}
}

// TestSearchRuntimeEventsAgreesWithTheReaderTheMCPDelegatesTo is the parity
// criterion. It asserts against eventlog.Reader itself -- the exact engine the
// MCP's search_events tool delegates to -- rather than against a
// re-implementation of its ordering, so the desktop surface and the agent
// cannot silently drift apart.
func TestSearchRuntimeEventsAgreesWithTheReaderTheMCPDelegatesTo(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 1000, Domain: "sync", Level: "error", Message: "sync error one"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 2000, Domain: "download", Level: "error", Message: "other domain"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 3000, Domain: "sync", Level: "info", Message: "other level"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 4000, Domain: "sync", Level: "error", Message: "sync error two"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 5000, Domain: "sync", Level: "error", Message: "sync error three"})

	reader := eventlog.NewReader(db)
	app := &App{bridgeDB: db, eventReader: reader}

	expected, err := reader.Search(context.Background(), eventlog.EventSearchParams{
		Limit:   2,
		Filters: eventlog.EventFilters{Domain: "sync", Level: "error"},
	})
	if err != nil {
		t.Fatalf("reader search: %v", err)
	}
	if len(expected.Items) != 2 {
		t.Fatalf("expected the fixture to exercise a bounded page, got %#v", expected.Items)
	}

	got := app.SearchRuntimeEvents(contracts.EventQuery{
		Limit:   2,
		Filters: contracts.EventFilterQuery{Domain: "sync", Level: "error"},
	})

	if len(got.Items) != len(expected.Items) {
		t.Fatalf("expected %d rows to match the reader, got %d", len(expected.Items), len(got.Items))
	}
	for index, want := range expected.Items {
		row := got.Items[index]
		if row.ID != want.ID || row.OccurredAtMS != want.OccurredAtMS || row.Message != want.Message {
			t.Fatalf("row %d diverges from the reader: got %#v want %#v", index, row, want)
		}
	}
	if got.NextCursor != expected.NextCursor {
		t.Fatalf("expected the reader's cursor %q, got %q", expected.NextCursor, got.NextCursor)
	}
	if got.AppliedLimit != expected.AppliedLimit {
		t.Fatalf("expected the reader's applied limit %d, got %d", expected.AppliedLimit, got.AppliedLimit)
	}
}

// TestSummarizeRuntimeEventsAgreesWithTheReaderTheMCPDelegatesTo is the
// aggregation half of the same parity criterion: the bound summary must report
// exactly what summary_events reports over the same data.
func TestSummarizeRuntimeEventsAgreesWithTheReaderTheMCPDelegatesTo(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedSummaryFixture(t, db)

	reader := eventlog.NewReader(db)
	app := &App{bridgeDB: db, eventReader: reader}

	expected, err := reader.Summary(context.Background(), eventlog.EventFilters{})
	if err != nil {
		t.Fatalf("reader summary: %v", err)
	}
	if len(expected.ByDomain) != 2 {
		t.Fatalf("expected the fixture to produce two domain buckets, got %#v", expected.ByDomain)
	}

	got := app.SummarizeRuntimeEvents(contracts.EventFilterQuery{})

	if len(got.ByDomain) != len(expected.ByDomain) {
		t.Fatalf("expected %d domain buckets, got %d", len(expected.ByDomain), len(got.ByDomain))
	}
	for index, want := range expected.ByDomain {
		if got.ByDomain[index].Key != want.Key || got.ByDomain[index].Count != want.Count {
			t.Fatalf("domain bucket %d diverges: got %#v want %#v", index, got.ByDomain[index], want)
		}
	}
	if len(got.Samples) != len(expected.Samples) {
		t.Fatalf("expected %d samples, got %d", len(expected.Samples), len(got.Samples))
	}
	for index, want := range expected.Samples {
		if got.Samples[index].ID != want.ID || got.Samples[index].Message != want.Message {
			t.Fatalf("sample %d diverges: got %#v want %#v", index, got.Samples[index], want)
		}
	}
}
