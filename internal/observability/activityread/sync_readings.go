package activityread

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"autoreas-bridge/internal/observability/syncreading"
	"autoreas-bridge/internal/observability/telemetry"
)

const (
	// syncStartLimit caps the starts one reading reads, newest first. On the
	// 2026-11-06 copy Bridge started about 10 times a day, so the 90-day
	// retention holds about 900.
	syncStartLimit = 2000
	// syncReportLimit caps the failed episode actions one read covers, newest
	// first. The copy holds 96 in 40 days; 5000 is 50 a day over the whole ledger
	// span. An older one past the cap goes without a reading: a plain failure.
	syncReportLimit = 5000
	// syncStartSQL is one Bridge start. Rows stored before the log line gained
	// its event type (2026-10-18 on the copy) are the same fact with a null
	// event_type; without them the failures of that span lose their start.
	syncStartSQL = `domain = 'api' AND level = 'info' AND (event_type = 'api.listening'
		OR (event_type IS NULL AND message LIKE 'http server listening on %'))`
)

// SyncStarts returns the retained Bridge starts, oldest first, each with the
// last contacts it recorded, if any.
func (r *Reader) SyncStarts(ctx context.Context) ([]syncreading.Start, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT occurred_at_ms, COALESCE(metadata_json, '') FROM runtime_events
		WHERE `+syncStartSQL+` ORDER BY occurred_at_ms DESC LIMIT ?`, syncStartLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: sync starts: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var starts []syncreading.Start
	for rows.Next() {
		var atMS int64
		var metadata string
		if err := rows.Scan(&atMS, &metadata); err != nil {
			return nil, fmt.Errorf("activityread: scan sync start: %w", err)
		}
		starts = append(starts, syncreading.DecodeStart(atMS, metadata))
	}
	slices.Reverse(starts)
	return starts, rows.Err()
}

// firstReportKey is one first-report question: a device, from one start.
type firstReportKey struct {
	deviceID string
	fromMS   int64
}

// firstReportAnswer is the stored answer to one firstReportKey.
type firstReportAnswer struct {
	atMS int64
	ok   bool
}

// FirstReports answers syncreading's first-report lookup from
// device_telemetry_events, any kind, through the (device_id, reported_at_ms)
// index: one seek per device and start, kept for the life of the value, so a
// backlog that shares a start asks once. Err holds the first failed lookup; a
// failed lookup answers none, which leaves the failure's own arrival as F.
type FirstReports struct {
	ctx     context.Context
	db      *sql.DB
	answers map[firstReportKey]firstReportAnswer
	Err     error
}

// FirstReports returns a lookup bound to ctx for one read.
func (r *Reader) FirstReports(ctx context.Context) *FirstReports {
	return &FirstReports{ctx: ctx, db: r.db, answers: map[firstReportKey]firstReportAnswer{}}
}

// At is the syncreading.FirstReport of this read.
func (f *FirstReports) At(deviceID string, fromMS int64) (int64, bool) {
	key := firstReportKey{deviceID: deviceID, fromMS: fromMS}
	if answer, ok := f.answers[key]; ok {
		return answer.atMS, answer.ok
	}
	var atMS sql.NullInt64
	err := f.db.QueryRowContext(f.ctx, `SELECT MIN(reported_at_ms) FROM device_telemetry_events
		WHERE device_id = ? AND reported_at_ms >= ?`, deviceID, fromMS).Scan(&atMS)
	if err != nil {
		f.Err = errors.Join(f.Err, fmt.Errorf("activityread: first report: %w", err))
		return 0, false
	}
	f.answers[key] = firstReportAnswer{atMS: atMS.Int64, ok: atMS.Valid}
	return atMS.Int64, atMS.Valid
}

// failedSyncs is the one definition lines and counts share: every failed sync
// report of a span with a reading, keyed by its line id, and the reports that
// read Bridge was off, grouped by their next start N.
type failedSyncs struct {
	readings map[string]*SyncReading
	groups   []BridgeOffGroup
}

// readFailedSyncs reads the failed sync reports of the lines from fromMS on. A
// group sits at its start N and its reports arrive at or after it with no fixed
// bound, since a backlog drains a few reports per cycle, so the read runs to
// the newest report: a group is whole whatever the range. A reading depends on
// the report, the starts and the device's reports alone, so the range never
// changes one.
func (r *Reader) readFailedSyncs(ctx context.Context, fromMS int64) (failedSyncs, error) {
	starts, err := r.SyncStarts(ctx)
	if err != nil {
		return failedSyncs{}, err
	}
	failures, err := r.queryFailedSyncs(ctx, fromMS)
	if err != nil {
		return failedSyncs{}, err
	}
	syncs := failedSyncs{readings: map[string]*SyncReading{}}
	byStart := map[int64][]SyncReading{}
	firstReports := r.FirstReports(ctx)
	for _, failure := range failures {
		result := syncreading.Read(failure.Failure, starts, firstReports.At)
		if result.Reading == syncreading.NoReading {
			continue
		}
		reading := SyncReading{ReportID: failure.id, Reading: result.Reading, Evidence: result.Evidence}
		syncs.readings[formatID(failure.id)] = &reading
		if result.Reading == syncreading.BridgeOff {
			startMS := *result.Evidence.NextStartMS
			byStart[startMS] = append(byStart[startMS], reading)
		}
	}
	if firstReports.Err != nil {
		return failedSyncs{}, firstReports.Err
	}
	for startMS, reports := range byStart {
		syncs.groups = append(syncs.groups, BridgeOffGroup{BridgeStartMS: startMS, Reports: reports})
	}
	return syncs, nil
}

// storedFailure is one failed sync report and the row that stores it.
type storedFailure struct {
	syncreading.Failure
	id int64
}

// queryFailedSyncs reads the failed sync reports received from fromMS on,
// newest first. It returns before any reading starts: the database holds one
// connection, so a first-report lookup cannot run while these rows are open.
func (r *Reader) queryFailedSyncs(ctx context.Context, fromMS int64) ([]storedFailure, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT rowid, device_id, observed_at_ms, reported_at_ms, kind, `+reportOutcomeSQL+`,
		COALESCE(json_extract(payload_json, '$.phase'), '') FROM device_telemetry_events
		WHERE kind = ? AND reported_at_ms >= ? AND `+feedFailedReportSQL+`
		ORDER BY reported_at_ms DESC, rowid DESC LIMIT ?`, telemetry.KindEpisodeAction, fromMS, syncReportLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: failed syncs: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var failures []storedFailure
	for rows.Next() {
		var failure storedFailure
		var kind, outcome, phase string
		var observed sql.NullInt64
		if err := rows.Scan(&failure.id, &failure.DeviceID, &observed, &failure.ArrivedAtMS, &kind, &outcome, &phase); err != nil {
			return nil, fmt.Errorf("activityread: scan failed sync: %w", err)
		}
		if !observed.Valid || !syncreading.Applies(kind, outcome, phase) {
			continue
		}
		failure.FailedAtMS = observed.Int64
		failures = append(failures, failure)
	}
	return failures, rows.Err()
}

// failedReportSQL is the predicate of the failed reports that stay lines of
// their own: every failed report except those a group stands for. The excluded
// ids are integers this package read, so they bind as text safely.
func (s failedSyncs) failedReportSQL() string {
	var ids []string
	for _, group := range s.groups {
		for _, report := range group.Reports {
			ids = append(ids, strconv.FormatInt(report.ReportID, 10))
		}
	}
	if len(ids) == 0 {
		return feedFailedReportSQL
	}
	return feedFailedReportSQL + ` AND device_telemetry_events.rowid NOT IN (` + strings.Join(ids, ", ") + `)`
}

// groupLines returns the neutral lines of p: one per group whose start falls in
// the page's range and after its cursor. The line sits at the start and is keyed
// by it, so neither its position nor its id moves as more reports arrive.
func (s failedSyncs) groupLines(p sourcePage) []item[FeedLine] {
	var items []item[FeedLine]
	for i := range s.groups {
		group := &s.groups[i]
		pos := cursor{atMS: group.BridgeStartMS, rank: rankBridgeOff, key: intKey(group.BridgeStartMS)}
		inRange := group.BridgeStartMS >= p.sinceMS && group.BridgeStartMS <= p.nowMS
		if !inRange || (p.cursor != nil && comparePositions(*p.cursor, pos) >= 0) {
			continue
		}
		line := LedgerLine{Kind: LineBridgeOff, ID: formatID(group.BridgeStartMS), AtMS: group.BridgeStartMS}
		items = append(items, item[FeedLine]{pos: pos, value: FeedLine{Type: FeedTraffic, Origin: originOf(FeedTraffic), Line: line, BridgeOff: group}})
	}
	return items
}

// countGroups tallies each group as one line of the bucket holding its start,
// where Feed lists it. A group never fails.
func (s failedSyncs) countGroups(buckets []bucket, counts []bucketCounts) {
	for _, group := range s.groups {
		for i, b := range buckets {
			if group.BridgeStartMS >= b.loMS && group.BridgeStartMS <= b.hiMS {
				counts[i].add(FeedTraffic, 1, 0)
			}
		}
	}
}

// PhoneReportDetail is one stored mobile report with its payload, read by id
// for the Technical view. Found is false when no report has that id.
type PhoneReportDetail struct {
	Found       bool
	Report      PhoneReport
	PayloadJSON string
}

// PhoneReport returns the stored report with the given id, its payload as it is
// stored: a reading never changes it.
func (r *Reader) PhoneReport(ctx context.Context, id int64) (PhoneReportDetail, error) {
	var detail PhoneReportDetail
	var observed sql.NullInt64
	report := &detail.Report
	err := r.db.QueryRowContext(ctx, `SELECT rowid, reported_at_ms, observed_at_ms, device_id, kind, `+reportOutcomeSQL+`,
		payload_json FROM device_telemetry_events WHERE rowid = ?`, id).
		Scan(&report.ID, &report.AtMS, &observed, &report.DeviceID, &report.Kind, &report.Outcome, &detail.PayloadJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return PhoneReportDetail{}, nil
	}
	if err != nil {
		return PhoneReportDetail{}, fmt.Errorf("activityread: phone report: %w", err)
	}
	report.PhoneAtMS = nullableInt64(observed)
	detail.Found = true
	return detail, nil
}
