package requestcapture

import (
	"context"

	obs "autoreas-bridge/internal/observability/requestcapture"
)

// SearchRequestsInput carries pagination and optional server-side
// filters for the search_requests tool. Every populated filter
// composes with the others as a conjunction (AND).
type SearchRequestsInput struct {
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

// SummaryRequestsInput carries the same optional filters as
// SearchRequestsInput to scope the summary_requests aggregation.
type SummaryRequestsInput struct {
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
func (in SearchRequestsInput) toFilters() obs.SearchFilters {
	return obs.SearchFilters{
		Route: in.Route, HTTPStatus: in.Status, Outcome: in.Outcome, Kind: in.Kind,
		DeviceID: in.DeviceID, AnimeID: in.AnimeID, ErrorCode: in.ErrorCode,
		StartMS: in.StartMS, EndMS: in.EndMS, ChangelogID: in.ChangelogID,
	}
}

// toFilters projects the input's shared filter fields into obs.SearchFilters.
func (in SummaryRequestsInput) toFilters() obs.SearchFilters {
	return obs.SearchFilters{
		Route: in.Route, HTTPStatus: in.Status, Outcome: in.Outcome, Kind: in.Kind,
		DeviceID: in.DeviceID, AnimeID: in.AnimeID, ErrorCode: in.ErrorCode,
		StartMS: in.StartMS, EndMS: in.EndMS, ChangelogID: in.ChangelogID,
	}
}

// ResolveRequestContextInput carries the imprecise reference to resolve.
type ResolveRequestContextInput struct {
	Reference string `json:"reference"`
}

// GetRequestContextInput carries the exact request ID to retrieve.
type GetRequestContextInput struct {
	RequestID string `json:"request_id"`
}

// ResolveCandidate is one ranked request matched by a reference.
type ResolveCandidate struct {
	RequestID string `json:"request_id"`
}

// SearchRequestsResult is the newest-first page returned by search.
type SearchRequestsResult = obs.SearchPage

// SummaryRequestsResult is the grouped aggregation returned by summary.
type SummaryRequestsResult = obs.SummaryResult

// GetRequestContextResult is the exact-get result returned by get.
type GetRequestContextResult = obs.GetResult

// ResolveRequestContextResult is the list of ranked candidates.
type ResolveRequestContextResult struct {
	Candidates []ResolveCandidate `json:"candidates"`
}

// Reader abstracts the read-only request-capture storage used by the MCP tools.
type Reader interface {
	Search(ctx context.Context, params obs.SearchParams) (obs.SearchPage, error)
	Get(ctx context.Context, requestID string) (obs.GetResult, error)
	Resolve(ctx context.Context, reference string) ([]ResolveCandidate, error)
	Summary(ctx context.Context, filters obs.SearchFilters) (obs.SummaryResult, error)
}
