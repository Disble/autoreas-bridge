package eventlog

import (
	"context"

	"autoreas-bridge/internal/observability/obserr"
)

// EventsByCorrelation returns every persisted event sharing correlationID,
// newest-first, bounded by cap. It is the only single high-selectivity
// equality in the whole filter set and this tool's entire reason to exist:
// get_correlation_timeline resolves the join key that both request captures
// and runtime events share.
func (r *Reader) EventsByCorrelation(ctx context.Context, correlationID string, cap int) ([]EventRecord, error) {
	if !r.available {
		return nil, obserr.Unavailable("runtime event log unavailable")
	}
	if cap <= 0 || cap > maxTimelineItems {
		cap = maxTimelineItems
	}

	rows, err := r.db.QueryContext(ctx,
		"SELECT "+eventSelectColumns+" FROM runtime_events WHERE correlation_id = ? ORDER BY occurred_at_ms DESC, id DESC LIMIT ?",
		correlationID, cap)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var events []EventRecord
	for rows.Next() {
		record, scanErr := scanEventRow(rows)
		if scanErr != nil {
			continue
		}
		events = append(events, record)
	}
	return events, rows.Err()
}
