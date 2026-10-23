package activityread

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/incident"
)

// Feed event predicates (activity-ui-design-v2.md, Feed). Schedule and season
// events are tasks. The other domains give a bridge line only for a start or
// a warning or error: download events are the run story, not lines, and
// routine info events are not news.
const (
	feedTaskEventSQL   = `domain IN ('schedule', 'season')`
	feedBridgeEventSQL = `(domain NOT IN ('download', 'schedule', 'season')
		AND (COALESCE(event_type, '') = 'api.listening' OR level IN ('warn', 'error')))`
	// feedFailedReportSQL is a phone report whose outcome failed.
	feedFailedReportSQL = `(` + reportOutcomeSQL + `) = 'failed'`
	// feedFailedRunSQL is a run that ended in error or lost an episode.
	feedFailedRunSQL = `(status = 'error' OR episodes_failed > 0)`
	// runStatusError is the download_runs status of a run that ended in error.
	runStatusError = "error"
)

// toFeedItems wraps ledger items as feed items of one type and origin.
func toFeedItems(items []item[LedgerLine], typeOf func(LedgerLine) FeedType, failed func(LedgerLine) bool) []item[FeedLine] {
	out := make([]item[FeedLine], len(items))
	for i, it := range items {
		t := typeOf(it.value)
		out[i] = item[FeedLine]{pos: it.pos, value: FeedLine{Type: t, Origin: originOf(t), Failed: failed(it.value), Line: it.value}}
	}
	return out
}

// never is the failure test of a source whose lines cannot fail.
func never(LedgerLine) bool { return false }

// feedChangeLines reads domain history writes: phone changes and bridge
// edits. A change never fails: a rejected phone change is not written.
func (r *Reader) feedChangeLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	changes, edits := plan.reads(FeedChange), plan.reads(FeedEdit)
	if plan.failuresOnly || (!changes && !edits) {
		return nil, nil
	}
	s := scope{all: true}
	if !edits {
		s = scope{changeSource: "mobile"}
	} else if !changes {
		s = scope{changeSource: "desktop"}
	}
	items, err := r.changeLines(ctx, s, p)
	if err != nil {
		return nil, err
	}
	return toFeedItems(items, func(line LedgerLine) FeedType {
		if line.Source == "mobile" {
			return FeedChange
		}
		return FeedEdit
	}, never), nil
}

// feedPhoneReportLines reads failed mobile reports as traffic lines. A report
// that did not fail restates the change or the check-in it reports (on the
// dev copy each episode press stores three: ok, committed and an empty
// outcome), so it is never a line.
func (r *Reader) feedPhoneReportLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	if !plan.reads(FeedTraffic) {
		return nil, nil
	}
	items, err := r.queryPhoneReports(ctx, p, feedFailedReportSQL)
	if err != nil {
		return nil, err
	}
	return toFeedItems(items, func(LedgerLine) FeedType { return FeedTraffic }, func(LedgerLine) bool { return true }), nil
}

// feedTrafficLines reads one line per rollup hour that overlaps the page's
// range, summing every route and device.
func (r *Reader) feedTrafficLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	if !plan.reads(FeedTraffic) {
		return nil, nil
	}
	overlapping := p
	overlapping.sinceMS = p.sinceMS - time.Hour.Milliseconds() + 1
	where, args, err := overlapping.bounds(rankTrafficHour, "hour_ms", "hour_ms", true)
	if err != nil {
		return nil, err
	}
	having := ""
	if plan.failuresOnly {
		having = "HAVING failed > 0"
	}
	query := `SELECT hour_ms, SUM(request_count), SUM(CASE WHEN status_class >= 4 THEN request_count ELSE 0 END) AS failed,
		MAX(max_duration_ms) FROM request_rollup_hourly WHERE ` + where + `
		GROUP BY hour_ms ` + having + ` ORDER BY hour_ms DESC LIMIT ?`
	rows, err := r.db.QueryContext(ctx, query, append(args, p.fetch)...)
	if err != nil {
		return nil, fmt.Errorf("activityread: feed traffic: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var items []item[FeedLine]
	for rows.Next() {
		var hour TrafficHour
		if err := rows.Scan(&hour.HourStartMS, &hour.Requests, &hour.Failed, &hour.MaxDurationMS); err != nil {
			return nil, fmt.Errorf("activityread: scan feed traffic: %w", err)
		}
		line := FeedLine{Type: FeedTraffic, Origin: OriginPhone, Failed: hour.Failed > 0, Traffic: &hour,
			Line: LedgerLine{Kind: LineTrafficHour, ID: formatID(hour.HourStartMS), AtMS: hour.HourStartMS}}
		items = append(items, item[FeedLine]{pos: cursor{atMS: hour.HourStartMS, rank: rankTrafficHour, key: intKey(hour.HourStartMS)}, value: line})
	}
	return items, rows.Err()
}

// feedRunLines reads one line per download run, at its start.
func (r *Reader) feedRunLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	if !plan.reads(FeedDownload) {
		return nil, nil
	}
	where, args, err := p.bounds(rankDownloadRun, "started_at_ms", "run_id", false)
	if err != nil {
		return nil, err
	}
	if plan.failuresOnly {
		where += " AND " + feedFailedRunSQL
	}
	query := `SELECT run_id, started_at_ms, finished_at_ms, trigger, status, animes_checked, episodes_found,
		episodes_downloaded, episodes_failed, skipped_count, up_to_date_count, COALESCE(error_summary, '')
		FROM download_runs WHERE ` + where + ` ORDER BY started_at_ms DESC, run_id DESC LIMIT ?`
	rows, err := r.db.QueryContext(ctx, query, append(args, p.fetch)...)
	if err != nil {
		return nil, fmt.Errorf("activityread: feed runs: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var items []item[FeedLine]
	for rows.Next() {
		var run DownloadRunLine
		var finished sql.NullInt64
		if err := rows.Scan(&run.RunID, &run.StartedAtMS, &finished, &run.Trigger, &run.Status, &run.AnimesChecked,
			&run.EpisodesFound, &run.EpisodesDownloaded, &run.EpisodesFailed, &run.SkippedCount, &run.UpToDateCount,
			&run.ErrorSummary); err != nil {
			return nil, fmt.Errorf("activityread: scan feed run: %w", err)
		}
		run.FinishedAtMS = nullableInt64(finished)
		line := FeedLine{Type: FeedDownload, Origin: OriginBridge, Failed: run.Status == runStatusError || run.EpisodesFailed > 0, Run: &run,
			Line: LedgerLine{Kind: LineDownloadRun, ID: run.RunID, AtMS: run.StartedAtMS, Domain: "download", CorrelationID: run.RunID}}
		items = append(items, item[FeedLine]{pos: cursor{atMS: run.StartedAtMS, rank: rankDownloadRun, key: run.RunID}, value: line})
	}
	return items, rows.Err()
}

// feedEventLines reads task and bridge events. An error event fails; a
// warning is slow.
func (r *Reader) feedEventLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	filter := feedEventFilter(plan)
	if filter == "" {
		return nil, nil
	}
	if plan.failuresOnly {
		filter += " AND level = '" + logger.LevelError + "'"
	}
	where, args, err := p.bounds(rankEvent, "occurred_at_ms", "id", true)
	if err != nil {
		return nil, err
	}
	query := `SELECT id, occurred_at_ms, domain, level, message, COALESCE(event_type, ''), COALESCE(correlation_id, '')
		FROM runtime_events WHERE ` + where + ` AND ` + noiseFilter + ` AND ` + restatingEventFilter + ` AND ` + filter + `
		ORDER BY occurred_at_ms DESC, id DESC LIMIT ?`
	items, err := queryLines(ctx, r.db, query, append(args, p.fetch), rankEvent, func(rows *sql.Rows) (LedgerLine, string, error) {
		line := LedgerLine{Kind: LineEvent}
		var id int64
		err := rows.Scan(&id, &line.AtMS, &line.Domain, &line.Level, &line.Title, &line.Detail, &line.CorrelationID)
		line.ID = formatID(id)
		return line, intKey(id), err
	})
	if err != nil {
		return nil, err
	}
	out := toFeedItems(items, func(line LedgerLine) FeedType {
		if line.Domain == "schedule" || line.Domain == "season" {
			return FeedTask
		}
		return FeedBridge
	}, func(line LedgerLine) bool { return line.Level == logger.LevelError })
	for i := range out {
		out[i].value.Slow = out[i].value.Line.Level == logger.LevelWarn
	}
	return out, nil
}

// attachIncidents sets the newest incident occurrence recorded for each line
// of a page: an error event by its time and fingerprint, a phone report by its
// telemetry event id, and a traffic hour by the request occurrences inside it.
// A slow request occurrence marks a traffic hour that did not fail as slow.
func (r *Reader) attachIncidents(ctx context.Context, lines []FeedLine) error {
	for i := range lines {
		line := &lines[i]
		var err error
		switch line.Line.Kind {
		case LineEvent:
			if line.Failed {
				fingerprint := string(incident.ReasonErrorEvent) + "|" + line.Line.Domain + "|" + line.Line.Detail
				line.IncidentID, _, err = r.newestIncident(ctx, `source_kind = ? AND occurred_at_ms = ? AND fingerprint = ?`,
					string(incident.SourceEvent), line.Line.AtMS, fingerprint)
			}
		case LinePhoneReport:
			line.IncidentID, _, err = r.newestIncident(ctx, `source_kind = ? AND source_id =
				(SELECT event_id FROM device_telemetry_events WHERE rowid = ?)`, string(incident.SourceMobile), line.Line.ID)
		case LineTrafficHour:
			var reason string
			line.IncidentID, reason, err = r.newestIncident(ctx, `source_kind = ? AND occurred_at_ms >= ? AND occurred_at_ms < ?`,
				string(incident.SourceRequest), line.Line.AtMS, line.Line.AtMS+time.Hour.Milliseconds())
			line.Slow = !line.Failed && reason == string(incident.ReasonSlow)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// newestIncident returns the id and reason of the newest occurrence matching
// where, or zero values when none matches.
func (r *Reader) newestIncident(ctx context.Context, where string, args ...any) (int64, string, error) {
	var id int64
	var reason string
	err := r.db.QueryRowContext(ctx, `SELECT id, reason FROM incidents WHERE `+where+` ORDER BY id DESC LIMIT 1`, args...).
		Scan(&id, &reason)
	if err == sql.ErrNoRows {
		return 0, "", nil
	}
	if err != nil {
		return 0, "", fmt.Errorf("activityread: feed incident: %w", err)
	}
	return id, reason, nil
}
