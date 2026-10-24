package activityread

import (
	"context"
	"testing"
)

// overviewOf reads the overview and fails the test on error.
func overviewOf(t *testing.T, r *Reader, in OverviewInput) OverviewView {
	t.Helper()
	in.Now = testNow
	view, err := r.Overview(context.Background(), in)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	return view
}

// countOf returns the count row of one type.
func countOf(t *testing.T, view OverviewView, feedType FeedType) TypeCount {
	t.Helper()
	for _, c := range view.Types {
		if c.Type == feedType {
			return c
		}
	}
	t.Fatalf("no count for %s in %+v", feedType, view.Types)
	return TypeCount{}
}

func TestOverviewHourlySlotsCountFeedLinesAndFailures(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)
	insertRun(t, db, "run-bad", "manual_anime", minutesAgo(5), "error", 0)

	view := overviewOf(t, r, OverviewInput{Scale: Scale24h})
	if len(view.Slots) != 24 {
		t.Fatalf("slots = %d, want 24", len(view.Slots))
	}
	last, previous := view.Slots[23], view.Slots[22]
	if last.StartMS != hourStart(0) || last.EndMS != hourStart(-1) || previous.StartMS != hourStart(1) {
		t.Fatalf("last slots = %+v %+v, want the current hour and the one before", previous, last)
	}
	// 17:00–18:00 holds the change, the two runs, the task, the edit, the bridge line and its own traffic hour.
	if previous.Count != 7 || previous.Failed != 1 {
		t.Errorf("17:00 slot = %+v, want 7 lines and 1 failure", previous)
	}
	if last.Count != 0 || view.Slots[0].Count != 0 {
		t.Errorf("empty slots = %+v %+v, want 0", view.Slots[0], last)
	}

	// Every count follows the origin: the phone keeps only the change and its traffic hour.
	phone := overviewOf(t, r, OverviewInput{Scale: Scale24h, Origin: OriginPhone})
	if got := phone.Slots[22]; got.Count != 2 || got.Failed != 0 {
		t.Errorf("phone 17:00 slot = %+v, want 2 lines and no failure", got)
	}
}

func TestOverviewDailySlotsStartAtLocalMidnight(t *testing.T) {
	db, r := openTestReader(t)
	insertChange(t, db, "mobile", "Hotaru no Yomeiri", minutesAgo(60), 0)
	insertChange(t, db, "mobile", "Hotaru no Yomeiri", minutesAgo(19*60), 0) // yesterday 23:00
	insertChange(t, db, "desktop", "Ao Ashi", minutesAgo(8*24*60), 0)        // outside 7 days

	for _, tc := range []struct {
		scale ChartScale
		days  int
	}{{Scale7d, 7}, {Scale30d, 30}, {Scale90d, 90}} {
		view := overviewOf(t, r, OverviewInput{Scale: tc.scale})
		if len(view.Slots) != tc.days {
			t.Fatalf("%s slots = %d, want %d", tc.scale, len(view.Slots), tc.days)
		}
		today := dayStart(testNow).UnixMilli()
		if last := view.Slots[tc.days-1]; last.StartMS != today || last.EndMS != dayStart(testNow).AddDate(0, 0, 1).UnixMilli() || last.Count != 1 {
			t.Errorf("%s today = %+v, want local midnight with 1 line", tc.scale, last)
		}
		if yesterday := view.Slots[tc.days-2]; yesterday.Count != 1 {
			t.Errorf("%s yesterday = %+v, want 1 line", tc.scale, yesterday)
		}
		if first := view.Slots[0]; first.StartMS != dayStart(testNow).AddDate(0, 0, 1-tc.days).UnixMilli() {
			t.Errorf("%s first slot starts %d", tc.scale, first.StartMS)
		}
	}
	if old := overviewOf(t, r, OverviewInput{Scale: Scale30d}).Slots[21]; old.Count != 1 {
		t.Errorf("30d slot of 8 days ago = %+v, want 1 line", old)
	}
}

func TestOverviewTypeCountsFollowRangeAndOrigin(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)
	insertRun(t, db, "run-bad", "manual_anime", minutesAgo(5), "error", 0)
	insertEvent(t, db, event{atMS: minutesAgo(6), domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})

	all := overviewOf(t, r, OverviewInput{Scale: Scale24h})
	for feedType, want := range map[FeedType]TypeCount{
		FeedChange: {Lines: 1}, FeedTraffic: {Lines: 1}, FeedDownload: {Lines: 2, Failed: 1},
		FeedTask: {Lines: 1}, FeedEdit: {Lines: 1}, FeedBridge: {Lines: 2, Failed: 1},
	} {
		if got := countOf(t, all, feedType); got.Lines != want.Lines || got.Failed != want.Failed {
			t.Errorf("%s = %+v, want %+v", feedType, got, want)
		}
	}

	phone := overviewOf(t, r, OverviewInput{Scale: Scale24h, Origin: OriginPhone})
	if got := countOf(t, phone, FeedDownload); got.Lines != 0 {
		t.Errorf("phone downloads = %+v, want 0", got)
	}
	if got := countOf(t, phone, FeedChange); got.Lines != 1 {
		t.Errorf("phone changes = %+v, want 1", got)
	}
	// The bridge origin skips the phone sources and still counts every source after them.
	bridge := overviewOf(t, r, OverviewInput{Scale: Scale24h, Origin: OriginBridge})
	for feedType, want := range map[FeedType]int64{FeedChange: 0, FeedTraffic: 0, FeedDownload: 2, FeedTask: 1, FeedEdit: 1, FeedBridge: 2} {
		if got := countOf(t, bridge, feedType); got.Lines != want {
			t.Errorf("bridge %s = %+v, want %d lines", feedType, got, want)
		}
	}

	ranged := overviewOf(t, r, OverviewInput{Scale: Scale24h, FromMS: minutesAgo(8), ToMS: minutesAgo(4)})
	if got := countOf(t, ranged, FeedDownload); got.Lines != 1 || got.Failed != 1 {
		t.Errorf("ranged downloads = %+v, want the failed run only", got)
	}
	if got := countOf(t, ranged, FeedChange); got.Lines != 0 {
		t.Errorf("ranged changes = %+v, want 0", got)
	}
	if len(ranged.Slots) != 24 {
		t.Errorf("a range keeps the scale's slots, got %d", len(ranged.Slots))
	}
}

func TestOverviewRejectsAnUnknownScale(t *testing.T) {
	_, r := openTestReader(t)
	if _, err := r.Overview(context.Background(), OverviewInput{Now: testNow, Scale: "12h"}); err == nil {
		t.Fatal("Overview(12h) succeeded, want an error")
	}
	if _, err := r.Overview(context.Background(), OverviewInput{Now: testNow, Scale: Scale24h, Origin: "desk"}); err == nil {
		t.Fatal("Overview(origin desk) succeeded, want an error")
	}
}
