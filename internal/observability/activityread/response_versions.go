package activityread

import (
	"context"
	"errors"
	"fmt"
)

// ResponseVersionLimit caps the versions one route template returns. Each
// version carries its whole body; the dev copy holds 4 distinct bodies for
// /api/animes, the route with 95% of the body bytes (L15).
const ResponseVersionLimit = 20

// ResponseVersion is one distinct response body of a route template, as the
// ledger stores it in response_versions.
type ResponseVersion struct {
	BodyHash    string
	Body        string
	FirstSeenMS int64
	LastSeenMS  int64
	SeenCount   int64
}

// ResponseVersions returns the distinct response bodies of one route
// template, most recently seen first. The template is the primary key's
// leading column, so the read is an index range.
func (r *Reader) ResponseVersions(ctx context.Context, routeTemplate string) ([]ResponseVersion, error) {
	if routeTemplate == "" {
		return nil, errors.New("activityread: route template is required")
	}
	rows, err := r.db.QueryContext(ctx, `SELECT body_hash, body, first_seen_ms, last_seen_ms, seen_count
		FROM response_versions WHERE route_template = ? ORDER BY last_seen_ms DESC, body_hash LIMIT ?`,
		routeTemplate, ResponseVersionLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: response versions: %w", err)
	}
	defer func() { _ = rows.Close() }()
	versions := []ResponseVersion{}
	for rows.Next() {
		var v ResponseVersion
		if err := rows.Scan(&v.BodyHash, &v.Body, &v.FirstSeenMS, &v.LastSeenMS, &v.SeenCount); err != nil {
			return nil, fmt.Errorf("activityread: scan response version: %w", err)
		}
		versions = append(versions, v)
	}
	return versions, rows.Err()
}
