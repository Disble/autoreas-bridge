package requestcapture

import (
	"context"
	"strings"
)

// Search returns newest-first capture summaries, applying any supplied
// filters as a conjunction with the pagination cursor. The SQL query itself
// applies LIMIT (limit+1), like eventlog.Reader.Search: reading every
// matching row and truncating in Go would pull every stored body per page.
// params.Summary selects the list projection (body/header blobs unread); the
// zero value keeps the full detail projection. An unmatched combination
// returns an empty page with valid pagination metadata rather than an error.
func (r *Reader) Search(ctx context.Context, params SearchParams) (SearchPage, error) {
	limit := clampCaptureSearchLimit(params.Limit)
	columns := r.searchProjection(params.Summary)
	query, args, err := buildCaptureSearchQuery(params, limit, columns, r.tables.captures)
	if err != nil {
		return SearchPage{}, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return SearchPage{}, err
	}
	defer func() { _ = rows.Close() }()

	page := scanCaptureSearchPage(rows, limit, columns)
	return page, rows.Err()
}

// clampCaptureSearchLimit applies the reader-side limit clamp: an absent or
// non-positive limit falls back to the default, and any request above the
// ceiling is capped.
func clampCaptureSearchLimit(limit int) int {
	if limit <= 0 {
		return defaultSearchLimit
	}
	if limit > maxSearchLimit {
		return maxSearchLimit
	}
	return limit
}

// searchProjection picks the SELECT column set for a search page: the list
// (summary) projection when Summary is set, keeping body/header blobs unread
// because list pages never display them, otherwise the full detail
// projection.
func (r *Reader) searchProjection(summary bool) []string {
	if summary {
		return r.optional.selectSummaryColumns()
	}
	return r.optional.selectColumns()
}

// buildCaptureSearchQuery assembles the newest-first paginated query and its
// bind arguments, composing the supplied filters and the keyset cursor as a
// conjunction. It requests limit+1 rows so the caller can detect a further
// page without a second round trip, so nothing past the window is ever read
// from SQLite.
func buildCaptureSearchQuery(params SearchParams, limit int, columns []string, table string) (string, []any, error) {
	query := "SELECT " + selectColumnList(columns) + " FROM " + table

	var conditions []string
	var args []any
	if clause, filterArgs := params.Filters.whereClause(); clause != "" {
		conditions = append(conditions, clause)
		args = append(args, filterArgs...)
	}
	if params.Cursor != "" {
		cursor, decodeErr := decodeSearchCursor(params.Cursor)
		if decodeErr != nil {
			return "", nil, decodeErr
		}
		conditions = append(conditions, "(captured_at_ms < ? OR (captured_at_ms = ? AND request_id < ?))")
		args = append(args, cursor.CapturedAtMS, cursor.CapturedAtMS, cursor.RequestID)
	}
	if len(conditions) > 0 {
		query += " WHERE " + joinConditions(conditions)
	}
	query += " ORDER BY captured_at_ms DESC, request_id DESC LIMIT ?"
	return query, append(args, limit+1), nil
}

// captureRowScanner is the subset of *sql.Rows that page scanning needs, kept
// narrow so the drain loop is testable without a live database.
type captureRowScanner interface {
	Next() bool
	Scan(dest ...any) error
}

// scanCaptureSearchPage drains rows into a bounded page, counting rows that
// fail to scan as skipped warnings rather than failing the whole query, and
// setting the next cursor only when the limit+1 probe row proves a further
// page exists.
func scanCaptureSearchPage(rows captureRowScanner, limit int, columns []string) SearchPage {
	// Items starts as a non-nil empty slice: a nil slice marshals to JSON
	// null, and the MCP tool's declared output schema requires an array, so
	// a zero-match page must encode as [] rather than failing validation.
	page := SearchPage{AppliedLimit: limit, Items: []CaptureRecord{}}
	for rows.Next() {
		record, scanErr := scanCaptureRow(rows, columns)
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
		page.NextCursor = encodeSearchCursor(searchCursor{CapturedAtMS: last.CapturedAtMS, RequestID: last.RequestID})
	}
	return page
}

// Get returns an exact request by id while still counting malformed surrounding rows.
func (r *Reader) Get(ctx context.Context, requestID string) (GetResult, error) {
	columns := r.optional.selectColumns()
	query := "SELECT " + selectColumnList(columns) + " FROM " + r.tables.captures + " ORDER BY captured_at_ms DESC, request_id DESC"
	// NOSONAR go:S2077 -- r.tables.captures, and selectColumnList's output is a compile-time internal literal,
	// never caller data; SQLite cannot bind an identifier as a parameter.
	rows, err := r.db.QueryContext(ctx, query) // NOSONAR
	if err != nil {
		return GetResult{}, err
	}
	defer func() { _ = rows.Close() }()
	result := GetResult{}
	for rows.Next() {
		record, scanErr := scanCaptureRow(rows, columns)
		if scanErr != nil {
			result.MalformedRowsSkipped++
			result.WarningCount++
			continue
		}
		if record.RequestID == requestID {
			result.Found = true
			result.Item = record
		}
	}
	return result, rows.Err()
}

// selectColumnList joins the ordered column list into a SQL SELECT fragment.
func selectColumnList(columns []string) string {
	var list strings.Builder
	for i, column := range columns {
		if i > 0 {
			list.WriteString(", ")
		}
		list.WriteString(column)
	}
	return list.String()
}

// joinConditions ANDs a set of already-parenthesized-as-needed WHERE fragments.
func joinConditions(conditions []string) string {
	var joined strings.Builder
	for i, condition := range conditions {
		if i > 0 {
			joined.WriteString(" AND ")
		}
		joined.WriteString(condition)
	}
	return joined.String()
}

// summaryOptionalColumns lists, in optionalCaptureColumns relative order, the
// additive telemetry columns the list (summary) projection reads. Body and
// header blobs are excluded: list pages never display them and they dominate
// the read cost.
var summaryOptionalColumns = []string{"request_body_state", "response_body_state", "duration_ms"}

// selectSummaryColumns returns the list (summary) SELECT column list: the
// fixed base columns followed by whichever state/duration columns are
// present. Get always uses the full selectColumns projection instead.
func (o optionalColumns) selectSummaryColumns() []string {
	columns := append([]string(nil), captureBaseColumns...)
	for _, name := range summaryOptionalColumns {
		if o.present(name) {
			columns = append(columns, name)
		}
	}
	return columns
}
