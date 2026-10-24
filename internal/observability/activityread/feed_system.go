package activityread

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/incident"
)

// Event ownership (docs/adr/030-activity-system-section.md): every runtime
// event belongs to exactly one section. Schedule and season events are
// tasks. An event correlated to a download run is that run's story, which
// the run line already restates, so it is not a line. Every other event is
// System, which shows only a start or a warning or error: routine info
// events are not news. Lines and counts read these same predicates.
const (
	feedTaskEventSQL   = `domain IN ('schedule', 'season')`
	feedSystemEventSQL = `(domain NOT IN ('schedule', 'season')
		AND NOT EXISTS (SELECT 1 FROM download_runs WHERE download_runs.run_id = runtime_events.correlation_id)
		AND (COALESCE(event_type, '') = 'api.listening' OR level IN ('warn', 'error')))`
	// feedSystemGroupSQL is the key of one System line: the events of one
	// hour sharing a domain, event type, level and message. The level is part
	// of the key, so a group is failed or slow as a whole.
	feedSystemGroupSQL = `occurred_at_ms / 3600000, domain, COALESCE(event_type, ''), level, message`
)

// feedEventWhere is the predicate of the feed events of one section: not
// noise, not restating another source, and owned by the section.
func feedEventWhere(owned string) string {
	return noiseFilter + ` AND ` + restatingEventFilter + ` AND ` + owned
}

// feedTaskLines reads one line per task event. An error event fails; a
// warning is slow.
func (r *Reader) feedTaskLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	if !plan.reads(FeedTask) {
		return nil, nil
	}
	filter := feedEventWhere(feedTaskEventSQL)
	if plan.failuresOnly {
		filter += " AND level = '" + logger.LevelError + "'"
	}
	where, args, err := p.bounds(rankEvent, "occurred_at_ms", "id", true)
	if err != nil {
		return nil, err
	}
	query := `SELECT id, occurred_at_ms, domain, level, message, COALESCE(event_type, ''), COALESCE(correlation_id, '')
		FROM runtime_events WHERE ` + where + ` AND ` + filter + ` ORDER BY occurred_at_ms DESC, id DESC LIMIT ?`
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
	out := toFeedItems(items, func(LedgerLine) FeedType { return FeedTask }, func(line LedgerLine) bool { return line.Level == logger.LevelError })
	for i := range out {
		out[i].value.Slow = out[i].value.Line.Level == logger.LevelWarn
	}
	return out, nil
}

// feedSystemLines reads one line per System group of the page's range,
// positioned at the group's last time and keyed by its newest event id,
// which is unique across groups. Only the events inside the range are
// grouped, so a range that cuts an hour counts what it holds.
func (r *Reader) feedSystemLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	if !plan.reads(FeedSystem) {
		return nil, nil
	}
	filter := feedEventWhere(feedSystemEventSQL)
	if plan.failuresOnly {
		filter += " AND level = '" + logger.LevelError + "'"
	}
	after, keyArgs, err := keyset(p.cursor, rankSystemGroup, "last_ms", "newest_id", true)
	if err != nil {
		return nil, err
	}
	query := `SELECT newest_id, last_ms, first_ms, events, hour_ms, domain, level, message, event_type FROM (
		SELECT MAX(id) AS newest_id, MAX(occurred_at_ms) AS last_ms, MIN(occurred_at_ms) AS first_ms, COUNT(*) AS events,
			(occurred_at_ms / 3600000) * 3600000 AS hour_ms, domain, level, message, COALESCE(event_type, '') AS event_type
		FROM runtime_events WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND ` + filter + `
		GROUP BY ` + feedSystemGroupSQL + `)
		WHERE ` + after + ` ORDER BY last_ms DESC, newest_id DESC LIMIT ?`
	args := append(append([]any{p.sinceMS, p.nowMS}, keyArgs...), p.fetch)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("activityread: feed system: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var items []item[FeedLine]
	for rows.Next() {
		var id int64
		var group SystemGroup
		line := LedgerLine{Kind: LineEvent}
		if err := rows.Scan(&id, &group.LastAtMS, &group.FirstAtMS, &group.Count, &group.HourStartMS,
			&line.Domain, &line.Level, &line.Title, &line.Detail); err != nil {
			return nil, fmt.Errorf("activityread: scan feed system: %w", err)
		}
		line.ID, line.AtMS = formatID(id), group.LastAtMS
		value := FeedLine{Type: FeedSystem, Origin: OriginBridge, Failed: line.Level == logger.LevelError,
			Slow: line.Level == logger.LevelWarn, Line: line, System: &group}
		items = append(items, item[FeedLine]{pos: cursor{atMS: group.LastAtMS, rank: rankSystemGroup, key: intKey(id)}, value: value})
	}
	return items, rows.Err()
}

// eventIncident returns the newest error_event incident of a failed event
// line: a task event's at its exact time, a System group's anywhere in its
// hour. Incidents keep only the first and latest occurrences of a
// fingerprint, so a group links to whichever of them its hour still holds.
func (r *Reader) eventIncident(ctx context.Context, line FeedLine) (int64, error) {
	fingerprint := string(incident.ReasonErrorEvent) + "|" + line.Line.Domain + "|" + line.Line.Detail
	if line.System == nil {
		id, _, err := r.newestIncident(ctx, `source_kind = ? AND occurred_at_ms = ? AND fingerprint = ?`,
			string(incident.SourceEvent), line.Line.AtMS, fingerprint)
		return id, err
	}
	id, _, err := r.newestIncident(ctx, `source_kind = ? AND occurred_at_ms >= ? AND occurred_at_ms < ? AND fingerprint = ?`,
		string(incident.SourceEvent), line.System.HourStartMS, line.System.HourStartMS+time.Hour.Milliseconds(), fingerprint)
	return id, err
}
