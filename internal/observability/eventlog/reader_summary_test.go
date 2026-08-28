package eventlog

import (
	"context"
	"testing"
)

// TestSummaryCountsByDomainLevelEventType asserts the summary aggregates
// counts grouped by domain, level, and event type.
func TestSummaryCountsByDomainLevelEventType(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "info", Message: "a", EventType: "reconcile"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "sync", Level: "error", Message: "b", EventType: "reconcile"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 300, Domain: "download", Level: "info", Message: "c"})

	reader := NewReader(db)
	result, err := reader.Summary(context.Background(), EventFilters{})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if !result.Available {
		t.Fatal("expected Available true")
	}
	assertGroupCount(t, result.ByDomain, "sync", 2)
	assertGroupCount(t, result.ByDomain, "download", 1)
	assertGroupCount(t, result.ByLevel, "info", 2)
	assertGroupCount(t, result.ByLevel, "error", 1)
	assertGroupCount(t, result.ByEventType, "reconcile", 2)
}

// TestSummarySamplesBounded asserts samples are bounded to the configured cap.
func TestSummarySamplesBounded(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	for i := range defaultSummarySampleCap + 3 {
		insertTestEvent(t, store, EventRecord{OccurredAtMS: int64(i), Domain: "sync", Level: "info", Message: "m"})
	}

	reader := NewReader(db)
	result, err := reader.Summary(context.Background(), EventFilters{})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if len(result.Samples) != defaultSummarySampleCap {
		t.Fatalf("expected %d samples, got %d", defaultSummarySampleCap, len(result.Samples))
	}
}

// TestSummaryScopedByFilters asserts the summary respects the shared
// whereClause filters.
func TestSummaryScopedByFilters(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db, EventStoreConfig{})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 100, Domain: "sync", Level: "error", Message: "match"})
	insertTestEvent(t, store, EventRecord{OccurredAtMS: 200, Domain: "download", Level: "error", Message: "excluded"})

	reader := NewReader(db)
	result, err := reader.Summary(context.Background(), EventFilters{Domain: "sync"})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if len(result.ByDomain) != 1 || result.ByDomain[0].Key != "sync" {
		t.Fatalf("expected summary scoped to domain sync, got %#v", result.ByDomain)
	}
}

// TestSummaryEmptyMatchReturnsZeroedAggregation asserts an empty match
// returns a zeroed (never error, never nil-slice) aggregation.
func TestSummaryEmptyMatchReturnsZeroedAggregation(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	reader := NewReader(db)
	result, err := reader.Summary(context.Background(), EventFilters{Domain: "nonexistent"})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if result.ByDomain == nil || result.ByLevel == nil || result.ByEventType == nil {
		t.Fatalf("expected non-nil empty slices, got %#v", result)
	}
	if len(result.ByDomain) != 0 || len(result.ByLevel) != 0 || len(result.ByEventType) != 0 {
		t.Fatalf("expected zeroed aggregation, got %#v", result)
	}
	if result.Samples == nil || len(result.Samples) != 0 {
		t.Fatalf("expected Samples: [], got %#v", result.Samples)
	}
	if !result.Available {
		t.Fatal("expected Available true even for an empty match (the table exists)")
	}
}

// assertGroupCount asserts that the group keyed by key reports want as its
// count, failing the test when the key is absent or the count differs.
func assertGroupCount(t *testing.T, groups []EventCountGroup, key string, want int) {
	t.Helper()
	for _, group := range groups {
		if group.Key == key {
			if group.Count != want {
				t.Fatalf("expected group %q count %d, got %d", key, want, group.Count)
			}
			return
		}
	}
	t.Fatalf("expected group %q to be present in %#v", key, groups)
}
