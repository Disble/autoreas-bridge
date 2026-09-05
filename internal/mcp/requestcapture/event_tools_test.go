package requestcapture

import (
	"context"
	"database/sql"
	"testing"

	"autoreas-bridge/internal/observability/eventlog"
	obs "autoreas-bridge/internal/observability/requestcapture"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// stubEventReader is a test double for EventReader recording the last
// SearchEvents/SummaryEvents call for filter-passthrough assertions.
type stubEventReader struct {
	available    bool
	page         eventlog.EventSearchPage
	summary      eventlog.EventSummaryResult
	timeline     []eventlog.EventRecord
	lastParams   eventlog.EventSearchParams
	lastFilters  eventlog.EventFilters
	lastCorrelID string
}

func (s *stubEventReader) SearchEvents(_ context.Context, params eventlog.EventSearchParams) (eventlog.EventSearchPage, error) {
	s.lastParams = params
	return s.page, nil
}

func (s *stubEventReader) SummaryEvents(_ context.Context, filters eventlog.EventFilters) (eventlog.EventSummaryResult, error) {
	s.lastFilters = filters
	return s.summary, nil
}

func (s *stubEventReader) EventsByCorrelation(_ context.Context, correlationID string, _ int) ([]eventlog.EventRecord, error) {
	s.lastCorrelID = correlationID
	return s.timeline, nil
}

func (s *stubEventReader) EventsAvailable() bool { return s.available }

// TestSearchEventsAppliesDefaultAndMaxLimit asserts the tool double-clamps
// the limit to the default (25) when omitted and to the max (100) when
// oversized.
func TestSearchEventsAppliesDefaultAndMaxLimit(t *testing.T) {
	t.Parallel()

	reader := &stubEventReader{available: true}
	if _, err := searchEvents(context.Background(), reader, SearchEventsInput{}); err != nil {
		t.Fatalf("search events: %v", err)
	}
	if reader.lastParams.Limit != 25 {
		t.Fatalf("expected default limit 25, got %d", reader.lastParams.Limit)
	}

	if _, err := searchEvents(context.Background(), reader, SearchEventsInput{Limit: 9999}); err != nil {
		t.Fatalf("search events: %v", err)
	}
	if reader.lastParams.Limit != 100 {
		t.Fatalf("expected clamped limit 100, got %d", reader.lastParams.Limit)
	}
}

// TestSearchEventsPassesEveryFilterThrough asserts every input filter field
// reaches the reader unchanged.
func TestSearchEventsPassesEveryFilterThrough(t *testing.T) {
	t.Parallel()

	startMS, endMS := int64(100), int64(200)
	input := SearchEventsInput{
		Limit: 10, Cursor: "cur", Domain: "sync", Level: "error", EventType: "reconcile",
		CorrelationID: "corr-1", EntityID: "anime-1", Text: "boom", StartMS: &startMS, EndMS: &endMS,
	}
	reader := &stubEventReader{available: true}
	if _, err := searchEvents(context.Background(), reader, input); err != nil {
		t.Fatalf("search events: %v", err)
	}
	got := reader.lastParams
	if got.Cursor != "cur" || got.Filters.Domain != "sync" || got.Filters.Level != "error" ||
		got.Filters.EventType != "reconcile" || got.Filters.CorrelationID != "corr-1" ||
		got.Filters.EntityID != "anime-1" || got.Filters.Text != "boom" ||
		got.Filters.StartMS == nil || *got.Filters.StartMS != startMS ||
		got.Filters.EndMS == nil || *got.Filters.EndMS != endMS {
		t.Fatalf("expected every filter forwarded, got %#v", got)
	}
}

// TestCorrelationTimelineMergesRequestsAndEvents asserts the timeline merges
// capture-side and event-side matches for one correlation id.
func TestCorrelationTimelineMergesRequestsAndEvents(t *testing.T) {
	t.Parallel()

	captureReader := stubToolReader{page: obsSearchPageWithOneItem("corr-1")}
	eventReader := &stubEventReader{available: true, timeline: []eventlog.EventRecord{{ID: 1, Message: "m"}}}

	result, err := getCorrelationTimeline(context.Background(), captureReader, eventReader, GetCorrelationTimelineInput{CorrelationID: "corr-1"})
	if err != nil {
		t.Fatalf("correlation timeline: %v", err)
	}
	if len(result.Requests) != 1 || result.Requests[0].RequestID != "corr-1" {
		t.Fatalf("expected 1 merged request, got %#v", result.Requests)
	}
	if len(result.Events) != 1 {
		t.Fatalf("expected 1 merged event, got %#v", result.Events)
	}
	if !result.EventsAvailable {
		t.Fatal("expected events_available true")
	}
	if eventReader.lastCorrelID != "corr-1" {
		t.Fatalf("expected correlation id forwarded, got %q", eventReader.lastCorrelID)
	}
}

// TestCorrelationTimelineMatchesCaptureCorrelationEnvelope asserts the
// capture-side join reaches the Correlations envelope's unique identifiers,
// not just the capture's own RequestID. This is the real-world case: the
// capture middleware mints RequestID as a local uuid (capture_middleware.go)
// that never reaches domain code, so a runtime event's CorrelationID is
// never a RequestID. Matching only RequestID makes every real timeline
// return an empty capture side while still reporting success.
func TestCorrelationTimelineMatchesCaptureCorrelationEnvelope(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name          string
		correlationID string
		correlations  obs.Correlations
	}{
		{
			name:          "changelog id",
			correlationID: "4271",
			correlations:  obs.Correlations{ChangelogIDs: []int64{4271}},
		},
		{
			name:          "activity id",
			correlationID: "88",
			correlations:  obs.Correlations{ActivityIDs: []int64{88}},
		},
		{
			name:          "conflict id",
			correlationID: "conflict-a1",
			correlations:  obs.Correlations{ConflictIDs: []string{"conflict-a1"}},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			page := obsSearchPageWithOneItem("uuid-local-to-middleware")
			page.Items[0].Correlations = testCase.correlations
			captureReader := stubToolReader{page: page}
			eventReader := &stubEventReader{available: true}

			result, err := getCorrelationTimeline(context.Background(), captureReader, eventReader, GetCorrelationTimelineInput{CorrelationID: testCase.correlationID})
			if err != nil {
				t.Fatalf("correlation timeline: %v", err)
			}
			if len(result.Requests) != 1 {
				t.Fatalf("expected the capture matched via its correlation envelope, got %#v", result.Requests)
			}
		})
	}
}

// TestCorrelationTimelineIgnoresLooseCaptureFields asserts the capture-side
// join does NOT match on non-identifying fields. Device names, operation
// verbs, and outcomes repeat across unrelated requests, so matching them
// would return a timeline of coincidences.
func TestCorrelationTimelineIgnoresLooseCaptureFields(t *testing.T) {
	t.Parallel()

	page := obsSearchPageWithOneItem("uuid-local-to-middleware")
	page.Items[0].Device = obs.DeviceIdentity{DeviceID: "device-1", Name: "pixel"}
	page.Items[0].Correlations = obs.Correlations{
		OperationRefs: []obs.OperationRef{{AnimeID: "anime-7", Operation: "patch", Outcome: "applied"}},
	}
	captureReader := stubToolReader{page: page}

	for _, loose := range []string{"pixel", "device-1", "patch", "applied"} {
		result, err := getCorrelationTimeline(context.Background(), captureReader, &stubEventReader{available: true}, GetCorrelationTimelineInput{CorrelationID: loose})
		if err != nil {
			t.Fatalf("correlation timeline: %v", err)
		}
		if len(result.Requests) != 0 {
			t.Fatalf("expected %q not to correlate, got %#v", loose, result.Requests)
		}
	}
}

// TestCorrelationTimelineUnknownIDReturnsEmptyResult asserts an unknown
// correlation id returns a valid empty result, not an error.
func TestCorrelationTimelineUnknownIDReturnsEmptyResult(t *testing.T) {
	t.Parallel()

	captureReader := stubToolReader{}
	eventReader := &stubEventReader{available: true}

	result, err := getCorrelationTimeline(context.Background(), captureReader, eventReader, GetCorrelationTimelineInput{CorrelationID: "does-not-exist"})
	if err != nil {
		t.Fatalf("correlation timeline: %v", err)
	}
	if len(result.Requests) != 0 || len(result.Events) != 0 {
		t.Fatalf("expected empty result, got %#v", result)
	}
}

// TestCorrelationTimelineDegradesWhenEventsTableMissing asserts the timeline
// still returns capture-side matches with events_available=false when the
// events table is absent.
func TestCorrelationTimelineDegradesWhenEventsTableMissing(t *testing.T) {
	t.Parallel()

	captureReader := stubToolReader{page: obsSearchPageWithOneItem("corr-1")}
	eventReader := &stubEventReader{available: false}

	result, err := getCorrelationTimeline(context.Background(), captureReader, eventReader, GetCorrelationTimelineInput{CorrelationID: "corr-1"})
	if err != nil {
		t.Fatalf("correlation timeline: %v", err)
	}
	if result.EventsAvailable {
		t.Fatal("expected events_available false when the events table is absent")
	}
	if len(result.Events) != 0 {
		t.Fatalf("expected no events when unavailable, got %#v", result.Events)
	}
	if len(result.Requests) != 1 {
		t.Fatalf("expected capture-side matches to survive missing events table, got %#v", result.Requests)
	}
}

// TestSummaryEventsEmptyZeroed asserts summary_events returns a zeroed
// aggregation for an empty match rather than an error.
func TestSummaryEventsEmptyZeroed(t *testing.T) {
	t.Parallel()

	reader := &stubEventReader{available: true, summary: eventlog.EventSummaryResult{
		ByDomain: []eventlog.EventCountGroup{}, ByLevel: []eventlog.EventCountGroup{}, ByEventType: []eventlog.EventCountGroup{},
		Samples: []eventlog.EventSample{}, Available: true,
	}}
	result, err := summaryEvents(context.Background(), reader, SummaryEventsInput{Domain: "nonexistent"})
	if err != nil {
		t.Fatalf("summary events: %v", err)
	}
	if len(result.ByDomain) != 0 || len(result.ByLevel) != 0 || len(result.ByEventType) != 0 || len(result.Samples) != 0 {
		t.Fatalf("expected zeroed aggregation, got %#v", result)
	}
	if reader.lastFilters.Domain != "nonexistent" {
		t.Fatalf("expected filter forwarded, got %#v", reader.lastFilters)
	}
}

// TestEventToolsAreReadOnly asserts row counts across the tables this package
// may legitimately name -- runtime_events and request_captures -- are
// unchanged after every event-tool invocation with every input shape. The
// activity-owned table is deliberately absent: tools/checkarchitecture forbids
// any reference to it outside internal/activity, which enforces the
// "untouched" guarantee deterministically and more strongly than a row count.
func TestEventToolsAreReadOnly(t *testing.T) {
	t.Parallel()

	path := openToolTestDB(t)
	captureReader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = captureReader.Close() }()
	eventReader := &stubEventReader{available: true}

	before := countAllRows(t, path)

	if _, err := searchEvents(context.Background(), eventReader, SearchEventsInput{Text: "x"}); err != nil {
		t.Fatalf("search events: %v", err)
	}
	if _, err := summaryEvents(context.Background(), eventReader, SummaryEventsInput{Domain: "x"}); err != nil {
		t.Fatalf("summary events: %v", err)
	}
	if _, err := getCorrelationTimeline(context.Background(), captureReader, eventReader, GetCorrelationTimelineInput{CorrelationID: "x"}); err != nil {
		t.Fatalf("correlation timeline: %v", err)
	}

	after := countAllRows(t, path)
	for table, count := range before {
		if after[table] != count {
			t.Fatalf("expected %s row count unchanged, before=%d after=%d", table, count, after[table])
		}
	}
}

// obsSearchPageWithOneItem builds a one-item capture search page for tests.
func obsSearchPageWithOneItem(requestID string) obs.SearchPage {
	page := obs.SearchPage{AppliedLimit: 25}
	item := obs.NewCaptureRecord("patch", "device-1")
	item.RequestID = requestID
	page.Items = append(page.Items, item)
	return page
}

// countAllRows counts rows across the tables the read-only invariant covers
// and this package may name: runtime_events and request_captures.
func countAllRows(t *testing.T, path string) map[string]int {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open db for row count: %v", err)
	}
	defer func() { _ = db.Close() }()
	counts := map[string]int{}
	for _, table := range []string{"runtime_events", "request_captures"} {
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		counts[table] = count
	}
	return counts
}
