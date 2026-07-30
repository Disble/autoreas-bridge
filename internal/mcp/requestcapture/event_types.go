package requestcapture

import (
	"context"

	"autoreas-bridge/internal/observability/eventlog"
	obs "autoreas-bridge/internal/observability/requestcapture"
)

// SearchEventsInput carries pagination and optional server-side filters for
// the search_events tool. Every populated filter composes with the others
// as a conjunction (AND).
type SearchEventsInput struct {
	Limit         int    `json:"limit,omitempty"`
	Cursor        string `json:"cursor,omitempty"`
	Domain        string `json:"domain,omitempty"`
	Level         string `json:"level,omitempty"`
	EventType     string `json:"event_type,omitempty"`
	CorrelationID string `json:"correlation_id,omitempty"`
	EntityID      string `json:"entity_id,omitempty"`
	Text          string `json:"text,omitempty"`
	StartMS       *int64 `json:"start_ms,omitempty"`
	EndMS         *int64 `json:"end_ms,omitempty"`
}

// SummaryEventsInput carries the same optional filters as SearchEventsInput
// (no pagination) to scope the summary_events aggregation.
type SummaryEventsInput struct {
	Domain        string `json:"domain,omitempty"`
	Level         string `json:"level,omitempty"`
	EventType     string `json:"event_type,omitempty"`
	CorrelationID string `json:"correlation_id,omitempty"`
	EntityID      string `json:"entity_id,omitempty"`
	Text          string `json:"text,omitempty"`
	StartMS       *int64 `json:"start_ms,omitempty"`
	EndMS         *int64 `json:"end_ms,omitempty"`
}

// GetCorrelationTimelineInput carries the correlation id to resolve into a
// merged captured-request + persisted-event timeline.
type GetCorrelationTimelineInput struct {
	CorrelationID string `json:"correlation_id"`
}

// toEventFilters projects the input's shared filter fields into eventlog.EventFilters.
func (in SearchEventsInput) toEventFilters() eventlog.EventFilters {
	return eventlog.EventFilters{
		Domain: in.Domain, Level: in.Level, EventType: in.EventType,
		CorrelationID: in.CorrelationID, EntityID: in.EntityID, Text: in.Text,
		StartMS: in.StartMS, EndMS: in.EndMS,
	}
}

// toEventFilters projects the input's shared filter fields into eventlog.EventFilters.
func (in SummaryEventsInput) toEventFilters() eventlog.EventFilters {
	return eventlog.EventFilters{
		Domain: in.Domain, Level: in.Level, EventType: in.EventType,
		CorrelationID: in.CorrelationID, EntityID: in.EntityID, Text: in.Text,
		StartMS: in.StartMS, EndMS: in.EndMS,
	}
}

// SearchEventsResult is the newest-first page returned by search_events.
type SearchEventsResult = eventlog.EventSearchPage

// SummaryEventsResult is the grouped aggregation returned by summary_events.
type SummaryEventsResult = eventlog.EventSummaryResult

// CorrelationTimelineResult merges the captured-request and persisted-event
// sides of one correlation id into a single two-field envelope plus an
// availability flag for the event side (false when the sidecar is pointed
// at a bridge database that predates this change).
type CorrelationTimelineResult struct {
	Requests        []obs.CaptureRecord    `json:"requests"`
	Events          []eventlog.EventRecord `json:"events"`
	EventsAvailable bool                   `json:"events_available"`
}

// EventReader abstracts the read-only runtime-event storage used by the
// search_events, summary_events, and get_correlation_timeline MCP tools.
type EventReader interface {
	SearchEvents(ctx context.Context, params eventlog.EventSearchParams) (eventlog.EventSearchPage, error)
	SummaryEvents(ctx context.Context, filters eventlog.EventFilters) (eventlog.EventSummaryResult, error)
	EventsByCorrelation(ctx context.Context, correlationID string, cap int) ([]eventlog.EventRecord, error)
	EventsAvailable() bool
}
