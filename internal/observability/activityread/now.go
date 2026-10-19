package activityread

import (
	"cmp"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"autoreas-bridge/internal/observability/incident"
)

// hourMS is the rollup bucket width.
const hourMS = int64(time.Hour / time.Millisecond)

// Now answers "is everything fine right now?".
func (r *Reader) Now(ctx context.Context, in NowInput) (NowView, error) {
	nowMS := in.Now.UnixMilli()
	view := NowView{UptimeMS: nowMS - in.ProcessStartedAt.UnixMilli()}

	lastContact, err := r.lastPhoneContact(ctx, nowMS)
	if err != nil {
		return NowView{}, err
	}
	view.LastPhoneContactMS = lastContact

	open, err := r.openIncidents(ctx, nowMS)
	if err != nil {
		return NowView{}, err
	}
	view.OpenIncidents = len(open)
	view.NeedsALook = needsALook(open)
	view.Status = statusFor(nowMS, lastContact, in.ProcessStartedAt.UnixMilli(), len(open))

	if err := r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(request_count), 0) FROM request_rollup_hourly
		WHERE hour_ms >= ? AND hour_ms <= ?`, in.LocalMidnight.UnixMilli(), nowMS).Scan(&view.RequestsToday); err != nil {
		return NowView{}, fmt.Errorf("activityread: requests today: %w", err)
	}
	if view.ChangesToday, view.RecentChanges, err = r.todayChanges(ctx, in.LocalMidnight.UnixMilli(), nowMS); err != nil {
		return NowView{}, err
	}
	if view.Hours, err = r.hourBars(ctx, nowMS); err != nil {
		return NowView{}, err
	}
	return view, nil
}

// statusFor computes the status sentence. Open problems win; otherwise the
// phone is quiet once QuietThreshold has passed since its last contact, or
// since the bridge started when no contact is stored.
func statusFor(nowMS int64, lastContactMS *int64, processStartMS int64, problems int) Status {
	if problems == 1 {
		return Status{Kind: StatusProblems, Problems: 1, Sentence: "1 problem needs a look"}
	}
	if problems > 1 {
		return Status{Kind: StatusProblems, Problems: problems, Sentence: fmt.Sprintf("%d problems need a look", problems)}
	}
	reference := processStartMS
	if lastContactMS != nil {
		reference = *lastContactMS
	}
	if silent := nowMS - reference; silent >= QuietThreshold.Milliseconds() {
		minutes := int(silent / time.Minute.Milliseconds())
		return Status{Kind: StatusQuiet, QuietMinutes: minutes, Sentence: fmt.Sprintf("The phone has been quiet for %d min", minutes)}
	}
	return Status{Kind: StatusInSync, Sentence: "Phone and bridge are in sync"}
}

// lastPhoneContact returns the newest capture the phone sent within the
// ledger span, or nil when none is stored.
func (r *Reader) lastPhoneContact(ctx context.Context, nowMS int64) (*int64, error) {
	var at int64
	err := r.db.QueryRowContext(ctx, `SELECT captured_at_ms FROM request_captures
		WHERE captured_at_ms >= ? AND captured_at_ms <= ? AND kind <> ?
		ORDER BY captured_at_ms DESC LIMIT 1`, nowMS-LedgerSpan.Milliseconds(), nowMS, notPhoneContactKind).Scan(&at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("activityread: last phone contact: %w", err)
	}
	return &at, nil
}

// openIncidents returns the open fingerprints: an occurrence within OpenSpan.
// A manual pin is a bookmark, not a problem, so it never counts as open.
func (r *Reader) openIncidents(ctx context.Context, nowMS int64) ([]IncidentSummary, error) {
	summaries, err := r.incidentSummaries(ctx, nowMS, OpenSpan, scope{all: true})
	if err != nil {
		return nil, err
	}
	return slices.DeleteFunc(summaries, func(s IncidentSummary) bool {
		return s.Reason == string(incident.ReasonManualPin)
	}), nil
}

// needsALook orders open incidents errors first, then new first, then
// newest first, and keeps NeedsALookLimit of them.
func needsALook(open []IncidentSummary) []IncidentSummary {
	sorted := slices.Clone(open)
	slices.SortStableFunc(sorted, func(a, b IncidentSummary) int {
		return cmp.Or(boolFirst(a.IsError, b.IsError), boolFirst(a.IsNew, b.IsNew), cmp.Compare(b.LatestAtMS, a.LatestAtMS))
	})
	return sorted[:min(len(sorted), NeedsALookLimit)]
}

// boolFirst orders true before false.
func boolFirst(a, b bool) int {
	switch {
	case a == b:
		return 0
	case a:
		return -1
	}
	return 1
}

// hourBars returns the last 24 hourly buckets, oldest first, ending with the
// current hour.
func (r *Reader) hourBars(ctx context.Context, nowMS int64) ([]HourBar, error) {
	current := nowMS - nowMS%hourMS
	first := current - 23*hourMS
	bars := make([]HourBar, 24)
	for i := range bars {
		bars[i].HourStartMS = first + int64(i)*hourMS
	}
	rows, err := r.db.QueryContext(ctx, `SELECT hour_ms, SUM(request_count),
		SUM(CASE WHEN status_class >= 4 THEN request_count ELSE 0 END)
		FROM request_rollup_hourly WHERE hour_ms >= ? AND hour_ms <= ? GROUP BY hour_ms`, first, current)
	if err != nil {
		return nil, fmt.Errorf("activityread: hourly bars: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var hour, count, failed int64
		if err := rows.Scan(&hour, &count, &failed); err != nil {
			return nil, fmt.Errorf("activityread: scan hourly bar: %w", err)
		}
		bar := &bars[(hour-first)/hourMS]
		bar.Count, bar.Failed, bar.HasData = count, failed, true
		if count > 0 {
			bar.FailedShare = float64(failed) / float64(count)
		}
	}
	return bars, rows.Err()
}
