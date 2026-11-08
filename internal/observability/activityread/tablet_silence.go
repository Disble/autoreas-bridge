package activityread

import (
	"context"
	"fmt"
	"slices"
	"time"
)

// A tablet silence (S6 P4) is 60 minutes or more in which Bridge was on and
// received no report from a device. It is computed when Activity reads, from
// the receipt times of the stored reports and the Bridge runs: nothing watches
// for it and nothing about it is stored.
const (
	// silenceMinimum is the shortest silence.
	silenceMinimum = time.Hour
	// silenceGapsSQL reads when each device was heard and keeps each time
	// followed by none for at least the minimum, and the device's last (next
	// null). From its oldest retained cycle_report on, heard is the receipt
	// time of any of its reports, minute precision. Before it, a receipt does
	// not count (a summary may arrive late, after a reconnect): an hour is heard
	// only when its hourly_summary, stored at the hour's start, counts a closed
	// attempt, the one outcome in which Bridge answered (L17); the whole hour
	// is heard, hour precision.
	silenceGapsSQL = `WITH since AS (
			SELECT device_id, MIN(reported_at_ms) AS ms FROM device_telemetry_events WHERE kind = 'cycle_report' GROUP BY device_id),
		heard AS (
			SELECT e.device_id, e.kind, e.reported_at_ms AS from_ms, e.reported_at_ms AS to_ms, NULL AS hour_ms
			FROM device_telemetry_events AS e JOIN since USING (device_id) WHERE e.reported_at_ms >= since.ms
			UNION ALL
			SELECT e.device_id, e.kind, e.observed_at_ms, e.observed_at_ms + ?1, e.observed_at_ms
			FROM device_telemetry_events AS e LEFT JOIN since USING (device_id)
			WHERE e.kind = 'hourly_summary' AND (since.ms IS NULL OR e.observed_at_ms < since.ms)
				AND EXISTS (SELECT 1 FROM json_each(e.payload_json, '$.counts') AS c
					WHERE json_extract(c.value, '$.outcome') = 'closed' AND json_extract(c.value, '$.count') > 0))
		SELECT device_id, kind, to_ms, hour_ms, next_kind, next_ms, next_hour_ms FROM (
			SELECT device_id, kind, to_ms, hour_ms, LEAD(kind) OVER w AS next_kind, LEAD(from_ms) OVER w AS next_ms,
				LEAD(hour_ms) OVER w AS next_hour_ms
			FROM heard WINDOW w AS (PARTITION BY device_id ORDER BY from_ms, to_ms))
		WHERE next_ms IS NULL OR next_ms - to_ms >= ?1`
)

// LineTabletSilence is one tablet silence: a failed Traffic line whose origin
// is Bridge, an hour after the silence began.
const LineTabletSilence LineKind = "tablet_silence"

// SilenceReport is one stored report that bounds a silence: its kind and when
// Bridge received it. HourStartMS is set when the device was heard only by the
// hour: its hourly_summary's hour, whose end or start ReceivedAtMS then is.
type SilenceReport struct {
	Kind         string
	ReceivedAtMS int64
	HourStartMS  *int64
}

// TabletSilence is one silence of a device and what it rests on. StartMS is
// the later of the last report and the Bridge start. EndMS is nil while it
// lasts; it ends at NextReport, or at BridgeStoppedAtMS when Bridge stopped
// first: its clean close, or the last row it wrote before the next start.
type TabletSilence struct {
	DeviceID          string
	StartMS           int64
	EndMS             *int64
	LastReport        SilenceReport
	NextReport        *SilenceReport
	BridgeStartedAtMS int64
	BridgeStoppedAtMS *int64
}

// reportGap is one stretch of a device without reports: from its report last
// to the report next, nil when none came after it.
type reportGap struct {
	deviceID string
	last     SilenceReport
	next     *SilenceReport
}

// runSpan is when Bridge was on: from a start to its end, nil while it runs.
type runSpan struct {
	startMS int64
	endMS   *int64
}

// silencesOf cuts each gap by the runs: the part of a gap inside a run that
// lasts the minimum or more is a silence. Time outside every run, Bridge off
// or unknown, is never silence.
func silencesOf(gaps []reportGap, spans []runSpan, nowMS int64) []TabletSilence {
	var silences []TabletSilence
	for _, gap := range gaps {
		gapEnd := nowMS
		if gap.next != nil {
			gapEnd = gap.next.ReceivedAtMS
		}
		for _, span := range spans {
			if silence, ok := silenceInRun(gap, gapEnd, span, nowMS); ok {
				silences = append(silences, silence)
			}
		}
	}
	return silences
}

// silenceInRun reads the part of one gap inside one run, when it lasts the minimum.
func silenceInRun(gap reportGap, gapEnd int64, span runSpan, nowMS int64) (TabletSilence, bool) {
	spanEnd := nowMS
	if span.endMS != nil {
		spanEnd = *span.endMS
	}
	startMS, endMS := max(gap.last.ReceivedAtMS, span.startMS), min(gapEnd, spanEnd)
	if endMS-startMS < silenceMinimum.Milliseconds() {
		return TabletSilence{}, false
	}
	silence := TabletSilence{DeviceID: gap.deviceID, StartMS: startMS, LastReport: gap.last, BridgeStartedAtMS: span.startMS}
	if gap.next != nil && endMS == gapEnd {
		silence.EndMS, silence.NextReport = &endMS, gap.next
	} else if span.endMS != nil {
		silence.EndMS, silence.BridgeStoppedAtMS = &endMS, &endMS
	}
	return silence, true
}

// tabletSilences reads every silence of the retained reports and runs, as of nowMS.
func (r *Reader) tabletSilences(ctx context.Context, nowMS int64) ([]TabletSilence, error) {
	runs, err := r.bridgeRuns(ctx)
	if err != nil {
		return nil, err
	}
	spans := make([]runSpan, len(runs))
	for i, run := range runs {
		spans[i] = runSpan{startMS: run.startMS, endMS: run.endMS}
	}
	rows, err := r.db.QueryContext(ctx, silenceGapsSQL, silenceMinimum.Milliseconds())
	if err != nil {
		return nil, fmt.Errorf("activityread: silence gaps: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var gaps []reportGap
	for rows.Next() {
		var gap reportGap
		var nextKind *string
		var nextMS, nextHourMS *int64
		if err := rows.Scan(&gap.deviceID, &gap.last.Kind, &gap.last.ReceivedAtMS, &gap.last.HourStartMS, &nextKind, &nextMS,
			&nextHourMS); err != nil {
			return nil, fmt.Errorf("activityread: scan silence gap: %w", err)
		}
		if nextMS != nil {
			gap.next = &SilenceReport{Kind: *nextKind, ReceivedAtMS: *nextMS, HourStartMS: nextHourMS}
		}
		gaps = append(gaps, gap)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("activityread: silence gaps: %w", err)
	}
	return silencesOf(gaps, spans, nowMS), nil
}

// silenceAtMS is where a silence's line sits: the moment it reached the minimum.
func silenceAtMS(silence TabletSilence) int64 {
	return silence.StartMS + silenceMinimum.Milliseconds()
}

// readsSilences reports whether a plan reads tablet silences: Traffic owns
// them, and their origin is Bridge, so the phone origin leaves them out.
func (p feedPlan) readsSilences() bool {
	return p.reads(FeedTraffic) && p.origin != OriginPhone
}

// feedSilenceLines reads one failed Traffic line per silence whose line time
// falls in the page's range and after its cursor.
func (r *Reader) feedSilenceLines(ctx context.Context, plan feedPlan, p sourcePage) ([]item[FeedLine], error) {
	if !plan.readsSilences() {
		return nil, nil
	}
	silences, err := r.tabletSilences(ctx, plan.nowMS)
	if err != nil {
		return nil, err
	}
	var items []item[FeedLine]
	for _, paged := range silencesInPage(silences, p) {
		line := FeedLine{Type: FeedTraffic, Origin: OriginBridge, Failed: true, Silence: paged.silence,
			Line: LedgerLine{Kind: LineTabletSilence, ID: paged.pos.key, AtMS: paged.pos.atMS}}
		items = append(items, item[FeedLine]{pos: paged.pos, value: line})
	}
	return items, nil
}

// pagedSilence is one silence inside a page, with its line's place.
type pagedSilence struct {
	silence *TabletSilence
	pos     cursor
}

// silencesInPage keeps the silences whose line time falls in the page's range
// and after its cursor.
func silencesInPage(silences []TabletSilence, p sourcePage) []pagedSilence {
	var paged []pagedSilence
	for i := range silences {
		atMS := silenceAtMS(silences[i])
		pos := cursor{atMS: atMS, rank: rankSilence, key: silences[i].DeviceID + ":" + formatID(silences[i].StartMS)}
		if atMS < p.sinceMS || atMS > p.nowMS || (p.cursor != nil && comparePositions(*p.cursor, pos) >= 0) {
			continue
		}
		paged = append(paged, pagedSilence{silence: &silences[i], pos: pos})
	}
	return paged
}

// silenceLines reads one History line per silence, for search_history. A
// silence is about the phone, so only the scopes that read the phone list it.
func (r *Reader) silenceLines(ctx context.Context, s scope, p sourcePage) ([]item[LedgerLine], error) {
	if !s.readsPhone() {
		return nil, nil
	}
	silences, err := r.tabletSilences(ctx, p.nowMS)
	if err != nil {
		return nil, err
	}
	var items []item[LedgerLine]
	for _, paged := range silencesInPage(silences, p) {
		items = append(items, item[LedgerLine]{pos: paged.pos, value: silenceLedgerLine(paged, p.nowMS)})
	}
	return items, nil
}

// silenceLedgerLine says who went silent and for how long.
func silenceLedgerLine(paged pagedSilence, nowMS int64) LedgerLine {
	line := LedgerLine{Kind: LineTabletSilence, ID: paged.pos.key, AtMS: paged.pos.atMS, Source: paged.silence.DeviceID}
	if paged.silence.EndMS != nil {
		line.Title = "Tablet was silent"
		line.Detail = fmt.Sprintf("%d min", (*paged.silence.EndMS-paged.silence.StartMS)/time.Minute.Milliseconds())
		return line
	}
	line.Title = "Tablet silent"
	line.Detail = fmt.Sprintf("%d min so far", (nowMS-paged.silence.StartMS)/time.Minute.Milliseconds())
	return line
}

// OpenTabletSilences returns the silences still running at now: the tablets
// not heard for the minimum or more while Bridge is on.
func (r *Reader) OpenTabletSilences(ctx context.Context, now time.Time) ([]TabletSilence, error) {
	silences, err := r.tabletSilences(ctx, now.UnixMilli())
	if err != nil {
		return nil, err
	}
	return slices.DeleteFunc(silences, func(s TabletSilence) bool { return s.EndMS != nil }), nil
}

// countSilences tallies each silence as one failed Traffic line of the bucket
// holding its line time, where Feed lists it.
func (r *Reader) countSilences(ctx context.Context, plan feedPlan, buckets []bucket, counts []bucketCounts) error {
	if !plan.readsSilences() {
		return nil
	}
	silences, err := r.tabletSilences(ctx, plan.nowMS)
	if err != nil {
		return err
	}
	for _, silence := range silences {
		atMS := silenceAtMS(silence)
		for i, b := range buckets {
			if atMS >= b.loMS && atMS <= b.hiMS {
				counts[i].add(FeedTraffic, 1, 1)
			}
		}
	}
	return nil
}
