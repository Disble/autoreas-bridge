package mobilecapture

import (
	"context"

	obs "autoreas-bridge/internal/observability/mobilecapture"
)

// searchMobileRequests queries captures with bounded pagination and any
// supplied optional server-side filters.
func searchMobileRequests(ctx context.Context, reader Reader, input SearchMobileRequestsInput) (SearchMobileRequestsResult, error) {
	limit := input.Limit
	if limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	return reader.Search(ctx, obs.SearchParams{Limit: limit, Cursor: input.Cursor, Filters: input.toFilters()})
}

// summaryMobileRequests aggregates captures into per-group counts and bounded
// recent-error samples, scoped by any supplied optional filters. It never
// mutates bridge state.
func summaryMobileRequests(ctx context.Context, reader Reader, input SummaryMobileRequestsInput) (SummaryMobileRequestsResult, error) {
	return reader.Summary(ctx, input.toFilters())
}

// resolveMobileRequestContext ranks captures that match the provided reference.
func resolveMobileRequestContext(ctx context.Context, reader Reader, input ResolveMobileRequestContextInput) (ResolveMobileRequestContextResult, error) {
	candidates, err := reader.Resolve(ctx, input.Reference)
	if err != nil {
		return ResolveMobileRequestContextResult{}, err
	}
	return ResolveMobileRequestContextResult{Candidates: candidates}, nil
}

// getMobileRequestContext returns one sanitized capture by exact request ID.
func getMobileRequestContext(ctx context.Context, reader Reader, input GetMobileRequestContextInput) (GetMobileRequestContextResult, error) {
	result, err := reader.Get(ctx, input.RequestID)
	if err != nil {
		return GetMobileRequestContextResult{}, err
	}
	return mapGetResult(result)
}
