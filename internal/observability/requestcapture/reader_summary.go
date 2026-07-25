package requestcapture

import (
	"context"
	"database/sql"
)

// defaultSummaryErrorSamples bounds the most-recent error samples returned per
// summary group.
const defaultSummaryErrorSamples = 5

// Summary aggregates captures into counts grouped by (route, http_status,
// outcome), scoped by the supplied filters, plus a bounded number of the most
// recent error samples per group. An empty/unmatched filter set yields a
// zeroed (empty-groups) result, never an error.
func (r *Reader) Summary(ctx context.Context, filters SearchFilters) (SummaryResult, error) {
	query := `
		SELECT route, http_status, outcome, COUNT(*) AS n
		FROM ` + r.tables.captures + `
	`
	var args []any
	if clause, filterArgs := filters.whereClause(); clause != "" {
		query += " WHERE " + clause
		args = append(args, filterArgs...)
	}
	query += " GROUP BY route, http_status, outcome ORDER BY n DESC, route ASC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return SummaryResult{}, err
	}
	defer func() { _ = rows.Close() }()

	result := SummaryResult{Groups: []SummaryGroup{}}
	for rows.Next() {
		var group SummaryGroup
		var httpStatus sql.NullInt64
		if err := rows.Scan(&group.Route, &httpStatus, &group.Outcome, &group.Count); err != nil {
			return SummaryResult{}, err
		}
		if httpStatus.Valid {
			value := int(httpStatus.Int64)
			group.HTTPStatus = &value
		}
		result.Groups = append(result.Groups, group)
	}
	if err := rows.Err(); err != nil {
		return SummaryResult{}, err
	}

	for i := range result.Groups {
		samples, err := r.latestErrorSamples(ctx, filters, result.Groups[i])
		if err != nil {
			return SummaryResult{}, err
		}
		result.Groups[i].LatestErrorSamples = samples
	}
	return result, nil
}

// latestErrorSamples fetches up to defaultSummaryErrorSamples most-recent
// error rows (non-empty error_code) matching one aggregated group plus the
// original scoping filters.
func (r *Reader) latestErrorSamples(ctx context.Context, filters SearchFilters, group SummaryGroup) ([]ErrorSample, error) {
	query := `
		SELECT request_id, captured_at_ms, error_code
		FROM ` + r.tables.captures + `
		WHERE route = ? AND outcome = ? AND error_code != ''
	`
	args := []any{group.Route, group.Outcome}
	if group.HTTPStatus != nil {
		query += " AND http_status = ?"
		args = append(args, *group.HTTPStatus)
	} else {
		query += " AND http_status IS NULL"
	}
	if clause, filterArgs := filters.whereClause(); clause != "" {
		query += " AND " + clause
		args = append(args, filterArgs...)
	}
	query += " ORDER BY captured_at_ms DESC, request_id DESC LIMIT ?"
	args = append(args, defaultSummaryErrorSamples)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	samples := []ErrorSample{}
	for rows.Next() {
		var sample ErrorSample
		if err := rows.Scan(&sample.RequestID, &sample.CapturedAtMS, &sample.ErrorCode); err != nil {
			return nil, err
		}
		samples = append(samples, sample)
	}
	return samples, rows.Err()
}
