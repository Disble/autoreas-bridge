package mobilecapture

import "strings"

// SearchFilters is the shared, optional server-side filter set accepted by
// both Search and Summary. Every populated field composes with the others as
// a conjunction (AND); an unmatched combination is expected to yield an empty
// result rather than an error.
type SearchFilters struct {
	Route       string
	HTTPStatus  *int
	Outcome     string
	Kind        string
	DeviceID    string
	AnimeID     string
	ErrorCode   string
	StartMS     *int64
	EndMS       *int64
	ChangelogID *int64
}

// whereClause builds the conjunctive WHERE fragment (without the leading
// "WHERE") and its bound arguments for the populated filters. An empty
// SearchFilters yields an empty clause and nil args.
func (f SearchFilters) whereClause() (string, []any) {
	var clauses []string
	var args []any

	if f.Route != "" {
		clauses = append(clauses, "route = ?")
		args = append(args, f.Route)
	}
	if f.HTTPStatus != nil {
		clauses = append(clauses, "http_status = ?")
		args = append(args, *f.HTTPStatus)
	}
	if f.Outcome != "" {
		clauses = append(clauses, "outcome = ?")
		args = append(args, f.Outcome)
	}
	if f.Kind != "" {
		clauses = append(clauses, "kind = ?")
		args = append(args, f.Kind)
	}
	if f.DeviceID != "" {
		clauses = append(clauses, "device_id = ?")
		args = append(args, f.DeviceID)
	}
	if f.ErrorCode != "" {
		clauses = append(clauses, "error_code = ?")
		args = append(args, f.ErrorCode)
	}
	if f.StartMS != nil {
		clauses = append(clauses, "captured_at_ms >= ?")
		args = append(args, *f.StartMS)
	}
	if f.EndMS != nil {
		clauses = append(clauses, "captured_at_ms <= ?")
		args = append(args, *f.EndMS)
	}
	if f.AnimeID != "" {
		clauses = append(clauses, `(anime_id = ? OR EXISTS (
			SELECT 1 FROM json_each(correlation_json, '$.operation_refs') AS op
			WHERE json_extract(op.value, '$.anime_id') = ?
		))`)
		args = append(args, f.AnimeID, f.AnimeID)
	}
	if f.ChangelogID != nil {
		clauses = append(clauses, `EXISTS (
			SELECT 1 FROM json_each(correlation_json, '$.changelog_ids') AS cid
			WHERE cid.value = ?
		)`)
		args = append(args, *f.ChangelogID)
	}

	if len(clauses) == 0 {
		return "", nil
	}
	return strings.Join(clauses, " AND "), args
}
