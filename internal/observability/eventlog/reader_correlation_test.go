package eventlog

import (
	"context"
	"testing"
)

// TestEventsByCorrelationReturnsMatchesNewestFirst asserts matching events
// for a correlation id are returned newest-first.
func TestEventsByCorrelationReturnsMatchesNewestFirst(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "older", CorrelationID: "corr-1"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "sync", Level: "info", Message: "newer", CorrelationID: "corr-1"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 150, Domain: "sync", Level: "info", Message: "other", CorrelationID: "corr-2"})

	reader := NewReader(db)
	got, err := reader.EventsByCorrelation(context.Background(), "corr-1", maxTimelineItems)
	if err != nil {
		t.Fatalf("events by correlation: %v", err)
	}
	if len(got) != 2 || got[0].Message != "newer" || got[1].Message != "older" {
		t.Fatalf("expected newest-first matches for corr-1, got %#v", got)
	}
}

// TestEventsByCorrelationUnknownIDReturnsEmpty asserts an unknown
// correlation id returns an empty (not error) result.
func TestEventsByCorrelationUnknownIDReturnsEmpty(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	reader := NewReader(db)
	got, err := reader.EventsByCorrelation(context.Background(), "does-not-exist", maxTimelineItems)
	if err != nil {
		t.Fatalf("events by correlation: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty result for unknown correlation id, got %#v", got)
	}
}

// TestEventsWithoutCorrelationIDStillSearchableByDomain asserts an event
// persisted without a correlation id remains independently searchable
// through Search by domain.
func TestEventsWithoutCorrelationIDStillSearchableByDomain(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "no correlation"})

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), EventSearchParams{Filters: EventFilters{Domain: "sync"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Message != "no correlation" {
		t.Fatalf("expected the correlation-less event to remain searchable, got %#v", page.Items)
	}
}
