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

// errNoTemplate rejects a version read without a route template.
var errNoTemplate = errors.New("activityread: route template is required")

// ResponseVersions returns the distinct response bodies of one route
// template, most recently seen first. The template is the primary key's
// leading column, so the read is an index range.
func (r *Reader) ResponseVersions(ctx context.Context, routeTemplate string) ([]ResponseVersion, error) {
	if routeTemplate == "" {
		return nil, errNoTemplate
	}
	return r.queryVersions(ctx, `SELECT body_hash, body, first_seen_ms, last_seen_ms, seen_count
		FROM response_versions WHERE route_template = ? ORDER BY last_seen_ms DESC, body_hash LIMIT ?`,
		routeTemplate, ResponseVersionLimit)
}

// ResponseVersionsAt returns the versions of one route template whose seen
// interval holds atMS, bounds included, most recently seen first. Intervals
// of alternating bodies overlap, so more than one version can hold atMS;
// only a kept capture's response_hash names the exact body. The read is the
// template's primary-key range.
func (r *Reader) ResponseVersionsAt(ctx context.Context, routeTemplate string, atMS int64) ([]ResponseVersion, error) {
	if routeTemplate == "" {
		return nil, errNoTemplate
	}
	return r.queryVersions(ctx, `SELECT body_hash, body, first_seen_ms, last_seen_ms, seen_count
		FROM response_versions WHERE route_template = ? AND first_seen_ms <= ? AND last_seen_ms >= ?
		ORDER BY last_seen_ms DESC, body_hash LIMIT ?`, routeTemplate, atMS, atMS, ResponseVersionLimit)
}

// queryVersions runs one version read and scans its rows; no row is an
// empty list.
func (r *Reader) queryVersions(ctx context.Context, query string, args ...any) ([]ResponseVersion, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
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
