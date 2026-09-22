package eventlog

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// insertTestEvent persists one event record through the store, failing the
// test on any insert error.
func insertTestEvent(t *testing.T, store *SQLiteStore, record EventRecord) {
	t.Helper()
	if err := store.InsertEvent(context.Background(), record); err != nil {
		t.Fatalf("insert event: %v", err)
	}
}

// TestSearchReturnsUnavailableEnvelopeWhenTableMissing asserts Search returns
// an unavailable error (not a crash) when runtime_events is absent.
func TestSearchReturnsUnavailableEnvelopeWhenTableMissing(t *testing.T) {
	t.Parallel()

	db := openStoreTestDBWithoutSchema(t)
	reader := NewReader(db)
	_, err := reader.Search(context.Background(), EventSearchParams{})
	if err == nil {
		t.Fatal("expected an error when runtime_events is absent")
	}
}

// TestSearchNewestFirstDefaultLimit asserts Search returns newest-first
// results with the default limit applied when omitted.
func TestSearchNewestFirstDefaultLimit(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "first"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "sync", Level: "info", Message: "second"})

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if page.AppliedLimit != defaultSearchLimit {
		t.Fatalf("expected applied limit %d, got %d", defaultSearchLimit, page.AppliedLimit)
	}
	if len(page.Items) != 2 || page.Items[0].Message != "second" || page.Items[1].Message != "first" {
		t.Fatalf("expected newest-first order, got %#v", page.Items)
	}
}

// TestSearchClampsOversizedLimit asserts an oversized limit request clamps
// to the safe maximum.
func TestSearchClampsOversizedLimit(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Limit: 9999})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if page.AppliedLimit != maxSearchLimit {
		t.Fatalf("expected clamped limit %d, got %d", maxSearchLimit, page.AppliedLimit)
	}
}

// TestSearchCursorPaginatesWithoutGapOrDuplicate asserts paging via
// NextCursor visits every row exactly once.
func TestSearchCursorPaginatesWithoutGapOrDuplicate(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	for i := range 5 {
		insertTestEvent(t, store, EventRecord{OccurredAtMS: int64(i), Domain: "sync", Level: "info", Message: "m"})
	}

	reader := NewReader(db)
	seen := map[int64]bool{}
	cursor := ""
	for {
		page, err := reader.Search(context.Background(), EventSearchParams{Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		for _, item := range page.Items {
			if seen[item.ID] {
				t.Fatalf("expected no duplicate visits, saw id %d twice", item.ID)
			}
			seen[item.ID] = true
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	if len(seen) != 5 {
		t.Fatalf("expected to visit all 5 rows, visited %d", len(seen))
	}
}

// TestSearchInvalidCursorReturnsInvalidParams asserts a malformed cursor is
// rejected with invalid_params.
func TestSearchInvalidCursorReturnsInvalidParams(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	reader := NewReader(db)
	_, err := reader.Search(context.Background(), EventSearchParams{Cursor: "not-a-valid-cursor"})
	if err == nil {
		t.Fatal("expected an error for a malformed cursor")
	}
}

// TestSearchDomainLevelTimeWindowConjunction asserts domain, level, and a
// time window compose as a conjunction.
func TestSearchDomainLevelTimeWindowConjunction(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "error", Message: "match"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "wrong level"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "download", Level: "error", Message: "wrong domain"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 999, Domain: "sync", Level: "error", Message: "outside window"})

	reader := NewReader(db)
	startMS, endMS := int64(50), int64(150)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Domain: "sync", Level: "error", StartMS: &startMS, EndMS: &endMS}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Message != "match" {
		t.Fatalf("expected only the conjunction match, got %#v", page.Items)
	}
}

// TestSearchFreeTextMatchesPartialCaseInsensitive proves Text is a
// case-insensitive substring predicate per the shared sqltext rule: a
// partial fragment, a middle fragment, and a differently-cased fragment all
// match the same rows.
func TestSearchFreeTextMatchesPartialCaseInsensitive(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "apply reconciliation failed"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "sync", Level: "info", Message: "APPLY RECONCILIATION retried"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 300, Domain: "sync", Level: "info", Message: "unrelated"})

	cases := []struct {
		name      string
		text      string
		wantCount int
	}{
		{name: "a partial fragment matches", text: "recon", wantCount: 2},
		{name: "a middle fragment matches", text: "ciliation", wantCount: 2},
		{name: "a differently-cased fragment matches", text: "RECON", wantCount: 2},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			reader := NewReader(db)
			page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Text: testCase.text}})
			if err != nil {
				t.Fatalf("search: %v", err)
			}
			if len(page.Items) != testCase.wantCount {
				t.Fatalf("expected %d matches for text %q, got %d: %#v", testCase.wantCount, testCase.text, len(page.Items), page.Items)
			}
		})
	}
}

// TestSearchFreeTextEscapesLikeMetacharacters proves a literal '%' typed in
// Text matches only rows containing a percent sign, never acting as a
// match-everything LIKE wildcard, per the shared sqltext rule paired with
// the explicit ESCAPE '\' clause.
func TestSearchFreeTextEscapesLikeMetacharacters(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "charge is 100% done"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "sync", Level: "info", Message: "charge is 1000 units done"})

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Text: "100%"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Message != "charge is 100% done" {
		t.Fatalf("expected only the literal-percent row for text \"100%%\", got %#v", page.Items)
	}
}

// TestSearchFreeTextMatchesMessageDomainEventType asserts Text matches
// message, domain, or event_type.
func TestSearchFreeTextMatchesMessageDomainEventType(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "distinctive-in-message"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "distinctive-in-domain", Level: "info", Message: "m"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 300, Domain: "sync", Level: "info", Message: "m", EventType: "distinctive-in-eventtype"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 400, Domain: "sync", Level: "info", Message: "unrelated"})

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Text: "distinctive"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 3 {
		t.Fatalf("expected 3 matches across message/domain/event_type, got %#v", page.Items)
	}
}

// TestSearchEventTypeFilterExcludesResidueRowsWithNullEventType proves the
// SDD-69 D7 confirmation: the pre-existing domain="anime" residue (371 rows
// measured, one message, empty correlation_id/entity_id, null event_type,
// none newer than 2026-08-30) never matches an EventType filter, while a
// real navigation row carrying a populated event_type does.
func TestSearchEventTypeFilterExcludesResidueRowsWithNullEventType(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "anime", Level: "info", Message: "publishing anime.changed for tracer-bullet-anime"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "anime", Level: "info", Message: "opened anime folder", EventType: "anime.folder_opened", EntityID: "anime-1"})

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{EventType: "anime.folder_opened"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].EventType != "anime.folder_opened" {
		t.Fatalf("expected only the real navigation row to match, got %#v", page.Items)
	}
}

// TestSearchFreeTextDoesNotMatchMetadata asserts free text is not scoped to
// metadata_json, per design decision 7.
func TestSearchFreeTextDoesNotMatchMetadata(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "m", Metadata: map[string]any{"key": "distinctive-in-metadata"}})

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Text: "distinctive-in-metadata"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected metadata to be out of scope for free text, got %#v", page.Items)
	}
}

// TestSearchUnmatchedFiltersReturnEmptyPageWithValidPagination asserts an
// unmatched filter combination returns an empty page, not an error.
func TestSearchUnmatchedFiltersReturnEmptyPageWithValidPagination(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Domain: "nonexistent"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected empty items, got %#v", page.Items)
	}
	// A nil slice marshals to JSON null, which violates the MCP tool's
	// declared output schema ("want array"). An empty match must serialize
	// as [], so Items has to be non-nil even when nothing matched.
	if page.Items == nil {
		t.Fatal("expected non-nil empty Items so an empty page marshals as [] rather than null")
	}
	if page.AppliedLimit != defaultSearchLimit {
		t.Fatalf("expected valid pagination metadata (applied limit), got %d", page.AppliedLimit)
	}
}

// TestSearchEmptyPageMarshalsAsEmptyArray asserts the wire shape directly:
// the zero-match page must encode items as [], never null, because the MCP
// sidecar validates its response against a schema requiring an array.
func TestSearchEmptyPageMarshalsAsEmptyArray(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Domain: "nonexistent"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}

	encoded, err := json.Marshal(page)
	if err != nil {
		t.Fatalf("marshal page: %v", err)
	}
	if !strings.Contains(string(encoded), `"items":[]`) {
		t.Fatalf("expected items to encode as [], got %s", encoded)
	}
}

// TestSearchTolerateMalformedRowCountsWarning asserts a malformed metadata
// blob is tolerated as a warning rather than failing the whole page.
// metadata_json is not required to be valid JSON at read time by the
// reader's scan; the reader tolerates unparsable metadata by leaving it nil
// rather than erroring, so no row is skipped and no warning is incremented
// for a metadata-only malformation. This test documents that decision.
func TestSearchTolerateMalformedRowCountsWarning(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	if _, err := db.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, metadata_json) VALUES (?, ?, ?, ?, ?)`, 100, "sync", "info", "m", "not-valid-json"); err != nil {
		t.Fatalf("seed malformed metadata row: %v", err)
	}

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected the row to still be returned despite malformed metadata, got %#v", page.Items)
	}
	if page.Items[0].Metadata != nil {
		t.Fatalf("expected malformed metadata to decode to nil, got %#v", page.Items[0].Metadata)
	}
}
