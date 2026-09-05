package desktop

import (
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/requestcapture"
)

// SummarizeCaptureTransactions is the Wails-bound aggregation over captured
// HTTP transactions: counts grouped by (route, http_status, outcome), ordered
// count-descending, each carrying at most five of its most recent error
// samples. It is the desktop peer of the MCP sidecar's summary_requests tool,
// which delegates to this same requestcapture.Reader -- one query engine, two
// adapters, two processes.
//
// The read is strictly read-only and never panics: an unwired reader or a
// query error degrades to an empty, Degraded aggregation, under the same
// contract as ListCaptureTransactions.
func (a *App) SummarizeCaptureTransactions(query contracts.CaptureSummaryQuery) contracts.CaptureSummary {
	if a.captureReader == nil {
		return emptyCaptureSummary(true)
	}
	result, err := a.captureReader.Summary(a.seasonCtx(), toSummaryFilters(query))
	if err != nil {
		return emptyCaptureSummary(true)
	}

	return toCaptureSummary(result)
}

// emptyCaptureSummary builds a zeroed aggregation carrying the given degraded
// flag. Groups is never nil so the frontend ranges over it without a nil
// check, and an unreadable reader is disclosed rather than presented as a
// measured "nothing happened".
func emptyCaptureSummary(degraded bool) contracts.CaptureSummary {
	return contracts.CaptureSummary{Groups: []contracts.CaptureSummaryGroup{}, Degraded: degraded}
}

// toSummaryFilters maps a CaptureSummaryQuery into the reader's SearchFilters.
// It repeats CaptureQuery's field list rather than sharing it because the two
// DTOs are deliberately distinct shapes -- pagination applies to a page and
// not to an aggregation -- mirroring the MCP's own pair of toFilters methods.
func toSummaryFilters(query contracts.CaptureSummaryQuery) requestcapture.SearchFilters {
	return requestcapture.SearchFilters{
		Route:       query.Route,
		HTTPStatus:  query.HTTPStatus,
		Outcome:     query.Outcome,
		Kind:        query.Kind,
		AnimeID:     query.AnimeID,
		ErrorCode:   query.ErrorCode,
		StartMS:     query.StartMS,
		EndMS:       query.EndMS,
		DeviceID:    query.DeviceID,
		ChangelogID: query.ChangelogID,
	}
}

// toCaptureSummary maps a reader SummaryResult into the bound DTO.
func toCaptureSummary(result requestcapture.SummaryResult) contracts.CaptureSummary {
	groups := make([]contracts.CaptureSummaryGroup, 0, len(result.Groups))
	for _, group := range result.Groups {
		groups = append(groups, toCaptureSummaryGroup(group))
	}

	return contracts.CaptureSummary{Groups: groups}
}

// toCaptureSummaryGroup maps one reader aggregation bucket into its DTO. The
// optional HTTP status is carried through as a pointer: a NULL status means
// this transport never produced one, which is not the same fact as status 0.
func toCaptureSummaryGroup(group requestcapture.SummaryGroup) contracts.CaptureSummaryGroup {
	return contracts.CaptureSummaryGroup{
		Route:              group.Route,
		HTTPStatus:         group.HTTPStatus,
		Outcome:            group.Outcome,
		Count:              group.Count,
		LatestErrorSamples: toCaptureErrorSamples(group.LatestErrorSamples),
	}
}

// toCaptureErrorSamples maps one group's bounded error samples into their DTO
// slice, which is never nil so a group with no errors encodes as [] rather
// than null.
func toCaptureErrorSamples(samples []requestcapture.ErrorSample) []contracts.CaptureErrorSample {
	mapped := make([]contracts.CaptureErrorSample, 0, len(samples))
	for _, sample := range samples {
		mapped = append(mapped, contracts.CaptureErrorSample{
			RequestID:    sample.RequestID,
			CapturedAtMS: sample.CapturedAtMS,
			ErrorCode:    sample.ErrorCode,
		})
	}

	return mapped
}
