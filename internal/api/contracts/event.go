package contracts

// Note: like capture.go, this package cannot import the reader package it
// mirrors -- the DTOs below are a local, English-tagged mirror of
// internal/observability/eventlog's EventFilters/EventRecord/EventSearchPage
// and EventSummaryResult. app_runtime_events.go maps the reader's types into
// these at the binding boundary, which is what keeps the desktop read path a
// second adapter over the one query engine rather than a second engine.

// EventFilterQuery is the shared filter set for both runtime-event reads,
// mirroring eventlog.EventFilters. A zero value carries no filters; every
// populated field composes with the others as a conjunction (AND).
type EventFilterQuery struct {
	Domain        string
	Level         string
	EventType     string
	CorrelationID string
	EntityID      string
	Text          string
	StartMS       *int64
	EndMS         *int64
}

// EventQuery is one page request for SearchRuntimeEvents: the filters plus
// keyset pagination. A zero Limit takes the reader's default page size.
type EventQuery struct {
	Limit   int
	Cursor  string
	Filters EventFilterQuery
}

// EventRow is one persisted runtime event as the frontend consumes it.
type EventRow struct {
	ID            int64          `json:"id"`
	OccurredAtMS  int64          `json:"occurredAtMs"`
	Domain        string         `json:"domain"`
	Level         string         `json:"level"`
	Message       string         `json:"message"`
	CorrelationID string         `json:"correlationId,omitempty"`
	EntityID      string         `json:"entityId,omitempty"`
	EventType     string         `json:"eventType,omitempty"`
	DurationMS    int64          `json:"durationMs,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// EventPage is one newest-first SearchRuntimeEvents page. Items is an empty,
// never-nil slice on every outcome so the frontend can range over it without
// a nil check.
//
// Available and Degraded are deliberately distinct: Available false means this
// database predates the runtime-event table (an expected, explainable state),
// while Degraded true means the read itself failed. Collapsing them would
// report a broken query as an old database.
type EventPage struct {
	Items                []EventRow `json:"items"`
	NextCursor           string     `json:"nextCursor,omitempty"`
	AppliedLimit         int        `json:"appliedLimit"`
	MalformedRowsSkipped int        `json:"malformedRowsSkipped"`
	WarningCount         int        `json:"warningCount"`
	Available            bool       `json:"available"`
	Degraded             bool       `json:"degraded"`
}

// EventCountGroup is one aggregation bucket for a summary grouping dimension.
type EventCountGroup struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

// EventSample is one bounded newest-matching-event sample in a summary result.
type EventSample struct {
	ID           int64  `json:"id"`
	OccurredAtMS int64  `json:"occurredAtMs"`
	Domain       string `json:"domain"`
	Level        string `json:"level"`
	Message      string `json:"message"`
}

// EventSummary is one SummarizeRuntimeEvents result: three independent
// groupings plus the newest matching samples. All four slices are never-nil,
// so an empty match is a zeroed aggregation rather than a null. Available and
// Degraded carry the same distinction documented on EventPage.
type EventSummary struct {
	ByDomain    []EventCountGroup `json:"byDomain"`
	ByLevel     []EventCountGroup `json:"byLevel"`
	ByEventType []EventCountGroup `json:"byEventType"`
	Samples     []EventSample     `json:"samples"`
	Available   bool              `json:"available"`
	Degraded    bool              `json:"degraded"`
}
