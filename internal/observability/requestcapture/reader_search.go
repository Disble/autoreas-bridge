package requestcapture

import "context"

// Search returns newest-first capture summaries, applying any supplied
// filters as a conjunction with the pagination cursor. An unmatched
// combination returns an empty page with valid pagination metadata rather
// than an error.
func (r *Reader) Search(ctx context.Context, params SearchParams) (SearchPage, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	if limit > maxSearchLimit {
		limit = maxSearchLimit
	}

	columns := r.optional.selectColumns()
	query := "SELECT " + selectColumnList(columns) + " FROM " + r.tables.captures

	var conditions []string
	var args []any
	if clause, filterArgs := params.Filters.whereClause(); clause != "" {
		conditions = append(conditions, clause)
		args = append(args, filterArgs...)
	}
	if params.Cursor != "" {
		cursor, decodeErr := decodeSearchCursor(params.Cursor)
		if decodeErr != nil {
			return SearchPage{}, decodeErr
		}
		conditions = append(conditions, "(captured_at_ms < ? OR (captured_at_ms = ? AND request_id < ?))")
		args = append(args, cursor.CapturedAtMS, cursor.CapturedAtMS, cursor.RequestID)
	}
	if len(conditions) > 0 {
		query += " WHERE " + joinConditions(conditions)
	}
	query += " ORDER BY captured_at_ms DESC, request_id DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return SearchPage{}, err
	}
	defer func() { _ = rows.Close() }()
	page := SearchPage{AppliedLimit: limit}
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
	return page, rows.Err()
}

// Get returns an exact request by id while still counting malformed surrounding rows.
func (r *Reader) Get(ctx context.Context, requestID string) (GetResult, error) {
	columns := r.optional.selectColumns()
	query := "SELECT " + selectColumnList(columns) + " FROM " + r.tables.captures + " ORDER BY captured_at_ms DESC, request_id DESC"
	rows, err := r.db.QueryContext(ctx, query)
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
	list := ""
	for i, column := range columns {
		if i > 0 {
			list += ", "
		}
		list += column
	}
	return list
}

// joinConditions ANDs a set of already-parenthesized-as-needed WHERE fragments.
func joinConditions(conditions []string) string {
	joined := ""
	for i, condition := range conditions {
		if i > 0 {
			joined += " AND "
		}
		joined += condition
	}
	return joined
}
