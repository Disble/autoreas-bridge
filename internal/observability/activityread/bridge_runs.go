package activityread

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"autoreas-bridge/internal/observability/syncreading"
)

// A Bridge run goes from one start to its clean close or, when it recorded
// none, to the last row Bridge wrote before the next run booted (S6 P5). Runs
// are read from stored rows on each read; nothing is stored for them.
const (
	// startEventType is the event type of a start row (syncStartSQL).
	startEventType = "api.listening"
	// bridgeCloseSQL is one clean close: the last row of its run.
	bridgeCloseSQL = `domain = 'desktop' AND level = 'info' AND event_type = 'app.closed'`
	// bootMarkerSQL is the startup marker a run writes as it boots, before its
	// start row: rows from it on belong to the starting run, not the one before.
	bootMarkerSQL = `domain = 'tracer-bullet' AND level = 'info' AND event_type = 'tracer.step'
		AND message = 'tracer bullet ready'`
)

// BridgeStartFacts say how the run before one start ended. ClosedAtMS is its
// clean close. LastEventAtMS, set only when it recorded no close although an
// older close is stored, is the last row it wrote: it did not close normally.
// Both nil means no close is stored before the start, so how it ended is
// unknown: it ran before closes were recorded.
type BridgeStartFacts struct {
	ClosedAtMS    *int64
	LastEventAtMS *int64
}

// bridgeRun is one retained start, how the run before it ended, and when its
// own run ended. endMS is nil for the newest run while it has no close.
type bridgeRun struct {
	startMS int64
	before  BridgeStartFacts
	endMS   *int64
}

// bridgeRuns reads every retained start, oldest first, with how the run
// before it ended: a close after the previous start is its clean close; else
// the run before ends at the last row stored before this start's boot marker,
// or before the start itself when the run wrote no marker. That end is also
// the previous run's endMS; the newest run ends at a close after its start.
func (r *Reader) bridgeRuns(ctx context.Context) ([]bridgeRun, error) {
	starts, err := r.SyncStarts(ctx)
	if err != nil {
		return nil, err
	}
	closes, err := r.eventTimes(ctx, bridgeCloseSQL)
	if err != nil {
		return nil, err
	}
	boots, err := r.eventTimes(ctx, bootMarkerSQL)
	if err != nil {
		return nil, err
	}
	runs, unclosed := pairStarts(starts, closes, boots)
	lastByBoot, err := r.lastRowsBefore(ctx, unclosed)
	if err != nil {
		return nil, err
	}
	endRuns(runs, unclosed, lastByBoot, closes)
	return runs, nil
}

// pairStarts builds one run per start with its clean close, and names the
// boundary to look behind for each start whose previous run recorded none.
func pairStarts(starts []syncreading.Start, closes, boots []int64) ([]bridgeRun, map[int]int64) {
	runs := make([]bridgeRun, len(starts))
	unclosed := map[int]int64{}
	previousMS := int64(math.MinInt64)
	for i, start := range starts {
		runs[i].startMS = start.AtMS
		if closedMS, ok := latestBetween(closes, previousMS, start.AtMS); ok {
			runs[i].before.ClosedAtMS = &closedMS
		} else {
			unclosed[i] = start.AtMS
			if bootMS, ok := latestBetween(boots, previousMS, start.AtMS); ok {
				unclosed[i] = bootMS
			}
		}
		previousMS = start.AtMS
	}
	return runs, unclosed
}

// endRuns sets how each run before a start ended and when the runs ended.
func endRuns(runs []bridgeRun, unclosed map[int]int64, lastByBoot map[int64]*int64, closes []int64) {
	for i := range runs {
		previousEnd := runs[i].before.ClosedAtMS
		if bootMS, ok := unclosed[i]; ok {
			previousEnd = lastByBoot[bootMS]
			if _, closedBefore := latestBetween(closes, math.MinInt64, runs[i].startMS); closedBefore {
				runs[i].before.LastEventAtMS = previousEnd
			}
		}
		if i > 0 {
			runs[i-1].endMS = previousEnd
		}
	}
	if newest := len(runs) - 1; newest >= 0 {
		if closedMS, ok := latestBetween(closes, runs[newest].startMS, math.MaxInt64); ok {
			runs[newest].endMS = &closedMS
		}
	}
}

// lastRowsBefore returns the last row stored before each boot of bootsByRun,
// nil when none is, in one query of one indexed seek per boot.
func (r *Reader) lastRowsBefore(ctx context.Context, bootsByRun map[int]int64) (map[int64]*int64, error) {
	boots := []int64{}
	for _, bootMS := range bootsByRun {
		boots = append(boots, bootMS)
	}
	list, err := json.Marshal(boots)
	if err != nil {
		return nil, fmt.Errorf("activityread: encode boots: %w", err)
	}
	rows, err := r.db.QueryContext(ctx, `SELECT boot.value, (SELECT MAX(occurred_at_ms) FROM runtime_events
		WHERE occurred_at_ms < boot.value) FROM json_each(?) AS boot`, string(list))
	if err != nil {
		return nil, fmt.Errorf("activityread: last rows before boots: %w", err)
	}
	defer func() { _ = rows.Close() }()
	lastByBoot := map[int64]*int64{}
	for rows.Next() {
		var bootMS int64
		var lastMS *int64
		if err := rows.Scan(&bootMS, &lastMS); err != nil {
			return nil, fmt.Errorf("activityread: scan last row before boot: %w", err)
		}
		lastByBoot[bootMS] = lastMS
	}
	return lastByBoot, rows.Err()
}

// eventTimes returns the times of the runtime events matching predicate, oldest first.
func (r *Reader) eventTimes(ctx context.Context, predicate string) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT occurred_at_ms FROM runtime_events WHERE `+predicate+` ORDER BY occurred_at_ms`)
	if err != nil {
		return nil, fmt.Errorf("activityread: event times: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var times []int64
	for rows.Next() {
		var atMS int64
		if err := rows.Scan(&atMS); err != nil {
			return nil, fmt.Errorf("activityread: scan event time: %w", err)
		}
		times = append(times, atMS)
	}
	return times, rows.Err()
}

// latestBetween returns the latest of the ascending times strictly between lo and hi.
func latestBetween(times []int64, lo, hi int64) (int64, bool) {
	i := sort.Search(len(times), func(i int) bool { return times[i] >= hi })
	if i == 0 || times[i-1] <= lo {
		return 0, false
	}
	return times[i-1], true
}

// attachBridgeStarts sets the facts of each start line of the page: a System
// line of api.listening, which stands for its newest start. A page without one
// reads nothing.
func (r *Reader) attachBridgeStarts(ctx context.Context, lines []FeedLine) error {
	var starts []*FeedLine
	for i := range lines {
		if lines[i].Line.Detail == startEventType {
			starts = append(starts, &lines[i])
		}
	}
	if len(starts) == 0 {
		return nil
	}
	runs, err := r.bridgeRuns(ctx)
	if err != nil {
		return err
	}
	byStart := map[int64]BridgeStartFacts{}
	for _, run := range runs {
		byStart[run.startMS] = run.before
	}
	for _, line := range starts {
		if facts, ok := byStart[line.Line.AtMS]; ok {
			line.BridgeStart = &facts
		}
	}
	return nil
}
