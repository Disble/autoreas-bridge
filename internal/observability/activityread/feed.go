package activityread

import (
	"context"
	"fmt"
	"slices"
	"time"
)

// Feed ranks extend the ledger ranks: the tie-break order of feed lines
// sharing a millisecond.
const (
	rankTrafficHour = rankIncident + iota + 1
	rankDownloadRun
	rankSystemGroup
)

// Feed returns one page of the Activity feed (activity-ui-design-v2.md, Feed)
// grouped by local day, newest first. Filtering happens in SQL, so a page
// never shows a line its filters exclude and the cursor never skips one.
func (r *Reader) Feed(ctx context.Context, in FeedInput) (FeedView, error) {
	plan, err := planFeed(in)
	if err != nil {
		return FeedView{}, err
	}
	c, err := parseCursor(in.Cursor)
	if err != nil {
		return FeedView{}, err
	}
	limit := clampLimit(in.Limit)
	fromMS, toMS := feedSpan(in)
	page := sourcePage{cursor: c, sinceMS: fromMS, nowMS: toMS, fetch: limit + 1}

	var items []item[FeedLine]
	for _, read := range []func(context.Context, feedPlan, sourcePage) ([]item[FeedLine], error){
		r.feedChangeLines, r.feedPhoneReportLines, r.feedTrafficLines, r.feedRunLines, r.feedTaskLines, r.feedSystemLines,
	} {
		lines, err := read(ctx, plan, page)
		if err != nil {
			return FeedView{}, err
		}
		items = append(items, lines...)
	}
	lines, next := takePage(items, limit)
	if err := r.attachIncidents(ctx, lines); err != nil {
		return FeedView{}, err
	}
	return FeedView{Days: groupFeedByDay(lines, in.Now.Location()), NextCursor: next}, nil
}

// feedPlan is the set of types one feed read covers, after the origin is applied.
type feedPlan struct {
	types        map[FeedType]bool
	failuresOnly bool
}

// reads reports whether the plan covers t.
func (p feedPlan) reads(t FeedType) bool {
	return p.types[t]
}

// planFeed validates the origin and types of in and resolves the types read.
func planFeed(in FeedInput) (feedPlan, error) {
	origin := in.Origin
	if origin == "" {
		origin = OriginAll
	}
	if origin != OriginAll && origin != OriginPhone && origin != OriginBridge {
		return feedPlan{}, fmt.Errorf("activityread: unknown feed origin %q", origin)
	}
	selected := in.Types
	if len(selected) == 0 {
		selected = FeedTypes
	}
	types := map[FeedType]bool{}
	for _, t := range selected {
		if !slices.Contains(FeedTypes, t) {
			return feedPlan{}, fmt.Errorf("activityread: unknown feed type %q", t)
		}
		types[t] = true
	}
	for t := range types {
		if origin != OriginAll && originOf(t) != origin {
			delete(types, t)
		}
	}
	return feedPlan{types: types, failuresOnly: in.FailuresOnly}, nil
}

// originOf returns where every line of a type happens.
func originOf(t FeedType) FeedOrigin {
	if t == FeedChange || t == FeedTraffic {
		return OriginPhone
	}
	return OriginBridge
}

// feedSpan clamps the requested range to the ledger span ending now. A zero
// bound means the span's edge.
func feedSpan(in FeedInput) (int64, int64) {
	nowMS := in.Now.UnixMilli()
	fromMS := nowMS - LedgerSpan.Milliseconds()
	if in.FromMS > fromMS {
		fromMS = in.FromMS
	}
	toMS := nowMS
	if in.ToMS > 0 && in.ToMS < toMS {
		toMS = in.ToMS
	}
	return fromMS, toMS
}

// groupFeedByDay groups newest-first feed lines by their local day in loc.
func groupFeedByDay(lines []FeedLine, loc *time.Location) []FeedDay {
	var days []FeedDay
	for _, line := range lines {
		start := dayStart(time.UnixMilli(line.Line.AtMS).In(loc)).UnixMilli()
		if len(days) == 0 || days[len(days)-1].DayStartMS != start {
			days = append(days, FeedDay{DayStartMS: start})
		}
		days[len(days)-1].Lines = append(days[len(days)-1].Lines, line)
	}
	return days
}
