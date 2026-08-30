package main

import (
	"database/sql"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/eventlog"
)

// eventCountFor returns the count recorded for key in a summary dimension, and
// -1 when the dimension carries no such key, so an assertion can tell "counted
// zero" apart from "never grouped".
func eventCountFor(groups []contracts.EventCountGroup, key string) int {
	for _, group := range groups {
		if group.Key == key {
			return group.Count
		}
	}
	return -1
}

// seedSummaryFixture writes a spread of events across domains, levels and event
// types, so every grouping dimension has more than one bucket to distinguish.
func seedSummaryFixture(t *testing.T, db *sql.DB) {
	t.Helper()
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 1000, Domain: "sync", Level: "info", Message: "first", EventType: "sync.applied"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 2000, Domain: "sync", Level: "error", Message: "second", EventType: "sync.rejected"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 3000, Domain: "download", Level: "info", Message: "third", EventType: "sync.applied"})
	seedRuntimeEvent(t, db, eventlog.EventRecord{OccurredAtMS: 4000, Domain: "sync", Level: "info", Message: "fourth", EventType: "sync.applied"})
}

// TestSummarizeRuntimeEventsGroupsByEveryDimensionWithSamples asserts the one
// reader call returns all three independent groupings plus the newest samples:
// Slice A consumes ByDomain for the derived domain filter, the Overview surface
// consumes the rest, and neither needs a second aggregate binding.
func TestSummarizeRuntimeEventsGroupsByEveryDimensionWithSamples(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedSummaryFixture(t, db)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	summary := app.SummarizeRuntimeEvents(contracts.EventFilterQuery{})

	if got := eventCountFor(summary.ByDomain, "sync"); got != 3 {
		t.Fatalf("expected 3 sync events by domain, got %d (%#v)", got, summary.ByDomain)
	}
	if got := eventCountFor(summary.ByDomain, "download"); got != 1 {
		t.Fatalf("expected 1 download event by domain, got %d (%#v)", got, summary.ByDomain)
	}
	if got := eventCountFor(summary.ByLevel, "info"); got != 3 {
		t.Fatalf("expected 3 info events by level, got %d (%#v)", got, summary.ByLevel)
	}
	if got := eventCountFor(summary.ByLevel, "error"); got != 1 {
		t.Fatalf("expected 1 error event by level, got %d (%#v)", got, summary.ByLevel)
	}
	if got := eventCountFor(summary.ByEventType, "sync.applied"); got != 3 {
		t.Fatalf("expected 3 sync.applied events by event type, got %d (%#v)", got, summary.ByEventType)
	}
	if len(summary.Samples) != 4 {
		t.Fatalf("expected all 4 events as samples, got %d (%#v)", len(summary.Samples), summary.Samples)
	}
	if summary.Samples[0].Message != "fourth" {
		t.Fatalf("expected the newest event first among samples, got %q", summary.Samples[0].Message)
	}
	if summary.Samples[0].Domain != "sync" || summary.Samples[0].Level != "info" {
		t.Fatalf("expected the sample to carry domain/level, got %q / %q", summary.Samples[0].Domain, summary.Samples[0].Level)
	}
	if summary.Samples[0].ID == 0 || summary.Samples[0].OccurredAtMS != 4000 {
		t.Fatalf("expected the sample to carry its id and timestamp, got %#v", summary.Samples[0])
	}
	if !summary.Available || summary.Degraded {
		t.Fatalf("expected a populated summary to be available and not degraded, got %#v", summary)
	}
}

// TestSummarizeRuntimeEventsAppliesTheFilterSet asserts the aggregation is
// scoped by the same filter set the search binding accepts, rather than always
// reporting the whole table.
func TestSummarizeRuntimeEventsAppliesTheFilterSet(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedSummaryFixture(t, db)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	summary := app.SummarizeRuntimeEvents(contracts.EventFilterQuery{Level: "error"})

	if got := eventCountFor(summary.ByDomain, "sync"); got != 1 {
		t.Fatalf("expected the error filter to leave 1 sync event, got %d (%#v)", got, summary.ByDomain)
	}
	if got := eventCountFor(summary.ByDomain, "download"); got != -1 {
		t.Fatalf("expected no download bucket under the error filter, got %d (%#v)", got, summary.ByDomain)
	}
	if len(summary.Samples) != 1 || summary.Samples[0].Message != "second" {
		t.Fatalf("expected only the error event as a sample, got %#v", summary.Samples)
	}
}

// TestSummarizeRuntimeEventsNilReaderDegradesWithNeverNilSlices asserts an
// unwired reader is reported as degraded with all four slices non-nil, so the
// Overview surface never renders a fault as measured zero counts.
func TestSummarizeRuntimeEventsNilReaderDegradesWithNeverNilSlices(t *testing.T) {
	t.Parallel()
	app := &App{}

	summary := app.SummarizeRuntimeEvents(contracts.EventFilterQuery{})

	if !summary.Degraded {
		t.Fatal("expected a nil eventReader to degrade")
	}
	if summary.Available {
		t.Fatal("expected an unwired reader to report the store as unavailable")
	}
	if summary.ByDomain == nil || summary.ByLevel == nil || summary.ByEventType == nil || summary.Samples == nil {
		t.Fatalf("expected every summary slice to be non-nil, got %#v", summary)
	}
}

// TestSummarizeRuntimeEventsMissingTableIsUnavailableNotDegraded asserts the
// summary keeps the same absent-versus-broken distinction as the search page.
func TestSummarizeRuntimeEventsMissingTableIsUnavailableNotDegraded(t *testing.T) {
	t.Parallel()
	db := openDBWithoutRuntimeEventsTable(t)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	summary := app.SummarizeRuntimeEvents(contracts.EventFilterQuery{})

	if summary.Available {
		t.Fatal("expected a database without runtime_events to report Available false")
	}
	if summary.Degraded {
		t.Fatal("expected a missing table to be an absence, not a degraded read")
	}
	if len(summary.ByDomain) != 0 {
		t.Fatalf("expected no domain buckets from an absent table, got %#v", summary.ByDomain)
	}
}

// TestSummarizeRuntimeEventsEmptyMatchIsAZeroedAggregation asserts an unmatched
// filter set returns a zeroed aggregation that still reports the store as
// available -- an empty result is a measurement, not a fault.
func TestSummarizeRuntimeEventsEmptyMatchIsAZeroedAggregation(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	seedSummaryFixture(t, db)
	app := &App{bridgeDB: db, eventReader: eventlog.NewReader(db)}

	summary := app.SummarizeRuntimeEvents(contracts.EventFilterQuery{Domain: "no-such-domain"})

	if len(summary.ByDomain) != 0 || len(summary.ByLevel) != 0 || len(summary.Samples) != 0 {
		t.Fatalf("expected a zeroed aggregation for an unmatched filter, got %#v", summary)
	}
	if !summary.Available || summary.Degraded {
		t.Fatalf("expected an unmatched filter to stay available and not degraded, got %#v", summary)
	}
}

// TestRuntimeEventsAvailableReportsTheStorePresence asserts the disclosure
// signal the surface uses to explain an empty feed: present store, absent
// store, and an unwired reader each report distinctly.
func TestRuntimeEventsAvailableReportsTheStorePresence(t *testing.T) {
	t.Parallel()
	withTable := openRuntimeEventsTestDB(t)
	withoutTable := openDBWithoutRuntimeEventsTable(t)

	if got := (&App{bridgeDB: withTable, eventReader: eventlog.NewReader(withTable)}).RuntimeEventsAvailable(); !got {
		t.Fatal("expected a database carrying runtime_events to report available")
	}
	if got := (&App{bridgeDB: withoutTable, eventReader: eventlog.NewReader(withoutTable)}).RuntimeEventsAvailable(); got {
		t.Fatal("expected a database without runtime_events to report unavailable")
	}
	if got := (&App{}).RuntimeEventsAvailable(); got {
		t.Fatal("expected an unwired reader to report unavailable rather than panicking")
	}
}
