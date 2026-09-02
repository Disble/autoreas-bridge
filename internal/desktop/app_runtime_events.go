package desktop

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/eventlog"
)

// SearchRuntimeEvents is the Wails-bound read of the persisted runtime-event
// store: filters + cursor pagination over the app's own in-process reader,
// newest-first. It is a peer of the MCP sidecar's delegating adapter over the
// same eventlog.Reader -- one query engine, two adapters, two processes.
// Never panics: an unwired reader or a query error degrades to an empty page.
func (a *App) SearchRuntimeEvents(query contracts.EventQuery) contracts.EventPage {
	if a.eventReader == nil {
		return emptyEventPage(false, true)
	}
	if !a.eventReader.Available() {
		return emptyEventPage(false, false)
	}
	page, err := a.eventReader.Search(a.seasonCtx(), toEventSearchParams(query))
	if err != nil {
		return emptyEventPage(true, true)
	}
	return toEventPage(page)
}

// SummarizeRuntimeEvents is the Wails-bound aggregation over persisted runtime
// events: independent counts by domain, by level and by event type, plus the
// newest matching samples, all from one reader call. Slice A consumes ByDomain
// for the derived domain filter; the Overview surface consumes the rest.
// Never panics, under the same degradation contract as SearchRuntimeEvents.
func (a *App) SummarizeRuntimeEvents(filters contracts.EventFilterQuery) contracts.EventSummary {
	if a.eventReader == nil {
		return emptyEventSummary(false, true)
	}
	if !a.eventReader.Available() {
		return emptyEventSummary(false, false)
	}
	result, err := a.eventReader.Summary(a.seasonCtx(), toEventFilters(filters))
	if err != nil {
		return emptyEventSummary(true, true)
	}
	return toEventSummary(result)
}

// RuntimeEventsAvailable reports whether the persisted runtime-event store is
// readable on this database, so the surface can disclose an absent store
// instead of rendering an ordinary empty list.
func (a *App) RuntimeEventsAvailable() bool {
	return a.eventReader != nil && a.eventReader.Available()
}

// emptyEventPage builds a zeroed page carrying the given availability and
// degraded flags. Items is never nil so the frontend ranges without a nil
// check, and the two flags stay distinct: unavailable means the table is
// absent, degraded means the read itself failed.
func emptyEventPage(available, degraded bool) contracts.EventPage {
	return contracts.EventPage{Items: []contracts.EventRow{}, Available: available, Degraded: degraded}
}

// emptyEventSummary builds a zeroed aggregation whose four slices are never
// nil, so an unreadable store is reported rather than presented as a measured
// "nothing happened".
func emptyEventSummary(available, degraded bool) contracts.EventSummary {
	return contracts.EventSummary{
		ByDomain:    []contracts.EventCountGroup{},
		ByLevel:     []contracts.EventCountGroup{},
		ByEventType: []contracts.EventCountGroup{},
		Samples:     []contracts.EventSample{},
		Available:   available,
		Degraded:    degraded,
	}
}

// toEventSearchParams maps an EventQuery into the reader's search params.
func toEventSearchParams(query contracts.EventQuery) eventlog.EventSearchParams {
	return eventlog.EventSearchParams{
		Limit:   query.Limit,
		Cursor:  query.Cursor,
		Filters: toEventFilters(query.Filters),
	}
}

// toEventFilters maps the bound filter DTO into the reader's EventFilters.
func toEventFilters(filters contracts.EventFilterQuery) eventlog.EventFilters {
	return eventlog.EventFilters{
		Domain:        filters.Domain,
		Level:         filters.Level,
		EventType:     filters.EventType,
		CorrelationID: filters.CorrelationID,
		EntityID:      filters.EntityID,
		Text:          filters.Text,
		StartMS:       filters.StartMS,
		EndMS:         filters.EndMS,
	}
}

// toEventPage maps a reader EventSearchPage into the bound EventPage DTO.
func toEventPage(page eventlog.EventSearchPage) contracts.EventPage {
	items := make([]contracts.EventRow, 0, len(page.Items))
	for _, record := range page.Items {
		items = append(items, toEventRow(record))
	}
	return contracts.EventPage{
		Items:                items,
		NextCursor:           page.NextCursor,
		AppliedLimit:         page.AppliedLimit,
		MalformedRowsSkipped: page.MalformedRowsSkipped,
		WarningCount:         page.WarningCount,
		Available:            true,
	}
}

// toEventRow maps one reader EventRecord into the list-row DTO.
func toEventRow(record eventlog.EventRecord) contracts.EventRow {
	return contracts.EventRow{
		ID:            record.ID,
		OccurredAtMS:  record.OccurredAtMS,
		Domain:        record.Domain,
		Level:         record.Level,
		Message:       record.Message,
		CorrelationID: record.CorrelationID,
		EntityID:      record.EntityID,
		EventType:     record.EventType,
		DurationMS:    record.DurationMS,
		Metadata:      record.Metadata,
	}
}

// toEventSummary maps a reader EventSummaryResult into the bound DTO.
func toEventSummary(result eventlog.EventSummaryResult) contracts.EventSummary {
	return contracts.EventSummary{
		ByDomain:    toEventCountGroups(result.ByDomain),
		ByLevel:     toEventCountGroups(result.ByLevel),
		ByEventType: toEventCountGroups(result.ByEventType),
		Samples:     toEventSamples(result.Samples),
		Available:   result.Available,
	}
}

// toEventCountGroups maps one reader grouping dimension into its DTO slice,
// which is never nil so an empty dimension encodes as [] rather than null.
func toEventCountGroups(groups []eventlog.EventCountGroup) []contracts.EventCountGroup {
	mapped := make([]contracts.EventCountGroup, 0, len(groups))
	for _, group := range groups {
		mapped = append(mapped, contracts.EventCountGroup{Key: group.Key, Count: group.Count})
	}
	return mapped
}

// toEventSamples maps the reader's bounded newest samples into their DTO slice.
func toEventSamples(samples []eventlog.EventSample) []contracts.EventSample {
	mapped := make([]contracts.EventSample, 0, len(samples))
	for _, sample := range samples {
		mapped = append(mapped, contracts.EventSample{
			ID:           sample.ID,
			OccurredAtMS: sample.OccurredAtMS,
			Domain:       sample.Domain,
			Level:        sample.Level,
			Message:      sample.Message,
		})
	}
	return mapped
}
