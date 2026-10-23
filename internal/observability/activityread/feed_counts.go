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
	type grouped struct {
		reads bool
		query string
		args  []any
		typed func(flag bool) FeedType
	}
	traffic := func(bool) FeedType { return FeedTraffic }
	sources := []grouped{
		{plan.reads(FeedTraffic), cte + `SELECT b.i, 0, COUNT(*), SUM(h.failed > 0) FROM b JOIN (
			SELECT hour_ms, SUM(CASE WHEN status_class >= 4 THEN request_count ELSE 0 END) AS failed
			FROM request_rollup_hourly GROUP BY hour_ms) h ON h.hour_ms > b.lo - ? AND h.hour_ms <= b.hi GROUP BY b.i`,
			append(append([]any{}, args...), time.Hour.Milliseconds()), traffic},
		{plan.reads(FeedTraffic), cte + `SELECT b.i, 0, COUNT(*), COUNT(*) FROM b
			JOIN device_telemetry_events ON reported_at_ms BETWEEN b.lo AND b.hi
			WHERE kind IN (?, ?, ?) AND ` + feedFailedReportSQL + ` GROUP BY b.i`,
			append(append([]any{}, args...), telemetry.KindCycleReport, telemetry.KindEpisodeAction, telemetry.KindScreenStall), traffic},
		{plan.reads(FeedDownload), cte + `SELECT b.i, 0, COUNT(*), SUM(` + feedFailedRunSQL + `) FROM b
			JOIN download_runs ON started_at_ms BETWEEN b.lo AND b.hi GROUP BY b.i`,
			args, func(bool) FeedType { return FeedDownload }},
	}
	if filter := feedEventFilter(plan); filter != "" {
		sources = append(sources, grouped{true, cte + `SELECT b.i, ` + feedTaskEventSQL + `, COUNT(*), SUM(level = 'error') FROM b
			JOIN runtime_events ON occurred_at_ms BETWEEN b.lo AND b.hi
			WHERE ` + noiseFilter + ` AND ` + restatingEventFilter + ` AND ` + filter + ` GROUP BY b.i, 2`,
			args, func(task bool) FeedType {
				if task {
					return FeedTask
				}
				return FeedBridge
			}})
	}
	for _, source := range sources {
		if !source.reads {
			continue
		}
		if err := r.scanCounts(ctx, source.query, source.args, counts, source.typed); err != nil {
			return nil, err
		}
	}
	return counts, r.countChanges(ctx, plan, buckets, counts)
}

// scanCounts runs one grouped count and tallies each row into its bucket.
func (r *Reader) scanCounts(ctx context.Context, query string, args []any, counts []bucketCounts, typed func(bool) FeedType) error {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("activityread: feed counts: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var i int
		var flag bool
		var lines int64
		var failed sql.NullInt64
		if err := rows.Scan(&i, &flag, &lines, &failed); err != nil {
			return fmt.Errorf("activityread: scan feed counts: %w", err)
		}
		counts[i].add(typed(flag), lines, failed.Int64)
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

// feedEventFilter returns the event predicate of the plan's task and bridge
// types, or "" when it reads neither.
func feedEventFilter(plan feedPlan) string {
	var terms []string
	if plan.reads(FeedTask) {
		terms = append(terms, feedTaskEventSQL)
	}
	if plan.reads(FeedBridge) {
		terms = append(terms, feedBridgeEventSQL)
	}
	if len(terms) == 0 {
		return ""
	}
	return "(" + strings.Join(terms, " OR ") + ")"
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
