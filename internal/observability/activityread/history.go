package activityread

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/incident"
	"autoreas-bridge/internal/observability/telemetry"
)

// Ledger source ranks: the tie-break order of lines sharing a millisecond.
const (
	rankChange = iota + 1
	rankPhoneReport
	rankConnection
	rankEvent
	rankIncident
)

// History returns the 90-day calendar (first page only) and one page of
// ledger lines grouped by local day, newest first. Polling never appears as
// lines: captures contribute only WebSocket connects and disconnects, and
// pushes when IncludeBroadcasts is set.
func (r *Reader) History(ctx context.Context, in HistoryInput) (HistoryView, error) {
	s, err := scopeOf(in.Where)
	if err != nil {
		return HistoryView{}, err
	}
	c, err := parseCursor(in.Cursor)
	if err != nil {
		return HistoryView{}, err
	}
	limit := clampLimit(in.Limit)
	page := sourcePage{cursor: c, sinceMS: in.Now.UnixMilli() - LedgerSpan.Milliseconds(), nowMS: in.Now.UnixMilli(),
		fetch: limit + 1, broadcasts: in.IncludeBroadcasts}

	var items []item[LedgerLine]
	for _, read := range []func(context.Context, scope, sourcePage) ([]item[LedgerLine], error){
		r.changeLines, r.phoneReportLines, r.connectionLines, r.eventLines, r.incidentLines,
	} {
		lines, err := read(ctx, s, page)
		if err != nil {
			return HistoryView{}, err
		}
		items = append(items, lines...)
	}
	lines, next := takePage(items, limit)
	if err := r.markRecovered(ctx, lines); err != nil {
		return HistoryView{}, err
	}
	view := HistoryView{Days: groupByDay(lines, in.Now.Location()), NextCursor: next}
	if c == nil {
		if view.Calendar, err = r.calendar(ctx, in.Now, s); err != nil {
			return HistoryView{}, err
		}
	}
	return view, nil
}

// sourcePage is what every ledger source needs to read its part of a page.
// broadcasts adds pushes to the connection lines.
type sourcePage struct {
	cursor     *cursor
	sinceMS    int64
	nowMS      int64
	fetch      int
	broadcasts bool
}

// bounds returns the time and keyset predicate of one source with its args.
func (p sourcePage) bounds(rank int, timeCol, idCol string, intID bool) (string, []any, error) {
	clause, args, err := keyset(p.cursor, rank, timeCol, idCol, intID)
	if err != nil {
		return "", nil, err
	}
	return timeCol + " >= ? AND " + timeCol + " <= ? AND " + clause, append([]any{p.sinceMS, p.nowMS}, args...), nil
}

// queryLines runs one source query and scans each row with scan.
func queryLines(ctx context.Context, db *sql.DB, query string, args []any, rank int,
	scan func(*sql.Rows) (LedgerLine, string, error)) ([]item[LedgerLine], error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("activityread: ledger source %d: %w", rank, err)
	}
	defer func() { _ = rows.Close() }()
	var items []item[LedgerLine]
	for rows.Next() {
		line, key, err := scan(rows)
		if err != nil {
			return nil, fmt.Errorf("activityread: scan ledger source %d: %w", rank, err)
		}
		items = append(items, item[LedgerLine]{pos: cursor{atMS: line.AtMS, rank: rank, key: key}, value: line})
	}
	return items, rows.Err()
}

// changeLines reads domain history writes through internal/activity, the
// owner of their table, with the page's span, cursor and source filter.
func (r *Reader) changeLines(ctx context.Context, s scope, p sourcePage) ([]item[LedgerLine], error) {
	if !s.readsChanges() {
		return nil, nil
	}
	before, err := changeBefore(p.cursor)
	if err != nil {
		return nil, err
	}
	records, err := r.changes.ListRecent(ctx, activity.ListQuery{
		Limit: p.fetch, SinceMS: p.sinceMS, UntilMS: p.nowMS, Source: s.changeSource, ActionTypes: s.changeActions, Before: before,
	})
	if err != nil {
		return nil, fmt.Errorf("activityread: change lines: %w", err)
	}
	items := make([]item[LedgerLine], len(records))
	for i, record := range records {
		pos := cursor{atMS: record.OccurredAtMs, rank: rankChange, key: intKey(record.ID)}
		items[i] = item[LedgerLine]{pos: pos, value: changeLine(changeOf(record))}
	}
	return items, nil
}

// changeLine renders one change as a ledger line.
func changeLine(c Change) LedgerLine {
	line := LedgerLine{
		Kind: LineChange, ID: formatID(c.ID), AtMS: c.AtMS, PhoneAtMS: c.ReportedAtMS, Source: c.Source,
		Title: c.AnimeName, Detail: c.ActionType, CorrelationID: c.CorrelationID, BeforeJSON: c.BeforeJSON, AfterJSON: c.AfterJSON,
	}
	if isLate(line.AtMS, line.PhoneAtMS) {
		line.Marks = []Mark{MarkArrivedLate}
	}
	return line
}

// phoneReportLines reads stored mobile reports.
func (r *Reader) phoneReportLines(ctx context.Context, s scope, p sourcePage) ([]item[LedgerLine], error) {
	if !s.readsPhone() {
		return nil, nil
	}
	return r.queryPhoneReports(ctx, p, "1=1")
}

// queryPhoneReports reads the stored mobile reports of one page that also
// match extra, a predicate over device_telemetry_events.
func (r *Reader) queryPhoneReports(ctx context.Context, p sourcePage, extra string) ([]item[LedgerLine], error) {
	where, args, err := p.bounds(rankPhoneReport, "reported_at_ms", "rowid", true)
	if err != nil {
		return nil, err
	}
	query := `SELECT rowid, reported_at_ms, observed_at_ms, device_id, kind, ` + reportOutcomeSQL + `
		FROM device_telemetry_events WHERE kind IN (?, ?, ?) AND ` + where + ` AND ` + extra + `
		ORDER BY reported_at_ms DESC, rowid DESC LIMIT ?`
	args = append(append([]any{telemetry.KindCycleReport, telemetry.KindEpisodeAction, telemetry.KindScreenStall}, args...), p.fetch)
	return queryLines(ctx, r.db, query, args, rankPhoneReport, func(rows *sql.Rows) (LedgerLine, string, error) {
		line := LedgerLine{Kind: LinePhoneReport}
		var id int64
		var observed sql.NullInt64
		err := rows.Scan(&id, &line.AtMS, &observed, &line.Source, &line.Title, &line.Detail)
		line.ID, line.PhoneAtMS = formatID(id), nullableInt64(observed)
		if isLate(line.AtMS, line.PhoneAtMS) {
			line.Marks = []Mark{MarkArrivedLate}
		}
		return line, intKey(id), err
	})
}

// connectionLines reads WebSocket connects and disconnects, and pushes when
// the page includes them. Without them, the third kind is the connect kind
// again, so the statement keeps one shape.
func (r *Reader) connectionLines(ctx context.Context, s scope, p sourcePage) ([]item[LedgerLine], error) {
	if !s.readsPhone() {
		return nil, nil
	}
	where, args, err := p.bounds(rankConnection, "captured_at_ms", "request_id", false)
	if err != nil {
		return nil, err
	}
	pushKind := "ws_connect"
	if p.broadcasts {
		pushKind = notPhoneContactKind
	}
	query := `SELECT request_id, captured_at_ms, kind, device_name FROM request_captures
		WHERE kind IN ('ws_connect', 'ws_disconnect', ?) AND ` + where + `
		ORDER BY captured_at_ms DESC, request_id DESC LIMIT ?`
	args = append(append([]any{pushKind}, args...), p.fetch)
	return queryLines(ctx, r.db, query, args, rankConnection, func(rows *sql.Rows) (LedgerLine, string, error) {
		line := LedgerLine{Kind: LineConnection}
		err := rows.Scan(&line.ID, &line.AtMS, &line.Title, &line.Source)
		return line, line.ID, err
	})
}

// restatingEventFilter drops the events that restate a fact History already
// lists from its own row: each ws_connect capture logs two
// websocket.register events, each ws_disconnect one websocket.unregister,
// and each stored phone report one sync.diagnostics_stored (counted 1:1 on
// the dev copy, 2026-10-18).
const restatingEventFilter = `COALESCE(event_type, '') NOT IN
	('websocket.register', 'websocket.unregister', 'sync.diagnostics_stored')`

// eventLines reads non-noise runtime events that no other source restates.
func (r *Reader) eventLines(ctx context.Context, s scope, p sourcePage) ([]item[LedgerLine], error) {
	filter, filterArgs := s.eventFilter()
	where, args, err := p.bounds(rankEvent, "occurred_at_ms", "id", true)
	if err != nil {
		return nil, err
	}
	query := `SELECT id, occurred_at_ms, domain, level, message, COALESCE(event_type, ''), COALESCE(correlation_id, '')
		FROM runtime_events WHERE ` + where + ` AND ` + noiseFilter + ` AND ` + restatingEventFilter + ` AND ` + filter + `
		ORDER BY occurred_at_ms DESC, id DESC LIMIT ?`
	args = append(append(args, filterArgs...), p.fetch)
	return queryLines(ctx, r.db, query, args, rankEvent, func(rows *sql.Rows) (LedgerLine, string, error) {
		line := LedgerLine{Kind: LineEvent}
		var id int64
		err := rows.Scan(&id, &line.AtMS, &line.Domain, &line.Level, &line.Title, &line.Detail, &line.CorrelationID)
		line.ID = formatID(id)
		return line, intKey(id), err
	})
}

// incidentLines reads incident occurrences.
func (r *Reader) incidentLines(ctx context.Context, s scope, p sourcePage) ([]item[LedgerLine], error) {
	filter, filterArgs := s.incidentFilter()
	where, args, err := p.bounds(rankIncident, "occurred_at_ms", "id", true)
	if err != nil {
		return nil, err
	}
	query := `SELECT id, occurred_at_ms, fingerprint, reason, source_kind FROM incidents
		WHERE window_start_ms >= ? AND ` + where + ` AND ` + filter + `
		ORDER BY occurred_at_ms DESC, id DESC LIMIT ?`
	args = append(append(append([]any{p.sinceMS - incident.WindowBefore.Milliseconds()}, args...), filterArgs...), p.fetch)
	return queryLines(ctx, r.db, query, args, rankIncident, func(rows *sql.Rows) (LedgerLine, string, error) {
		line := LedgerLine{Kind: LineIncident, Marks: []Mark{MarkIncident}}
		var id int64
		var fingerprint string
		err := rows.Scan(&id, &line.AtMS, &fingerprint, &line.Detail, &line.Source)
		line.ID, line.Title = formatID(id), titleFor(fingerprint, line.Detail)
		return line, intKey(id), err
	})
}

// markRecovered marks each warning of the page that no error event shares a
// correlation id with. A warning without a correlation id has no error that
// could share it, so it is recovered too.
func (r *Reader) markRecovered(ctx context.Context, lines []LedgerLine) error {
	var ids []any
	for _, line := range lines {
		if isWarning(line) && line.CorrelationID != "" {
			ids = append(ids, line.CorrelationID)
		}
	}
	failed, err := r.failedCorrelations(ctx, ids)
	if err != nil {
		return err
	}
	for i := range lines {
		if isWarning(lines[i]) && !failed[lines[i].CorrelationID] {
			lines[i].Marks = []Mark{MarkRecovered}
		}
	}
	return nil
}

// isWarning reports whether a ledger line is a warning event.
func isWarning(line LedgerLine) bool {
	return line.Kind == LineEvent && line.Level == logger.LevelWarn
}

// failedCorrelations returns which of ids an error event carries.
func (r *Reader) failedCorrelations(ctx context.Context, ids []any) (map[string]bool, error) {
	failed := map[string]bool{}
	if len(ids) == 0 {
		return failed, nil
	}
	rows, err := r.db.QueryContext(ctx, `SELECT DISTINCT correlation_id FROM runtime_events
		WHERE correlation_id IN (`+placeholders(len(ids))+`) AND level = ?`, append(ids, logger.LevelError)...)
	if err != nil {
		return nil, fmt.Errorf("activityread: recovered marks: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("activityread: scan recovered mark: %w", err)
		}
		failed[id] = true
	}
	return failed, rows.Err()
}

// groupByDay groups newest-first lines by their local day in loc.
func groupByDay(lines []LedgerLine, loc *time.Location) []LedgerDay {
	var days []LedgerDay
	for _, line := range lines {
		start := dayStart(time.UnixMilli(line.AtMS).In(loc)).UnixMilli()
		if len(days) == 0 || days[len(days)-1].DayStartMS != start {
			days = append(days, LedgerDay{DayStartMS: start})
		}
		days[len(days)-1].Lines = append(days[len(days)-1].Lines, line)
	}
	return days
}

// dayStart returns local midnight of t's day.
func dayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
