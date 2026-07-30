package requestcapture

import (
	"context"
	"slices"
	"strconv"
	"strings"

	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/obserr"
	obs "autoreas-bridge/internal/observability/requestcapture"
)

// searchEvents queries persisted runtime events with bounded pagination and
// any supplied optional server-side filters. Limit is double-clamped here
// (25 default / 100 max) and again in eventlog.Reader.Search, mirroring
// today's searchRequests + Reader.Search.
func searchEvents(ctx context.Context, reader EventReader, input SearchEventsInput) (SearchEventsResult, error) {
	limit := input.Limit
	if limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	return reader.SearchEvents(ctx, eventlog.EventSearchParams{Limit: limit, Cursor: input.Cursor, Filters: input.toEventFilters()})
}

// summaryEvents aggregates persisted runtime events into per-dimension
// counts and bounded newest samples, scoped by any supplied filters. It
// never mutates bridge state.
func summaryEvents(ctx context.Context, reader EventReader, input SummaryEventsInput) (SummaryEventsResult, error) {
	return reader.SummaryEvents(ctx, input.toEventFilters())
}

// getCorrelationTimeline resolves one correlation id into the merged
// captured-request and persisted-event timeline. An unmatched id returns a
// valid empty result, never an error; a missing events table degrades to
// events_available=false with capture-side matches still returned.
func getCorrelationTimeline(ctx context.Context, captures Reader, events EventReader, input GetCorrelationTimelineInput) (CorrelationTimelineResult, error) {
	correlationID := strings.TrimSpace(input.CorrelationID)
	if correlationID == "" {
		return CorrelationTimelineResult{}, obserr.InvalidParams("correlation_id is required")
	}

	requests, err := resolveCorrelationRequests(ctx, captures, correlationID)
	if err != nil {
		return CorrelationTimelineResult{}, err
	}

	if !events.EventsAvailable() {
		return CorrelationTimelineResult{Requests: requests, Events: []eventlog.EventRecord{}, EventsAvailable: false}, nil
	}
	// 0 lets the reader apply its own maxTimelineItems bound.
	timelineEvents, err := events.EventsByCorrelation(ctx, correlationID, 0)
	if err != nil {
		return CorrelationTimelineResult{}, err
	}
	if timelineEvents == nil {
		timelineEvents = []eventlog.EventRecord{}
	}
	return CorrelationTimelineResult{Requests: requests, Events: timelineEvents, EventsAvailable: true}, nil
}

// resolveCorrelationRequests pages through captured requests filtered by
// correlation id, returning every match.
func resolveCorrelationRequests(ctx context.Context, captures Reader, correlationID string) ([]obs.CaptureRecord, error) {
	requests := []obs.CaptureRecord{}
	for cursor := ""; ; {
		page, err := captures.Search(ctx, obs.SearchParams{Limit: 100, Cursor: cursor, Filters: obs.SearchFilters{}})
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			if matchesCorrelationID(item, correlationID) {
				requests = append(requests, item)
			}
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	return requests, nil
}

// matchesCorrelationID reports whether item is a captured request sharing
// correlationID.
//
// The request-capture schema has no scalar correlation_id column -- only the
// Correlations JSON envelope of changelog/operation/conflict/activity ids --
// so this join is best-effort by design, and it deliberately does NOT rest on
// RequestID alone. The capture middleware mints RequestID as a uuid local to
// one handler invocation (internal/api/capture_middleware.go) that never
// enters a context and never reaches domain code, while the correlation ids
// domain code actually logs are values like "anime.patch:<id>:<ts>", a
// download runID, or a client-supplied correlationId. RequestID equality
// therefore matches approximately never, and because an unmatched
// correlation is a valid empty result rather than an error, that failure
// would be silent.
//
// Matching runs against the envelope's UNIQUE identifiers only. Device names,
// operation verbs, and outcomes repeat across unrelated requests, so
// including them would return coincidences rather than a timeline.
//
// A true scalar join needs the correlation id propagated into the capture
// record itself, which is a capture-pipeline change this change's scope
// excludes. Recorded as a follow-up.
func matchesCorrelationID(item obs.CaptureRecord, correlationID string) bool {
	if item.RequestID == correlationID {
		return true
	}
	for _, changelogID := range item.Correlations.ChangelogIDs {
		if strconv.FormatInt(changelogID, 10) == correlationID {
			return true
		}
	}
	for _, activityID := range item.Correlations.ActivityIDs {
		if strconv.FormatInt(activityID, 10) == correlationID {
			return true
		}
	}
	return slices.Contains(item.Correlations.ConflictIDs, correlationID)
}
