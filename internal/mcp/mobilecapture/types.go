package mobilecapture

import (
	"context"

	obs "autoreas-bridge/internal/observability/mobilecapture"
)

// SearchMobileRequestsInput carries pagination and optional server-side
// filters for the search_mobile_requests tool. Every populated filter
// composes with the others as a conjunction (AND).
type SearchMobileRequestsInput struct {
	Limit       int    `json:"limit,omitempty"`
	Cursor      string `json:"cursor,omitempty"`
	Route       string `json:"route,omitempty"`
	Status      *int   `json:"status,omitempty"`
	Outcome     string `json:"outcome,omitempty"`
	Kind        string `json:"kind,omitempty"`
	DeviceID    string `json:"device_id,omitempty"`
	AnimeID     string `json:"anime_id,omitempty"`
	ErrorCode   string `json:"error_code,omitempty"`
	StartMS     *int64 `json:"start_ms,omitempty"`
	EndMS       *int64 `json:"end_ms,omitempty"`
	ChangelogID *int64 `json:"changelog_id,omitempty"`
}

// SummaryMobileRequestsInput carries the same optional filters as
// SearchMobileRequestsInput to scope the summary_mobile_requests aggregation.
type SummaryMobileRequestsInput struct {
	Route       string `json:"route,omitempty"`
	Status      *int   `json:"status,omitempty"`
	Outcome     string `json:"outcome,omitempty"`
	Kind        string `json:"kind,omitempty"`
	DeviceID    string `json:"device_id,omitempty"`
	AnimeID     string `json:"anime_id,omitempty"`
	ErrorCode   string `json:"error_code,omitempty"`
	StartMS     *int64 `json:"start_ms,omitempty"`
	EndMS       *int64 `json:"end_ms,omitempty"`
	ChangelogID *int64 `json:"changelog_id,omitempty"`
}

// toFilters projects the input's shared filter fields into obs.SearchFilters.
func (in SearchMobileRequestsInput) toFilters() obs.SearchFilters {
	return obs.SearchFilters{
		Route: in.Route, HTTPStatus: in.Status, Outcome: in.Outcome, Kind: in.Kind,
		DeviceID: in.DeviceID, AnimeID: in.AnimeID, ErrorCode: in.ErrorCode,
		StartMS: in.StartMS, EndMS: in.EndMS, ChangelogID: in.ChangelogID,
	}
}

// toFilters projects the input's shared filter fields into obs.SearchFilters.
func (in SummaryMobileRequestsInput) toFilters() obs.SearchFilters {
	return obs.SearchFilters{
		Route: in.Route, HTTPStatus: in.Status, Outcome: in.Outcome, Kind: in.Kind,
		DeviceID: in.DeviceID, AnimeID: in.AnimeID, ErrorCode: in.ErrorCode,
		StartMS: in.StartMS, EndMS: in.EndMS, ChangelogID: in.ChangelogID,
	}
}

// ResolveMobileRequestContextInput carries the imprecise reference to resolve.
type ResolveMobileRequestContextInput struct {
	Reference string `json:"reference"`
}

// GetMobileRequestContextInput carries the exact request ID to retrieve.
type GetMobileRequestContextInput struct {
	RequestID string `json:"request_id"`
}

// ResolveCandidate is one ranked request matched by a reference.
type ResolveCandidate struct {
	RequestID string `json:"request_id"`
}

// SearchMobileRequestsResult is the newest-first page returned by search.
type SearchMobileRequestsResult = obs.SearchPage

// SummaryMobileRequestsResult is the grouped aggregation returned by summary.
type SummaryMobileRequestsResult = obs.SummaryResult

// GetMobileRequestContextResult is the exact-get result returned by get.
type GetMobileRequestContextResult = obs.GetResult

// ResolveMobileRequestContextResult is the list of ranked candidates.
type ResolveMobileRequestContextResult struct {
	Candidates []ResolveCandidate `json:"candidates"`
}

// Reader abstracts the read-only mobile-capture storage used by the MCP tools.
type Reader interface {
	Search(ctx context.Context, params obs.SearchParams) (obs.SearchPage, error)
	Get(ctx context.Context, requestID string) (obs.GetResult, error)
	Resolve(ctx context.Context, reference string) ([]ResolveCandidate, error)
	Summary(ctx context.Context, filters obs.SearchFilters) (obs.SummaryResult, error)
}
