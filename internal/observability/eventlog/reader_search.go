package eventlog

import (
	"context"
	"strings"

	"autoreas-bridge/internal/observability/obserr"
)

// Search returns newest-first event summaries, applying any supplied filters
// as a conjunction with the pagination cursor. An unmatched combination
// returns an empty page with valid pagination metadata rather than an error.
// Deliberately unlike requestcapture.Reader.Search, the SQL query itself
// applies LIMIT (limit+1): on the higher-volume events table, scanning the
// whole table and truncating in Go would be exactly the regression the
// retention risk row warns about.
func (r *Reader) Search(ctx context.Context, params EventSearchParams) (EventSearchPage, error) {
	if !r.available {
		return EventSearchPage{}, obserr.Unavailable("runtime event log unavailable")
	}

	limit := clampEventSearchLimit(params.Limit)
	query, args, err := buildEventSearchQuery(params, limit)
	if err != nil {
		return EventSearchPage{}, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return EventSearchPage{}, err
	}
	defer func() { _ = rows.Close() }()

	page := scanEventSearchPage(rows, limit)
	return page, rows.Err()
}

// clampEventSearchLimit applies the reader-side half of the double clamp: an
// absent or non-positive limit falls back to the default, and any request
// above the ceiling is capped. The MCP tool layer clamps first; this clamp
// also guards direct in-process callers.
func clampEventSearchLimit(limit int) int {
	if limit <= 0 {
		return defaultSearchLimit
	}
	if limit > maxSearchLimit {
		return maxSearchLimit
	}
	return limit
}

// buildEventSearchQuery assembles the newest-first paginated query and its
// bind arguments, composing the supplied filters and the keyset cursor as a
// conjunction. It requests limit+1 rows so the caller can detect a further
// page without a second round trip.
func buildEventSearchQuery(params EventSearchParams, limit int) (string, []any, error) {
	query := "SELECT " + eventSelectColumns + " FROM runtime_events"
	var conditions []string
	var args []any
	if clause, filterArgs := params.Filters.whereClause(); clause != "" {
		conditions = append(conditions, clause)
		args = append(args, filterArgs...)
	}
	if params.Cursor != "" {
		cursor, decodeErr := decodeEventCursor(params.Cursor)
		if decodeErr != nil {
			return "", nil, decodeErr
		}
		conditions = append(conditions, "(occurred_at_ms < ? OR (occurred_at_ms = ? AND id < ?))")
		args = append(args, cursor.OccurredAtMS, cursor.OccurredAtMS, cursor.ID)
	}
	if len(conditions) > 0 {
		query += " WHERE " + joinEventConditions(conditions)
	}
	query += " ORDER BY occurred_at_ms DESC, id DESC LIMIT ?"
	return query, append(args, limit+1), nil
}

// eventRowScanner is the subset of *sql.Rows that page scanning needs, kept
// narrow so the drain loop is testable without a live database.
type eventRowScanner interface {
	Next() bool
	Scan(dest ...any) error
}

// scanEventSearchPage drains rows into a bounded page, counting rows that fail
// to scan as skipped warnings rather than failing the whole query, and setting
// the next cursor only when the limit+1 probe row proves a further page exists.
func scanEventSearchPage(rows eventRowScanner, limit int) EventSearchPage {
	// Items starts as a non-nil empty slice: a nil slice marshals to JSON
	// null, and the MCP tool's declared output schema requires an array, so
	// a zero-match page must encode as [] rather than failing validation.
	page := EventSearchPage{AppliedLimit: limit, Items: []EventRecord{}}
	for rows.Next() {
		record, scanErr := scanEventRow(rows)
		if scanErr != nil {
			page.MalformedRowsSkipped++
			page.WarningCount++
			continue
		}
		if len(page.Items) <= limit {
			page.Items = append(page.Items, record)
		}
	}
	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		last := page.Items[len(page.Items)-1]
		page.NextCursor = encodeEventCursor(eventCursor{OccurredAtMS: last.OccurredAtMS, ID: last.ID})
	}
	return page
}

// joinEventConditions ANDs a set of already-parenthesized-as-needed WHERE
// fragments.
func joinEventConditions(conditions []string) string {
	var joined strings.Builder
	for i, condition := range conditions {
		if i > 0 {
			joined.WriteString(" AND ")
		}
		joined.WriteString(condition)
	}
	return joined.String()
}
