package eventlog

import (
	"context"
	"database/sql"

	"autoreas-bridge/internal/observability/obserr"
)

// Summary aggregates matching events into counts grouped by domain, level,
// and event type, plus a bounded number of newest matching samples. Three
// separate GROUP BY queries over the same whereClause rather than one
// composite grouping: the spec asks for counts BY each dimension, and a
// composite grouping would force the client to re-aggregate to answer "how
// many errors in total". An empty match returns all three slices non-nil and
// empty with Samples: [] -- a zeroed aggregation, never an error.
func (r *Reader) Summary(ctx context.Context, filters EventFilters) (EventSummaryResult, error) {
	if !r.available {
		return EventSummaryResult{}, obserr.Unavailable("runtime event log unavailable")
	}

	clause, args := filters.whereClause()
	byDomain, err := r.groupCounts(ctx, "domain", clause, args)
	if err != nil {
		return EventSummaryResult{}, err
	}
	byLevel, err := r.groupCounts(ctx, "level", clause, args)
	if err != nil {
		return EventSummaryResult{}, err
	}
	byEventType, err := r.groupCounts(ctx, "event_type", clause, args)
	if err != nil {
		return EventSummaryResult{}, err
	}
	samples, err := r.summarySamples(ctx, clause, args)
	if err != nil {
		return EventSummaryResult{}, err
	}

	return EventSummaryResult{
		ByDomain:    byDomain,
		ByLevel:     byLevel,
		ByEventType: byEventType,
		Samples:     samples,
		Available:   true,
	}, nil
}

// groupCounts runs one GROUP BY query over column, scoped by the shared
// whereClause fragment, returning a non-nil (possibly empty) slice.
func (r *Reader) groupCounts(ctx context.Context, column, clause string, args []any) ([]EventCountGroup, error) {
	query := "SELECT " + column + ", COUNT(*) FROM runtime_events"
	if clause != "" {
		query += " WHERE " + clause
	}
	query += " GROUP BY " + column + " ORDER BY COUNT(*) DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	groups := []EventCountGroup{}
	for rows.Next() {
		var key sql.NullString
		var count int
		if err := rows.Scan(&key, &count); err != nil {
			continue
		}
		if !key.Valid || key.String == "" {
			continue
		}
		groups = append(groups, EventCountGroup{Key: key.String, Count: count})
	}
	return groups, rows.Err()
}

// summarySamples returns the newest matching events, bounded by
// defaultSummarySampleCap.
func (r *Reader) summarySamples(ctx context.Context, clause string, args []any) ([]EventSample, error) {
	query := "SELECT id, occurred_at_ms, domain, level, message FROM runtime_events"
	if clause != "" {
		query += " WHERE " + clause
	}
	query += " ORDER BY occurred_at_ms DESC, id DESC LIMIT ?"

	queryArgs := append(append([]any(nil), args...), defaultSummarySampleCap)
	rows, err := r.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	samples := []EventSample{}
	for rows.Next() {
		var sample EventSample
		if err := rows.Scan(&sample.ID, &sample.OccurredAtMS, &sample.Domain, &sample.Level, &sample.Message); err != nil {
			continue
		}
		samples = append(samples, sample)
	}
	return samples, rows.Err()
}
