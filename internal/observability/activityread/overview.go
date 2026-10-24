package activityread

import (
	"context"
	"fmt"
	"time"
)

// ChartScale is one scale of the Activity time chart (activity-ui-design-v2.md, Time chart and range).
type ChartScale string

const (
	// Scale24h is 24 hourly slots ending with the current hour.
	Scale24h ChartScale = "24h"
	// Scale7d is 7 daily slots ending with today.
	Scale7d ChartScale = "7d"
	// Scale30d is 30 daily slots ending with today.
	Scale30d ChartScale = "30d"
	// Scale90d is 90 daily slots ending with today: the ledger span.
	Scale90d ChartScale = "90d"
)

// scaleDays is the number of daily slots of each daily scale.
var scaleDays = map[ChartScale]int{Scale7d: 7, Scale30d: 30, Scale90d: 90}

// OverviewInput selects the chart of one scale and the per-type counts of one
// range and origin. A zero FromMS or ToMS means the edge of the scale's window.
// Types and FailuresOnly select the lines the bars count, as FeedInput selects
// the lines the feed lists: Types empty means every type. They never narrow
// the per-type counts, which show what turning a type on would add.
type OverviewInput struct {
	Now          time.Time
	Scale        ChartScale
	FromMS       int64
	ToMS         int64
	Origin       FeedOrigin
	Types        []FeedType
	FailuresOnly bool
}

// ChartSlot is one bar: the feed lines whose time falls in [StartMS, EndMS),
// and how many of them failed.
type ChartSlot struct {
	StartMS int64
	EndMS   int64
	Count   int64
	Failed  int64
}

// TypeCount is how many feed lines of one type the range and origin hold,
// and how many of them failed.
type TypeCount struct {
	Type   FeedType
	Lines  int64
	Failed int64
}

// OverviewView is the chart of every origin and the per-type counts of the
// range and origin.
type OverviewView struct {
	Slots []ChartSlot
	Types []TypeCount
}

// Overview returns the chart slots of in.Scale and the per-type counts. Both
// count exactly the lines Feed would list: a bar the lines of the origin,
// types and failures-only the table shows, a chip every line of its type in
// the range and origin. The slots always span the whole scale window; the
// range never drops one.
func (r *Reader) Overview(ctx context.Context, in OverviewInput) (OverviewView, error) {
	slots, err := chartSlots(in.Now, in.Scale)
	if err != nil {
		return OverviewView{}, err
	}
	typePlan, err := planFeed(FeedInput{Origin: in.Origin})
	if err != nil {
		return OverviewView{}, err
	}
	slotPlan, err := planFeed(FeedInput{Origin: in.Origin, Types: in.Types, FailuresOnly: in.FailuresOnly})
	if err != nil {
		return OverviewView{}, err
	}
	fromMS := slots[0].StartMS
	if in.FromMS > 0 {
		fromMS = in.FromMS
	}
	fromMS, toMS := feedSpan(FeedInput{Now: in.Now, FromMS: fromMS, ToMS: in.ToMS})

	slotBuckets := make([]bucket, len(slots))
	for i, slot := range slots {
		slotBuckets[i] = bucket{loMS: slot.StartMS, hiMS: slot.EndMS - 1}
	}
	perSlot, err := r.countFeed(ctx, slotPlan, slotBuckets)
	if err != nil {
		return OverviewView{}, err
	}
	for i := range slots {
		for _, c := range perSlot[i] {
			slots[i].Count += c.Lines
			slots[i].Failed += c.Failed
		}
		// Failures-only lists exactly the failed lines, as Feed does.
		if slotPlan.failuresOnly {
			slots[i].Count = slots[i].Failed
		}
	}
	perRange, err := r.countFeed(ctx, typePlan, []bucket{{loMS: fromMS, hiMS: toMS}})
	if err != nil {
		return OverviewView{}, err
	}
	types := make([]TypeCount, len(FeedTypes))
	for i, t := range FeedTypes {
		types[i] = TypeCount{Type: t, Lines: perRange[0][t].Lines, Failed: perRange[0][t].Failed}
	}
	return OverviewView{Slots: slots, Types: types}, nil
}

// chartSlots returns the empty slots of one scale, oldest first. Hourly slots
// end with the hour holding now; daily slots are local days ending today.
func chartSlots(now time.Time, scale ChartScale) ([]ChartSlot, error) {
	if scale == Scale24h {
		current := now.Truncate(time.Hour)
		slots := make([]ChartSlot, 24)
		for i := range slots {
			start := current.Add(time.Duration(i-23) * time.Hour)
			slots[i] = ChartSlot{StartMS: start.UnixMilli(), EndMS: start.Add(time.Hour).UnixMilli()}
		}
		return slots, nil
	}
	days, ok := scaleDays[scale]
	if !ok {
		return nil, fmt.Errorf("activityread: unknown chart scale %q", scale)
	}
	today := dayStart(now)
	slots := make([]ChartSlot, days)
	for i := range slots {
		start := today.AddDate(0, 0, i-days+1)
		slots[i] = ChartSlot{StartMS: start.UnixMilli(), EndMS: start.AddDate(0, 0, 1).UnixMilli()}
	}
	return slots, nil
}
