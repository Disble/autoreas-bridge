package requestcapture

import (
	"context"

	obs "autoreas-bridge/internal/observability/requestcapture"
)

// searchRequests queries captures with bounded pagination and any
// supplied optional server-side filters.
func searchRequests(ctx context.Context, reader Reader, input SearchRequestsInput) (SearchRequestsResult, error) {
	limit := input.Limit
	if limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	return reader.Search(ctx, obs.SearchParams{Limit: limit, Cursor: input.Cursor, Filters: input.toFilters()})
}

// summaryRequests aggregates captures into per-group counts and bounded
// recent-error samples, scoped by any supplied optional filters. It never
// mutates bridge state.
func summaryRequests(ctx context.Context, reader Reader, input SummaryRequestsInput) (SummaryRequestsResult, error) {
	return reader.Summary(ctx, input.toFilters())
}

// resolveRequestContext ranks captures that match the provided reference.
func resolveRequestContext(ctx context.Context, reader Reader, input ResolveRequestContextInput) (ResolveRequestContextResult, error) {
	candidates, err := reader.Resolve(ctx, input.Reference)
	if err != nil {
		return ResolveRequestContextResult{}, err
	}
	return ResolveRequestContextResult{Candidates: candidates}, nil
}

// getRequestContext returns one sanitized capture by exact request ID.
func getRequestContext(ctx context.Context, reader Reader, input GetRequestContextInput) (GetRequestContextResult, error) {
	result, err := reader.Get(ctx, input.RequestID)
	if err != nil {
		return GetRequestContextResult{}, err
	}
	return mapGetResult(result)
}
