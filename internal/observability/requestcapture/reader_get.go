package requestcapture

import (
	"context"
	"strings"
)

// Get returns an exact request by its primary key. Only that row is read: a
// malformed target counts as one skipped row, and neighbours are never
// scanned, because reading every row with its bodies froze the Activity detail.
func (r *Reader) Get(ctx context.Context, requestID string) (GetResult, error) {
	columns := r.optional.selectColumns()
	query := "SELECT " + selectColumnList(columns) + " FROM " + r.tables.captures + " WHERE request_id = ?"
	// NOSONAR go:S2077 -- r.tables.captures, and selectColumnList's output is a compile-time internal literal,
	// never caller data; SQLite cannot bind an identifier as a parameter.
	rows, err := r.db.QueryContext(ctx, query, requestID) // NOSONAR
	if err != nil {
		return GetResult{}, err
	}
	defer func() { _ = rows.Close() }()
	result := GetResult{}
	if rows.Next() {
		record, scanErr := scanCaptureRow(rows, columns)
		if scanErr != nil {
			result.MalformedRowsSkipped = 1
			result.WarningCount = 1
		} else {
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
