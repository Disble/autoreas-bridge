package activityread

import (
	"context"
	"slices"
	"testing"
)

// systemLines reads every System line of the default range, newest first.
func systemLines(t *testing.T, r *Reader, in FeedInput) []FeedLine {
	t.Helper()
	in.Types = []FeedType{FeedSystem}
	return feedLines(feedOf(t, r, in))
}

func TestFeedOwnsEachEventByTaskDownloadRunOrSystem(t *testing.T) {
	db, r := openTestReader(t)
	insertRun(t, db, "run-a", "scheduled", minutesAgo(50), "error", 1)
	insertEvent(t, db, event{atMS: minutesAgo(10), domain: "schedule", level: "info", message: "tick", eventType: "schedule.tick"})
	insertEvent(t, db, event{atMS: minutesAgo(11), domain: "season", level: "warn", message: "late", eventType: "notification.forwarded", correlationID: "run-a"})
	insertEvent(t, db, event{atMS: minutesAgo(12), domain: "download", level: "error", message: "hoster down", eventType: "download.failed", correlationID: "run-a"})
	insertEvent(t, db, event{atMS: minutesAgo(13), domain: "api", level: "warn", message: "slow write", eventType: "api.slow", correlationID: "run-a"})
	insertEvent(t, db, event{atMS: minutesAgo(14), domain: "download", level: "error", message: "queue lost", eventType: "download.queue"})
	insertEvent(t, db, event{atMS: minutesAgo(15), domain: "api", level: "info", message: "http server listening", eventType: "api.listening"})
	insertEvent(t, db, event{atMS: minutesAgo(16), domain: "anime", level: "info", message: "folder opened", eventType: "anime.folder_opened"})
	insertEvent(t, db, event{atMS: minutesAgo(17), domain: "anime", level: "warn", message: "folder missing", eventType: "anime.folder"})
	insertEvent(t, db, event{atMS: minutesAgo(18), domain: "sync", level: "warn", message: "reconcile", eventType: "sync.reconcile"})
	insertEvent(t, db, event{atMS: minutesAgo(19), domain: "websocket", level: "warn", message: "register", eventType: "websocket.register"})

	lines := feedLines(feedOf(t, r, FeedInput{Origin: OriginBridge, Types: []FeedType{FeedTask, FeedSystem}}))
	var got []string
	for _, line := range lines {
		got = append(got, string(line.Type)+":"+line.Line.Title)
	}
	// The run's own correlated events are its story, whatever their domain; a
	// download event of no run is System; info events other than the start,
	// noise and restating events make no line.
	want := []string{"task:tick", "task:late", "system:queue lost", "system:http server listening", "system:folder missing"}
	if !slices.Equal(got, want) {
		t.Fatalf("lines = %v, want %v", got, want)
	}
	if failed := lines[2]; !failed.Failed || failed.Slow || failed.Origin != OriginBridge || failed.Line.Domain != "download" {
		t.Errorf("download event of no run = %+v, want a failed bridge line", failed)
	}
	if slow := lines[4]; slow.Failed || !slow.Slow {
		t.Errorf("warning = %+v, want slow, not failed", slow)
	}
}

func TestFeedGroupsSystemEventsPerHourAndMessage(t *testing.T) {
	db, r := openTestReader(t)
	hour := hourStart(1)
	insertEvent(t, db, event{atMS: hour + 5*60_000, domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: hour + 20*60_000, domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})
	newest := insertEvent(t, db, event{atMS: hour + 50*60_000, domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: hour + 30*60_000, domain: "frontend", level: "error", message: "click", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: hour + 40*60_000, domain: "frontend", level: "warn", message: "render", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: hourStart(2) + 10*60_000, domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: hour + 2*60_000, domain: "api", level: "info", message: "http server listening", eventType: "api.listening"})
	insertEvent(t, db, event{atMS: hour + 45*60_000, domain: "api", level: "info", message: "http server listening", eventType: "api.listening"})

	lines := systemLines(t, r, FeedInput{})
	type shape struct {
		title, level string
		count        int64
		firstMS      int64
		lastMS       int64
	}
	var got []shape
	for _, line := range lines {
		if line.System == nil {
			t.Fatalf("line %+v has no System group", line)
		}
		got = append(got, shape{line.Line.Title, line.Line.Level, line.System.Count, line.System.FirstAtMS, line.System.LastAtMS})
	}
	want := []shape{
		{"render", "error", 3, hour + 5*60_000, hour + 50*60_000},
		{"http server listening", "info", 2, hour + 2*60_000, hour + 45*60_000},
		{"render", "warn", 1, hour + 40*60_000, hour + 40*60_000},
		{"click", "error", 1, hour + 30*60_000, hour + 30*60_000},
		{"render", "error", 1, hourStart(2) + 10*60_000, hourStart(2) + 10*60_000},
	}
	if !slices.Equal(got, want) {
		t.Fatalf("groups = %+v, want %+v", got, want)
	}
	group := lines[0]
	if group.Line.ID != formatID(newest) || group.Line.AtMS != hour+50*60_000 || group.Line.Kind != LineEvent || group.Line.Detail != "frontend.error" {
		t.Errorf("group line = %+v, want the newest member %d at its time", group.Line, newest)
	}
	if lines[0].System.HourStartMS != hour || lines[4].System.HourStartMS != hourStart(2) {
		t.Errorf("older group hour = %d, want %d", lines[4].System.HourStartMS, hourStart(2))
	}

	// A range cutting the hour groups only the events inside it.
	cut := systemLines(t, r, FeedInput{FromMS: hour + 10*60_000, ToMS: hour + 35*60_000})
	if len(cut) != 2 || cut[0].System.Count != 1 || cut[0].Line.Title != "click" || cut[1].System.Count != 1 || cut[1].Line.AtMS != hour+20*60_000 {
		t.Fatalf("cut range = %+v, want click and one render", cut)
	}
}

func TestFeedLinksAFailedSystemGroupToTheNewestIncidentOfItsHour(t *testing.T) {
	db, r := openTestReader(t)
	hour := hourStart(1)
	fingerprint := "error_event|frontend|frontend.error"
	insertEvent(t, db, event{atMS: hour + 5*60_000, domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: hour + 50*60_000, domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: hour + 30*60_000, domain: "frontend", level: "warn", message: "render", eventType: "frontend.error"})
	insertIncident(t, db, fingerprint, "error_event", hour-60_000, "event", "")                         // the hour before
	older := insertIncident(t, db, fingerprint, "error_event", hour+5*60_000, "event", "")              // first member
	newest := insertIncident(t, db, fingerprint, "error_event", hour+20*60_000, "event", "")            // trimmed middle member
	insertIncident(t, db, "error_event|api|frontend.error", "error_event", hour+21*60_000, "event", "") // other fingerprint
	insertIncident(t, db, fingerprint, "error_event", hour+60*60_000, "event", "")                      // the next hour
	storageAt := hourStart(2)
	insertEvent(t, db, event{atMS: storageAt + 30*60_000, domain: "storage", level: "error", message: "full", eventType: "storage.full"})
	atHourStart := insertIncident(t, db, "error_event|storage|storage.full", "error_event", storageAt, "event", "") // the hour's first millisecond

	lines := systemLines(t, r, FeedInput{})
	if len(lines) != 3 {
		t.Fatalf("lines = %+v, want the error group, the warning group and the older storage group", lines)
	}
	if storage := lines[2]; storage.IncidentID != atHourStart {
		t.Errorf("storage group incident = %d, want %d recorded at its hour's start", storage.IncidentID, atHourStart)
	}
	if errs := lines[0]; !errs.Failed || errs.Slow || errs.IncidentID != newest {
		t.Errorf("error group = failed %v slow %v incident %d, want failed with incident %d (not %d)", errs.Failed, errs.Slow, errs.IncidentID, newest, older)
	}
	if warns := lines[1]; warns.Failed || !warns.Slow || warns.IncidentID != 0 {
		t.Errorf("warning group = %+v, want slow with no incident", warns)
	}

	failures := feedLines(feedOf(t, r, FeedInput{FailuresOnly: true}))
	if len(failures) != 2 || failures[0].Type != FeedSystem || !failures[0].Failed || failures[1].Line.Domain != "storage" {
		t.Fatalf("failures = %+v, want the two error groups alone", failures)
	}
}

func TestFeedPagesSystemGroupsNeverRepeatingOrSkippingOne(t *testing.T) {
	db, r := openTestReader(t)
	for i, message := range []string{"a", "b", "c", "d"} {
		at := hourStart(1) + int64(i)*60_000
		insertEvent(t, db, event{atMS: at, domain: "frontend", level: "error", message: message, eventType: "frontend.error"})
		insertEvent(t, db, event{atMS: at, domain: "frontend", level: "error", message: message, eventType: "frontend.error"})
	}
	// Three groups end at the same millisecond: more than a one-line page reads past the cursor.
	insertEvent(t, db, event{atMS: hourStart(1) + 3*60_000, domain: "anime", level: "warn", message: "d", eventType: "anime.folder"})
	insertEvent(t, db, event{atMS: hourStart(1) + 3*60_000, domain: "storage", level: "warn", message: "d", eventType: "storage.low"})

	var titles []string
	cursor := ""
	for range 8 {
		view := feedOf(t, r, FeedInput{Types: []FeedType{FeedSystem}, Cursor: cursor, Limit: 1})
		for _, line := range feedLines(view) {
			titles = append(titles, line.Line.Domain+":"+line.Line.Title)
		}
		if cursor = view.NextCursor; cursor == "" {
			break
		}
	}
	want := []string{"storage:d", "anime:d", "frontend:d", "frontend:c", "frontend:b", "frontend:a"}
	if !slices.Equal(titles, want) {
		t.Fatalf("paged = %v, want %v", titles, want)
	}
}

// tallyFeed pages through every feed line of in and counts the lines and
// failures of each type, and the lines in all.
func tallyFeed(t *testing.T, r *Reader, in FeedInput) (map[FeedType]TypeCount, int64) {
	t.Helper()
	counts := map[FeedType]TypeCount{}
	var total int64
	for range 100 {
		view := feedOf(t, r, in)
		for _, line := range feedLines(view) {
			c := counts[line.Type]
			c.Lines++
			if line.Failed {
				c.Failed++
			}
			counts[line.Type] = c
			total++
		}
		if in.Cursor = view.NextCursor; in.Cursor == "" {
			break
		}
	}
	return counts, total
}

// assertCountsMatchFeed checks that the overview of in counts, per type, the
// lines and failures the feed returns for the same range and origin, and that
// a full-scale chart sums to the same lines.
func assertCountsMatchFeed(t *testing.T, r *Reader, in OverviewInput) {
	t.Helper()
	overview := overviewOf(t, r, in)
	fromMS := overview.Slots[0].StartMS
	if in.FromMS > 0 {
		fromMS = in.FromMS
	}
	counts, lineTotal := tallyFeed(t, r, FeedInput{FromMS: fromMS, ToMS: in.ToMS, Origin: in.Origin, Limit: 3})
	var slotTotal int64
	for _, slot := range overview.Slots {
		slotTotal += slot.Count
	}
	for _, got := range overview.Types {
		if want := counts[got.Type]; got.Lines != want.Lines || got.Failed != want.Failed {
			t.Errorf("%s count = %d/%d failed, feed lines = %d/%d failed", got.Type, got.Lines, got.Failed, want.Lines, want.Failed)
		}
	}
	if in.FromMS == 0 && slotTotal != lineTotal {
		t.Errorf("chart slots = %d lines, feed = %d", slotTotal, lineTotal)
	}
	if counts[FeedSystem].Lines == 0 {
		t.Error("no System line: the case proves nothing")
	}
}

func TestOverviewCountsEqualTheLinesTheFeedReturns(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)
	insertRun(t, db, "run-bad", "manual_anime", minutesAgo(5), "error", 0)
	insertEvent(t, db, event{atMS: minutesAgo(5), domain: "download", level: "error", message: "hoster", eventType: "download.failed", correlationID: "run-bad"})
	for _, at := range []int64{minutesAgo(6), minutesAgo(7), hourStart(3) + 60_000} {
		insertEvent(t, db, event{atMS: at, domain: "frontend", level: "error", message: "render", eventType: "frontend.error"})
	}
	insertEvent(t, db, event{atMS: minutesAgo(8), domain: "frontend", level: "error", message: "click", eventType: "frontend.error"})
	insertEvent(t, db, event{atMS: minutesAgo(9), domain: "api", level: "info", message: "http server listening", eventType: "api.listening"})
	insertEvent(t, db, event{atMS: minutesAgo(26 * 60), domain: "anime", level: "warn", message: "folder", eventType: "anime.folder"})

	for _, tc := range []struct {
		name string
		in   OverviewInput
	}{
		{"every origin", OverviewInput{Scale: Scale24h}},
		{"bridge origin, 7 days", OverviewInput{Scale: Scale7d, Origin: OriginBridge}},
		{"range cutting an hour", OverviewInput{Scale: Scale24h, FromMS: minutesAgo(7), ToMS: minutesAgo(3)}},
	} {
		t.Run(tc.name, func(t *testing.T) { assertCountsMatchFeed(t, r, tc.in) })
	}
}

func TestFeedRejectsTheRetiredBridgeType(t *testing.T) {
	_, r := openTestReader(t)
	if _, err := r.Feed(context.Background(), FeedInput{Now: testNow, Types: []FeedType{"bridge"}}); err == nil {
		t.Fatal("Feed with type bridge succeeded, want an unknown type error")
	}
}

func TestFeedSplitsSystemGroupsByEveryKeyPart(t *testing.T) {
	at := hourStart(1) + 10*60_000
	for _, tc := range []struct {
		name   string
		second event
	}{
		{"another domain", event{atMS: at + 60_000, domain: "anime", level: "error", message: "boom", eventType: "frontend.error"}},
		{"another event type", event{atMS: at + 60_000, domain: "frontend", level: "error", message: "boom", eventType: "frontend.crash"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, r := openTestReader(t)
			insertEvent(t, db, event{atMS: at, domain: "frontend", level: "error", message: "boom", eventType: "frontend.error"})
			insertEvent(t, db, tc.second)

			if lines := systemLines(t, r, FeedInput{}); len(lines) != 2 {
				t.Fatalf("lines = %+v, want one group per key", lines)
			}
			if got := countOf(t, overviewOf(t, r, OverviewInput{Scale: Scale24h}), FeedSystem); got.Lines != 2 || got.Failed != 2 {
				t.Fatalf("System count = %+v, want 2 lines, 2 failed", got)
			}
		})
	}
}

func TestFeedLinksNoIncidentFromAnotherHour(t *testing.T) {
	db, r := openTestReader(t)
	hour := hourStart(1)
	insertEvent(t, db, event{atMS: hour + 10*60_000, domain: "frontend", level: "error", message: "boom", eventType: "frontend.error"})
	insertIncident(t, db, "error_event|frontend|frontend.error", "error_event", hour-30*60_000, "event", "") // the previous hour

	lines := systemLines(t, r, FeedInput{})
	if len(lines) != 1 || !lines[0].Failed || lines[0].IncidentID != 0 {
		t.Fatalf("lines = %+v, want one failed group with no incident", lines)
	}
}

func TestFeedKeepsASystemEventAtTheRangeStart(t *testing.T) {
	db, r := openTestReader(t)
	at := hourStart(1) + 10*60_000
	insertEvent(t, db, event{atMS: at, domain: "frontend", level: "error", message: "boom", eventType: "frontend.error"})

	if lines := systemLines(t, r, FeedInput{FromMS: at}); len(lines) != 1 || lines[0].Line.AtMS != at {
		t.Fatalf("lines from the event's own time = %+v, want the event", lines)
	}
	assertCountsMatchFeed(t, r, OverviewInput{Scale: Scale24h, FromMS: at})
}
