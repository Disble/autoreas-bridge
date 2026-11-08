package activityread

import (
	"testing"
	"time"
)

// hoursAgo returns the epoch milliseconds n hours before testNow.
func hoursAgo(n int) int64 {
	return testNow.Add(-time.Duration(n) * time.Hour).UnixMilli()
}

// startEvent is one api.listening row at atMS.
func startEvent(atMS int64) event {
	return event{atMS: atMS, domain: "api", level: "info", message: "http server listening on 0.0.0.0:8787", eventType: "api.listening"}
}

// closeEvent is one clean close row at atMS.
func closeEvent(atMS int64) event {
	return event{atMS: atMS, domain: "desktop", level: "info", message: "bridge closed cleanly", eventType: "app.closed"}
}

// bootEvent is the startup marker a run writes before its start.
func bootEvent(atMS int64) event {
	return event{atMS: atMS, domain: "tracer-bullet", level: "info", message: "tracer bullet ready", eventType: "tracer.step"}
}

func TestFeedSaysHowTheRunBeforeEachBridgeStartEnded(t *testing.T) {
	db, r := openTestReader(t)
	for _, e := range []event{
		{atMS: hoursAgo(80), domain: "sync", level: "info", message: "a row of an older run"},
		startEvent(hoursAgo(70)), // no close stored before it, only after
		closeEvent(hoursAgo(65)),
		bootEvent(hoursAgo(50) - 5000), startEvent(hoursAgo(50)), // closed at 65 h ago
		{atMS: hoursAgo(50), domain: "storage", level: "warn", message: "a warning at the start's time", eventType: "storage.low"},
		{atMS: hoursAgo(45), domain: "sync", level: "info", message: "last row of the run", eventType: "sync.ran"},
		closeEvent(hoursAgo(31)), // closes the 40 h run, so the 20 h start finds no close after its previous start
		bootEvent(hoursAgo(40) - 5000), {atMS: hoursAgo(40) - 2000, domain: "sync", level: "info", message: "early boot row"},
		startEvent(hoursAgo(40)), // its run's own boot rows are not the run before it
		{atMS: hoursAgo(30), domain: "api", level: "info", message: "http server listening on 0.0.0.0:8787"}, // a start stored before event types
		startEvent(hoursAgo(20)), // no boot marker: the run before ends at the last row before the start
	} {
		insertEvent(t, db, e)
	}

	var got []string
	for _, line := range systemLines(t, r, FeedInput{}) {
		if line.Line.Detail != "api.listening" {
			if line.BridgeStart != nil {
				t.Errorf("line %q carries start facts %+v", line.Line.Title, line.BridgeStart)
			}
			continue
		}
		facts := line.BridgeStart
		if facts == nil {
			t.Fatalf("start at %d has no facts", line.Line.AtMS)
		}
		got = append(got, describeStart(line.Line.AtMS, *facts))
	}
	want := []string{
		describeStart(hoursAgo(20), BridgeStartFacts{LastEventAtMS: ptr(hoursAgo(30))}),
		describeStart(hoursAgo(40), BridgeStartFacts{LastEventAtMS: ptr(hoursAgo(45))}),
		describeStart(hoursAgo(50), BridgeStartFacts{ClosedAtMS: ptr(hoursAgo(65))}),
		describeStart(hoursAgo(70), BridgeStartFacts{}),
	}
	if len(got) != len(want) {
		t.Fatalf("starts = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("start %d = %s, want %s", i, got[i], want[i])
		}
	}

	// A page holding one start reads it too.
	page := systemLines(t, r, FeedInput{FromMS: hoursAgo(51), ToMS: hoursAgo(49)})
	if len(page) != 2 || page[1].BridgeStart == nil || describeStart(page[1].Line.AtMS, *page[1].BridgeStart) != want[2] {
		t.Fatalf("one-start page = %+v, want the warning and the start closed at 65 h ago", page)
	}
}

func TestLatestBetweenExcludesBothBounds(t *testing.T) {
	times := []int64{10, 20, 30}
	for _, c := range []struct {
		lo, hi, want int64
		ok           bool
	}{
		{lo: 0, hi: 31, want: 30, ok: true},
		{lo: 10, hi: 30, want: 20, ok: true},
		{lo: 20, hi: 30, ok: false},
		{lo: 0, hi: 10, ok: false},
	} {
		got, ok := latestBetween(times, c.lo, c.hi)
		if got != c.want || ok != c.ok {
			t.Errorf("latestBetween(%d, %d) = %d, %v, want %d, %v", c.lo, c.hi, got, ok, c.want, c.ok)
		}
	}
}

// describeStart prints one start and its facts for comparison.
func describeStart(atMS int64, facts BridgeStartFacts) string {
	text := func(ms *int64) string {
		if ms == nil {
			return "-"
		}
		return time.UnixMilli(*ms).UTC().Format(time.DateTime)
	}
	return time.UnixMilli(atMS).UTC().Format(time.DateTime) + " closed " + text(facts.ClosedAtMS) + " last " + text(facts.LastEventAtMS)
}
