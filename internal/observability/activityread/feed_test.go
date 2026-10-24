package activityread

import (
	"context"
	"database/sql"
	"slices"
	"testing"
	"time"
)

// hourStart returns the epoch milliseconds of the UTC hour n hours before testNow's hour.
func hourStart(n int) int64 {
	return testNow.Truncate(time.Hour).Add(-time.Duration(n) * time.Hour).UnixMilli()
}

// insertRun stores one download_runs row.
func insertRun(t *testing.T, db *sql.DB, runID, trigger string, startedMS int64, status string, failed int) {
	t.Helper()
	exec(t, db, `INSERT INTO download_runs (run_id, started_at_ms, finished_at_ms, trigger, animes_checked,
		episodes_found, episodes_downloaded, episodes_failed, status) VALUES (?, ?, ?, ?, 2, 3, 2, ?, ?)`,
		runID, startedMS, startedMS+60_000, trigger, failed, status)
}

// feedOf reads one feed page and fails the test on error.
func feedOf(t *testing.T, r *Reader, in FeedInput) FeedView {
	t.Helper()
	in.Now = testNow
	view, err := r.Feed(context.Background(), in)
	if err != nil {
		t.Fatalf("feed: %v", err)
	}
	return view
}

// feedLines flattens a feed page.
func feedLines(view FeedView) []FeedLine {
	var lines []FeedLine
	for _, day := range view.Days {
		lines = append(lines, day.Lines...)
	}
	return lines
}

// typesOf returns each line's type, newest first.
func typesOf(lines []FeedLine) []FeedType {
	out := make([]FeedType, len(lines))
	for i, line := range lines {
		out[i] = line.Type
	}
	return out
}

// seedEveryType stores one fact of each feed type plus two facts that are
// never feed lines, each a fixed number of minutes before testNow.
func seedEveryType(t *testing.T, db *sql.DB) {
	t.Helper()
	insertChange(t, db, "mobile", "Hotaru no Yomeiri", minutesAgo(10), minutesAgo(11)) // change
	insertRollup(t, db, hourStart(1), "/api/sync/reconcile", 2, 30)                    // traffic, 60 min before the hour
	insertRun(t, db, "run-a", "scheduled", minutesAgo(30), "ok", 0)                    // download
	insertEvent(t, db, event{atMS: minutesAgo(40), domain: "schedule", level: "warn", message: "Missed selected day", eventType: "notification.forwarded"})
	insertChange(t, db, "desktop", "Ao Ashi", minutesAgo(50), 0)                                                                                // edit
	insertEvent(t, db, event{atMS: minutesAgo(55), domain: "api", level: "info", message: "http server listening", eventType: "api.listening"}) // system
	insertEvent(t, db, event{atMS: minutesAgo(45), domain: "download", level: "info", message: "run started", eventType: "download.run_started", correlationID: "run-a"})
	insertEvent(t, db, event{atMS: minutesAgo(35), domain: "anime", level: "info", message: "folder opened", eventType: "anime.folder_opened"})
}

func TestFeedClassifiesEachSourceIntoItsTypeAndOrigin(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)

	lines := feedLines(feedOf(t, r, FeedInput{}))
	want := []FeedType{FeedChange, FeedDownload, FeedTask, FeedEdit, FeedSystem, FeedTraffic}
	if got := typesOf(lines); !slices.Equal(got, want) {
		t.Fatalf("types = %v, want %v", got, want)
	}
	origins := map[FeedType]FeedOrigin{}
	for _, line := range lines {
		origins[line.Type] = line.Origin
	}
	wantOrigins := map[FeedType]FeedOrigin{FeedChange: OriginPhone, FeedTraffic: OriginPhone, FeedDownload: OriginBridge,
		FeedTask: OriginBridge, FeedEdit: OriginBridge, FeedSystem: OriginBridge}
	for feedType, origin := range wantOrigins {
		if origins[feedType] != origin {
			t.Errorf("origin of %s = %q, want %q", feedType, origins[feedType], origin)
		}
	}
	run := lines[1]
	if run.Line.Kind != LineDownloadRun || run.Run == nil || run.Run.Trigger != "scheduled" || run.Line.CorrelationID != "run-a" || run.Failed {
		t.Errorf("run line = %+v, run = %+v", run.Line, run.Run)
	}
	traffic := lines[5]
	if traffic.Line.Kind != LineTrafficHour || traffic.Traffic == nil || traffic.Traffic.Requests != 30 || traffic.Line.AtMS != hourStart(1) {
		t.Errorf("traffic line = %+v, traffic = %+v", traffic.Line, traffic.Traffic)
	}
}

func TestFeedFiltersByOriginAndTypesWithSystemAsAToggle(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)

	cases := []struct {
		name string
		in   FeedInput
		want []FeedType
	}{
		{"phone origin", FeedInput{Origin: OriginPhone}, []FeedType{FeedChange, FeedTraffic}},
		{"bridge origin", FeedInput{Origin: OriginBridge}, []FeedType{FeedDownload, FeedTask, FeedEdit, FeedSystem}},
		{"edits only hide System", FeedInput{Types: []FeedType{FeedEdit}}, []FeedType{FeedEdit}},
		{"changes and traffic", FeedInput{Types: []FeedType{FeedChange, FeedTraffic}}, []FeedType{FeedChange, FeedTraffic}},
		{"System only", FeedInput{Types: []FeedType{FeedSystem}}, []FeedType{FeedSystem}},
		{"phone origin hides System", FeedInput{Origin: OriginPhone, Types: []FeedType{FeedSystem}}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := typesOf(feedLines(feedOf(t, r, tc.in))); !slices.Equal(got, tc.want) {
				t.Fatalf("types = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestFeedReadsOnlyTheRequestedRange(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)

	// 52..12 minutes ago: the edit at 50 and the change at 10 bound it; the
	// traffic hour started before the range but overlaps it, so it stays.
	lines := feedLines(feedOf(t, r, FeedInput{FromMS: minutesAgo(52), ToMS: minutesAgo(12)}))
	want := []FeedType{FeedDownload, FeedTask, FeedEdit, FeedTraffic}
	if got := typesOf(lines); !slices.Equal(got, want) {
		t.Fatalf("types = %v, want %v", got, want)
	}
	before := feedLines(feedOf(t, r, FeedInput{ToMS: minutesAgo(61)}))
	if len(before) != 0 {
		t.Fatalf("lines before the oldest fact = %v, want none", typesOf(before))
	}
}

func TestFeedFailuresOnlyKeepsFailedLinesWithTheirIncident(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)
	insertRun(t, db, "run-bad", "manual_anime", minutesAgo(20), "error", 0)
	insertRun(t, db, "run-partial", "manual_anime", minutesAgo(21), "ok", 1)
	insertRollup(t, db, hourStart(2), "/api/sync/reconcile", 4, 1)
	requestIncident := insertIncident(t, db, "client_error|http|reconcile|401|", "client_error", hourStart(2)+60_000, "request", "req-1")
	errorAt := minutesAgo(25)
	insertEvent(t, db, event{atMS: errorAt, domain: "frontend", level: "error", message: "frontend render", eventType: "frontend.error"})
	eventIncident := insertIncident(t, db, "error_event|frontend|frontend.error", "error_event", errorAt, "event", "")
	insertTelemetry(t, db, "tele-1", minutesAgo(15), minutesAgo(15), `{"outcome":"failed"}`)
	mobileIncident := insertIncident(t, db, "mobile_failure|episode_action|sync|", "mobile_failure", minutesAgo(15), "mobile", "tele-1")
	insertTelemetry(t, db, "tele-2", minutesAgo(16), minutesAgo(16), `{"outcome":"ok"}`)

	lines := feedLines(feedOf(t, r, FeedInput{FailuresOnly: true}))
	want := []FeedType{FeedTraffic, FeedDownload, FeedDownload, FeedSystem, FeedTraffic}
	if got := typesOf(lines); !slices.Equal(got, want) {
		t.Fatalf("types = %v, want %v", got, want)
	}
	for _, line := range lines {
		if !line.Failed {
			t.Errorf("line %s %s is not failed", line.Type, line.Line.ID)
		}
	}
	if lines[0].IncidentID != mobileIncident || lines[3].IncidentID != eventIncident || lines[4].IncidentID != requestIncident {
		t.Errorf("incident ids = %d %d %d, want %d %d %d", lines[0].IncidentID, lines[3].IncidentID, lines[4].IncidentID,
			mobileIncident, eventIncident, requestIncident)
	}
	if lines[4].Traffic.Failed != 1 {
		t.Errorf("failed requests = %d, want 1", lines[4].Traffic.Failed)
	}

	// A phone report that did not fail restates the change it reports, so it is never a line.
	traffic := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, FromMS: minutesAgo(17), ToMS: minutesAgo(14)}))
	if len(traffic) != 2 || traffic[0].Line.Kind != LinePhoneReport || !traffic[0].Failed || traffic[1].Line.Kind != LineTrafficHour {
		t.Fatalf("traffic lines = %+v, want the failed report and the hour only", traffic)
	}
	counts := overviewOf(t, r, OverviewInput{Scale: Scale24h, FromMS: minutesAgo(17), ToMS: minutesAgo(14)})
	if got := countOf(t, counts, FeedTraffic); got.Lines != 2 || got.Failed != 1 {
		t.Fatalf("traffic count = %+v, want the report and the hour, one failed", got)
	}

	downloads := feedLines(feedOf(t, r, FeedInput{FailuresOnly: true, Types: []FeedType{FeedDownload}}))
	if got := typesOf(downloads); !slices.Equal(got, []FeedType{FeedDownload, FeedDownload}) {
		t.Fatalf("download failures = %v, want two runs and no bridge line", got)
	}
}

func TestFeedMarksASlowTrafficHourThatDidNotFail(t *testing.T) {
	db, r := openTestReader(t)
	insertRollup(t, db, hourStart(1), "/api/sync/reconcile", 2, 12)
	slowID := insertIncident(t, db, "slow|http|reconcile", "slow", hourStart(1)+5*60_000, "request", "req-slow")

	lines := feedLines(feedOf(t, r, FeedInput{}))
	if len(lines) != 1 || !lines[0].Slow || lines[0].Failed || lines[0].IncidentID != slowID {
		t.Fatalf("lines = %+v, want one slow, not failed hour with incident %d", lines, slowID)
	}
}

func TestFeedPagesNeverRepeatOrSkipALine(t *testing.T) {
	db, r := openTestReader(t)
	seedEveryType(t, db)
	full := feedLines(feedOf(t, r, FeedInput{}))

	var paged []FeedLine
	cursor := ""
	for range len(full) + 1 {
		view := feedOf(t, r, FeedInput{Cursor: cursor, Limit: 2})
		paged = append(paged, feedLines(view)...)
		if cursor = view.NextCursor; cursor == "" {
			break
		}
	}
	if !slices.Equal(typesOf(paged), typesOf(full)) {
		t.Fatalf("paged = %v, want %v", typesOf(paged), typesOf(full))
	}
}

func TestFeedPagesLinesOfDifferentSourcesSharingAMillisecond(t *testing.T) {
	db, r := openTestReader(t)
	at := hourStart(1)
	insertRollup(t, db, at, "/api/sync/reconcile", 2, 3)
	insertRun(t, db, "run-same-ms", "manual_anime", at, "ok", 0)
	insertEvent(t, db, event{atMS: at, domain: "api", level: "info", message: "http server listening", eventType: "api.listening"})
	insertEvent(t, db, event{atMS: at, domain: "season", level: "warn", message: "Past today's download window", eventType: "notification.forwarded"})

	var kinds []LineKind
	cursor := ""
	for range 6 {
		view := feedOf(t, r, FeedInput{Cursor: cursor, Limit: 1})
		for _, line := range feedLines(view) {
			kinds = append(kinds, line.Line.Kind)
		}
		if cursor = view.NextCursor; cursor == "" {
			break
		}
	}
	// Newest first, ties broken by source rank: the System group, run, traffic hour, then the task event.
	want := []LineKind{LineEvent, LineDownloadRun, LineTrafficHour, LineEvent}
	if !slices.Equal(kinds, want) {
		t.Fatalf("kinds = %v, want %v", kinds, want)
	}
}

func TestFeedSetsANextCursorWhenOneSourceFillsThePage(t *testing.T) {
	db, r := openTestReader(t)
	for i, id := range []string{"run-1", "run-2", "run-3"} {
		insertRun(t, db, id, "manual_anime", minutesAgo(10+i), "ok", 0)
	}
	first := feedOf(t, r, FeedInput{Types: []FeedType{FeedDownload}, Origin: OriginBridge, Limit: 2})
	if got := feedLines(first); len(got) != 2 || first.NextCursor == "" {
		t.Fatalf("first page = %d lines, cursor %q; want 2 and a cursor", len(got), first.NextCursor)
	}
	second := feedOf(t, r, FeedInput{Types: []FeedType{FeedDownload}, Origin: OriginBridge, Limit: 2, Cursor: first.NextCursor})
	if got := feedLines(second); len(got) != 1 || got[0].Run.RunID != "run-3" || second.NextCursor != "" {
		t.Fatalf("second page = %+v, cursor %q; want run-3 alone", got, second.NextCursor)
	}
}

func TestFeedGroupsLinesByLocalDay(t *testing.T) {
	db, r := openTestReader(t)
	insertChange(t, db, "mobile", "Hotaru no Yomeiri", minutesAgo(10), 0)
	insertChange(t, db, "mobile", "Hotaru no Yomeiri", minutesAgo(20), 0)
	insertChange(t, db, "mobile", "Ao Ashi", minutesAgo(19*60), 0) // yesterday 23:00
	insertChange(t, db, "mobile", "Ao Ashi", minutesAgo(50*60), 0) // two days ago

	view := feedOf(t, r, FeedInput{Types: []FeedType{FeedChange}, Origin: OriginPhone})
	if len(view.Days) != 3 {
		t.Fatalf("days = %d, want 3", len(view.Days))
	}
	for i, want := range []struct {
		start int64
		lines int
	}{{dayStart(testNow).UnixMilli(), 2}, {dayStart(testNow).AddDate(0, 0, -1).UnixMilli(), 1}, {dayStart(testNow).AddDate(0, 0, -2).UnixMilli(), 1}} {
		if day := view.Days[i]; day.DayStartMS != want.start || len(day.Lines) != want.lines {
			t.Errorf("day %d = %d with %d lines, want %d with %d", i, day.DayStartMS, len(day.Lines), want.start, want.lines)
		}
	}
}

func TestFeedKeepsATrafficHourUntilItsLastMillisecond(t *testing.T) {
	db, r := openTestReader(t)
	insertRollup(t, db, hourStart(2), "/api/sync/reconcile", 2, 5)
	lastMS := hourStart(1) - 1

	if got := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, FromMS: lastMS})); len(got) != 1 {
		t.Fatalf("from the hour's last millisecond: %d lines, want the hour", len(got))
	}
	if got := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, FromMS: lastMS + 1})); len(got) != 0 {
		t.Fatalf("from the next hour: %d lines, want none", len(got))
	}
}

func TestFeedRejectsAnUnknownTypeOrOrigin(t *testing.T) {
	_, r := openTestReader(t)
	for _, in := range []FeedInput{{Types: []FeedType{"schedule"}}, {Origin: "desk"}} {
		in.Now = testNow
		if _, err := r.Feed(context.Background(), in); err == nil {
			t.Errorf("Feed(%+v) succeeded, want an error", in)
		}
	}
}
