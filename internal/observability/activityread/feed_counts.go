package activityread

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/observability/telemetry"
)

// bucket is one inclusive time span the counts are grouped by.
type bucket struct {
	loMS int64
	hiMS int64
}

// bucketCounts is the per-type tally of one bucket.
type bucketCounts map[FeedType]TypeCount

// add tallies lines and failures of one type.
func (b bucketCounts) add(t FeedType, lines, failed int64) {
	c := b[t]
	c.Type, c.Lines, c.Failed = t, c.Lines+lines, c.Failed+failed
	b[t] = c
}

// countFeed counts, per bucket and type, the lines Feed lists for plan
// (failures-only aside): the same sources, predicates and failure tests.
func (r *Reader) countFeed(ctx context.Context, plan feedPlan, buckets []bucket) ([]bucketCounts, error) {
	counts := make([]bucketCounts, len(buckets))
	for i := range counts {
		counts[i] = bucketCounts{}
	}
	cte, args := bucketsCTE(buckets)
	sources := []struct {
		t     FeedType
		query string
		args  []any
	}{
		{FeedTraffic, cte + `SELECT b.i, COUNT(*), SUM(h.failed > 0) FROM b JOIN (
			SELECT hour_ms, SUM(CASE WHEN status_class >= 4 THEN request_count ELSE 0 END) AS failed
			FROM request_rollup_hourly GROUP BY hour_ms) h ON h.hour_ms > b.lo - ? AND h.hour_ms <= b.hi GROUP BY b.i`,
			append(append([]any{}, args...), time.Hour.Milliseconds())},
		{FeedTraffic, cte + `SELECT b.i, COUNT(*), COUNT(*) FROM b
			JOIN device_telemetry_events ON reported_at_ms BETWEEN b.lo AND b.hi
			WHERE kind IN (?, ?, ?) AND ` + feedFailedReportSQL + ` GROUP BY b.i`,
			append(append([]any{}, args...), telemetry.KindCycleReport, telemetry.KindEpisodeAction, telemetry.KindScreenStall)},
		{FeedDownload, cte + `SELECT b.i, COUNT(*), SUM(` + feedFailedRunSQL + `) FROM b
			JOIN download_runs ON started_at_ms BETWEEN b.lo AND b.hi GROUP BY b.i`, args},
		{FeedTask, cte + `SELECT b.i, COUNT(*), SUM(level = 'error') FROM b
			JOIN runtime_events ON occurred_at_ms BETWEEN b.lo AND b.hi
			WHERE ` + feedEventWhere(feedTaskEventSQL) + ` GROUP BY b.i`, args},
		// One System line per group, as feedSystemLines reads them; the level
		// is part of the key, so a group fails when its level is error.
		{FeedSystem, cte + `SELECT i, COUNT(*), SUM(failed) FROM (SELECT b.i AS i, MAX(level = 'error') AS failed FROM b
			JOIN runtime_events ON occurred_at_ms BETWEEN b.lo AND b.hi
			WHERE ` + feedEventWhere(feedSystemEventSQL) + ` GROUP BY b.i, ` + feedSystemGroupSQL + `) GROUP BY i`, args},
	}
	for _, source := range sources {
		if !plan.reads(source.t) {
			continue
		}
		if err := r.scanCounts(ctx, source.query, source.args, counts, source.t); err != nil {
			return nil, err
		}
	}
	return counts, r.countChanges(ctx, plan, buckets, counts)
}

// scanCounts runs one grouped count of type t and tallies each row into its bucket.
func (r *Reader) scanCounts(ctx context.Context, query string, args []any, counts []bucketCounts, t FeedType) error {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("activityread: feed counts: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var i int
		var lines int64
		var failed sql.NullInt64
		if err := rows.Scan(&i, &lines, &failed); err != nil {
			return fmt.Errorf("activityread: scan feed counts: %w", err)
		}
		counts[i].add(t, lines, failed.Int64)
	}
	return rows.Err()
}

// countChanges counts phone changes and bridge edits through internal/activity,
// the owner of their table. A change never fails.
func (r *Reader) countChanges(ctx context.Context, plan feedPlan, buckets []bucket, counts []bucketCounts) error {
	for _, source := range []struct {
		t      FeedType
		source string
	}{{FeedChange, activity.SourceMobile}, {FeedEdit, activity.SourceDesktop}} {
		if !plan.reads(source.t) {
			continue
		}
		for i, b := range buckets {
			n, err := r.changes.CountMatching(ctx, activity.ListQuery{SinceMS: b.loMS, UntilMS: b.hiMS, Source: source.source})
			if err != nil {
				return fmt.Errorf("activityread: count changes: %w", err)
			}
			counts[i].add(source.t, n, 0)
		}
	}
	return nil
}

// bucketsCTE returns a WITH clause naming the buckets b(i, lo, hi) and its args.
func bucketsCTE(buckets []bucket) (string, []any) {
	values := make([]string, len(buckets))
	args := make([]any, 0, 3*len(buckets))
	for i, b := range buckets {
		values[i] = "(?, ?, ?)"
		args = append(args, i, b.loMS, b.hiMS)
	}
	return "WITH b(i, lo, hi) AS (VALUES " + strings.Join(values, ", ") + ") ", args
}
