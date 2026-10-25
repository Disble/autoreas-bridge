package activityread

import (
	"context"
	"reflect"
	"slices"
	"strconv"
	"testing"
	"time"
)

// flatten returns every line of a History page, newest first.
func flatten(view HistoryView) []LedgerLine {
	var lines []LedgerLine
	for _, day := range view.Days {
		lines = append(lines, day.Lines...)
	}
	return lines
}

// lineKey identifies one ledger line across pages.
func lineKey(line LedgerLine) string {
	return string(line.Kind) + "/" + line.ID
}

// seedLedger stores one line per History source, several of them on the
// same millisecond so the cursor must break ties across sources.
func seedLedger(t *testing.T, reader *Reader) {
	t.Helper()
	db := reader.db
	tie := minutesAgo(30)
	insertChange(t, db, "mobile", "Date A Live IV", tie, 0)
	insertChange(t, db, "desktop", "Ao Ashi", tie, 0)
	insertTelemetry(t, db, "obs-1", tie, tie, `{"outcome":"applied"}`)
	insertCapture(t, db, capture{id: "ws-b", kind: "ws_connect", route: "/ws", deviceID: "device-1", atMS: tie})
	insertCapture(t, db, capture{id: "ws-a", kind: "ws_disconnect", route: "/ws", deviceID: "device-1", atMS: tie})
	insertEvent(t, db, event{atMS: tie, domain: "download", level: "info", message: "run started", correlationID: "run-1"})
	insertEvent(t, db, event{atMS: tie, domain: "sync", level: "info", message: "changelog", eventType: "sync.changelog"})
	insertIncident(t, db, "server_error|http|reconcile|500|x", "server_error", tie, "request", "r")
	for i := range 7 {
		insertChange(t, db, "mobile", "Ao Ashi", minutesAgo(31+i), 0)
		insertEvent(t, db, event{atMS: minutesAgo(32 + i), domain: "season", level: "info", message: "season"})
	}
	insertSeasonGrade(t, db, "desktop", minutesAgo(40))
	insertChange(t, db, "mobile", "too old", testNow.Add(-91*24*time.Hour).UnixMilli(), 0)
}

// TestHistoryCursorHasNoGapsOrDuplicates pages through the ledger three lines
// at a time and compares the result with one large page.
func TestHistoryCursorHasNoGapsOrDuplicates(t *testing.T) {
	_, reader := openTestReader(t)
	seedLedger(t, reader)
	ctx := context.Background()
	whole, err := reader.History(ctx, HistoryInput{Now: testNow, Where: WhereAll, Limit: MaxPageLimit})
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	want := flatten(whole)
	if len(want) != 23 || whole.NextCursor != "" {
		t.Fatalf("whole ledger = %d lines (cursor %q), want 23 and no cursor", len(want), whole.NextCursor)
	}
	got := pageHistory(t, reader, WhereAll, 3)
	if len(got) != len(want) {
		t.Fatalf("paged %d lines, want %d", len(got), len(want))
	}
	for i := range want {
		if lineKey(got[i]) != lineKey(want[i]) {
			t.Fatalf("line %d = %s, want %s", i, lineKey(got[i]), lineKey(want[i]))
		}
	}
	assertCursorEdges(t, reader, len(want))
}

// assertCursorEdges checks a page holding every one of total lines, malformed
// cursors, a key with dots and a cursor ranked below every source.
func assertCursorEdges(t *testing.T, reader *Reader, total int) {
	t.Helper()
	ctx := context.Background()
	exact, err := reader.History(ctx, HistoryInput{Now: testNow, Where: WhereAll, Limit: total})
	if err != nil || len(flatten(exact)) != total || exact.NextCursor != "" {
		t.Fatalf("a page holding every line has no next cursor: %q (%v)", exact.NextCursor, err)
	}
	for _, malformed := range []string{"garbage", "1.2.", "1.3.", "x.2.k", "1.y.k"} {
		if _, err := reader.History(ctx, HistoryInput{Now: testNow, Where: WhereAll, Cursor: malformed}); err == nil {
			t.Fatalf("the malformed cursor %q must be refused", malformed)
		}
	}
	if c, err := parseCursor("5.1.req.with.dots"); err != nil || c.key != "req.with.dots" {
		t.Fatalf("a key keeps its dots: %+v (%v)", c, err)
	}
	// Rank 0 sorts after every source, so the whole tie millisecond is before it.
	older, err := reader.History(ctx, HistoryInput{Now: testNow, Where: WhereAll, Limit: MaxPageLimit,
		Cursor: strconv.FormatInt(minutesAgo(30), 10) + ".0.x"})
	if err != nil {
		t.Fatalf("History after rank 0: %v", err)
	}
	if lines := flatten(older); len(lines) != 15 || lines[0].AtMS >= minutesAgo(30) {
		t.Fatalf("after rank 0 = %d lines, want 15 strictly older", len(lines))
	}
}

// pageHistory follows the History cursor with limit until it ends, checking
// each page's size and that only the first page carries the calendar, and
// returns every line in order.
func pageHistory(t *testing.T, reader *Reader, where Where, limit int) []LedgerLine {
	t.Helper()
	var got []LedgerLine
	cursor := ""
	for pages := 0; pages <= 200; pages++ {
		page, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: where, Cursor: cursor, Limit: limit})
		if err != nil {
			t.Fatalf("History page %d: %v", pages, err)
		}
		if pages > 0 && page.Calendar != nil {
			t.Fatal("only the first page carries the calendar")
		}
		lines := flatten(page)
		if len(lines) > limit {
			t.Fatalf("page %d holds %d lines, limit %d", pages, len(lines), limit)
		}
		got = append(got, lines...)
		if page.NextCursor == "" {
			return got
		}
		cursor = page.NextCursor
	}
	t.Fatal("the cursor never ended")
	return nil
}

// marksOf returns the marks of the one line match selects.
func marksOf(t *testing.T, lines []LedgerLine, name string, match func(LedgerLine) bool) []Mark {
	t.Helper()
	for _, line := range lines {
		if match(line) {
			return line.Marks
		}
	}
	t.Fatalf("no line for %s", name)
	return nil
}

// eventLine matches an event line by message and correlation id.
func eventLine(message, correlationID string) func(LedgerLine) bool {
	return func(line LedgerLine) bool {
		return line.Kind == LineEvent && line.Title == message && line.CorrelationID == correlationID
	}
}

// lineOf matches a line by kind and title, or by kind and id when title is empty.
func lineOf(kind LineKind, title, id string) func(LedgerLine) bool {
	return func(line LedgerLine) bool {
		return line.Kind == kind && (title == "" || line.Title == title) && (id == "" || line.ID == id)
	}
}

// TestHistoryMarks pins Recovered, Arrived late and Incident.
func TestHistoryMarks(t *testing.T) {
	db, reader := openTestReader(t)
	insertEvent(t, db, event{atMS: minutesAgo(10), domain: "download", level: "warn", message: "probe slow", correlationID: "run-ok"})
	insertEvent(t, db, event{atMS: minutesAgo(11), domain: "download", level: "warn", message: "probe slow", correlationID: "run-bad"})
	insertEvent(t, db, event{atMS: minutesAgo(9), domain: "download", level: "error", message: "run failed", correlationID: "run-bad"})
	insertEvent(t, db, event{atMS: minutesAgo(12), domain: "schedule", level: "warn", message: "missed day"})
	insertEvent(t, db, event{atMS: minutesAgo(12), domain: "download", level: "info", message: "probe ok", correlationID: "run-info"})
	late := (10*time.Minute + time.Millisecond).Milliseconds()
	insertTelemetry(t, db, "late", minutesAgo(13), minutesAgo(13)-late, `{"outcome":"applied"}`)
	insertTelemetry(t, db, "edge", minutesAgo(14), minutesAgo(14)-(10*time.Minute).Milliseconds(), `{"outcome":"applied"}`)
	insertChange(t, db, "mobile", "late change", minutesAgo(15), minutesAgo(15)-late)
	insertChange(t, db, "mobile", "early clock", minutesAgo(16), minutesAgo(16)+late)
	insertChange(t, db, "desktop", "no phone time", minutesAgo(17), 0)
	insertIncident(t, db, "server_error|http|get|500|", "server_error", minutesAgo(18), "request", "r")

	view, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WhereAll, Limit: MaxPageLimit})
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	lines := flatten(view)
	cases := []struct {
		name  string
		match func(LedgerLine) bool
		want  []Mark
	}{
		{"warning that recovered", eventLine("probe slow", "run-ok"), []Mark{MarkRecovered}},
		{"warning followed by an error", eventLine("probe slow", "run-bad"), nil},
		{"the error itself", eventLine("run failed", "run-bad"), nil},
		{"warning without correlation", eventLine("missed day", ""), []Mark{MarkRecovered}},
		{"info event", eventLine("probe ok", "run-info"), nil},
		{"late change", lineOf(LineChange, "late change", ""), []Mark{MarkArrivedLate}},
		{"phone clock ahead", lineOf(LineChange, "early clock", ""), []Mark{MarkArrivedLate}},
		{"change without phone time", lineOf(LineChange, "no phone time", ""), nil},
		{"late report", lineOf(LinePhoneReport, "", "1"), []Mark{MarkArrivedLate}},
		{"report exactly 10 min apart", lineOf(LinePhoneReport, "", "2"), nil},
		{"incident", lineOf(LineIncident, "", ""), []Mark{MarkIncident}},
	}
	for _, tc := range cases {
		if got := marksOf(t, lines, tc.name, tc.match); !slices.Equal(got, tc.want) {
			t.Errorf("%s marks = %v, want %v", tc.name, got, tc.want)
		}
	}
	// A page whose only correlated warning failed: the lookup runs for one id.
	single, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WhereDownloads, Limit: 1,
		Cursor: (cursor{atMS: minutesAgo(10), rank: rankEvent, key: intKey(0)}).encode()})
	if err != nil {
		t.Fatalf("History single: %v", err)
	}
	if got := marksOf(t, flatten(single), "the single failed warning", eventLine("probe slow", "run-bad")); got != nil {
		t.Errorf("the single failed warning marks = %v, want none", got)
	}
}

// TestHistoryNeverListsPolling checks polls, broadcasts, noise events and
// events restating a listed connection or phone report stay out.
func TestHistoryNeverListsPolling(t *testing.T) {
	db, reader := openTestReader(t)
	for _, eventType := range []string{"websocket.register", "websocket.unregister", "sync.diagnostics_stored"} {
		insertEvent(t, db, event{atMS: minutesAgo(7), domain: "websocket", level: "info", message: eventType, eventType: eventType})
	}
	insertCapture(t, db, capture{id: "poll", kind: "get", route: "/api/status", atMS: minutesAgo(1), status: 200})
	insertCapture(t, db, capture{id: "sync", kind: "reconcile", route: "/api/sync/reconcile", deviceID: "d", atMS: minutesAgo(2), status: 200})
	insertCapture(t, db, capture{id: "push", kind: "ws_broadcast", route: "/ws", atMS: minutesAgo(3)})
	insertEvent(t, db, event{atMS: minutesAgo(4), domain: "sync", level: "info", message: "forwarded", eventType: "sync.reconcile"})
	insertEvent(t, db, event{atMS: minutesAgo(5), domain: "tracer-bullet", level: "info", message: "forwarded anime.changed", eventType: "tracer.step"})
	insertEvent(t, db, event{atMS: minutesAgo(6), domain: "tracer-bullet", level: "info", message: "tracer bullet ready", eventType: "tracer.step"})

	view, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WhereAll})
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	lines := flatten(view)
	if len(lines) != 1 || lines[0].Title != "tracer bullet ready" {
		t.Fatalf("lines = %+v, want only the startup marker", lines)
	}

	withPushes, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WhereAll, IncludeBroadcasts: true})
	if err != nil {
		t.Fatalf("History with broadcasts: %v", err)
	}
	lines = flatten(withPushes)
	want := LedgerLine{Kind: LineConnection, ID: "push", AtMS: minutesAgo(3), Title: "ws_broadcast", Source: "SM-X800"}
	if len(lines) != 2 || !reflect.DeepEqual(lines[0], want) || lines[1].Title != "tracer bullet ready" {
		t.Fatalf("lines with broadcasts = %+v", lines)
	}
}

// TestWhereFilterNarrowsHistory checks which sources each filter reads.
func TestWhereFilterNarrowsHistory(t *testing.T) {
	db, reader := openTestReader(t)
	seedLedger(t, reader)
	insertEvent(t, db, event{atMS: minutesAgo(41), domain: "clearance", level: "info", message: "cleared jkanime.net", eventType: "clearance.solved"})
	insertEvent(t, db, event{atMS: minutesAgo(42), domain: "jkanime", level: "warn", message: "trying jkanime.org", eventType: "jkanime.host_fallback"})
	// The download scheduler's stored outcome: routine info, and still what Where=schedule is for.
	insertEvent(t, db, event{atMS: minutesAgo(43), domain: "schedule", level: "info", message: "scheduled download run recorded as ok", eventType: "schedule.run_settled"})
	count := func(where Where) map[LineKind]int {
		view, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: where, Limit: MaxPageLimit})
		if err != nil {
			t.Fatalf("History %s: %v", where, err)
		}
		got := map[LineKind]int{}
		for _, line := range flatten(view) {
			got[line.Kind]++
		}
		return got
	}
	cases := []struct {
		where Where
		want  map[LineKind]int
	}{
		{WherePhone, map[LineKind]int{LineChange: 8, LinePhoneReport: 1, LineConnection: 2, LineEvent: 1, LineIncident: 1}},
		{WhereDownloads, map[LineKind]int{LineEvent: 1}},
		{WhereEditor, map[LineKind]int{LineChange: 2}},
		{WhereSeason, map[LineKind]int{LineEvent: 7, LineChange: 1}},
		{WhereSchedule, map[LineKind]int{LineEvent: 1}},
		{WhereProviders, map[LineKind]int{LineEvent: 2}},
	}
	for _, tc := range cases {
		got := count(tc.where)
		if len(got) != len(tc.want) {
			t.Errorf("%s = %v, want %v", tc.where, got, tc.want)
			continue
		}
		for kind, n := range tc.want {
			if got[kind] != n {
				t.Errorf("%s = %v, want %v", tc.where, got, tc.want)
			}
		}
	}
}

// TestHistoryCalendar checks the 90 daily totals, gaps and incident rings.
func TestHistoryCalendar(t *testing.T) {
	db, reader := openTestReader(t)
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	insertRollup(t, db, today.Add(time.Hour).UnixMilli(), "/api/status", 2, 7)
	insertRollup(t, db, today.Add(5*time.Hour).UnixMilli(), "/api/sync/reconcile", 5, 3)
	insertRollup(t, db, today.Add(-48*time.Hour).UnixMilli(), "/api/status", 2, 4)
	insertRollup(t, db, today.Add(-100*24*time.Hour).UnixMilli(), "/api/status", 2, 50) // outside 90 days
	insertIncident(t, db, "error_event|download|x", "error_event", today.Add(-47*time.Hour).UnixMilli(), "event", "1")
	firstDay := today.Add(-89 * 24 * time.Hour)
	insertRollup(t, db, firstDay.UnixMilli(), "/api/status", 2, 6)
	insertIncident(t, db, "error_event|download|x", "error_event", firstDay.Add(time.Minute).UnixMilli(), "event", "2")
	edge := insertIncident(t, db, "error_event|download|x", "error_event", testNow.Add(-LedgerSpan+time.Minute).UnixMilli(), "event", "3")

	view, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WhereAll})
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(view.Calendar) != CalendarDays {
		t.Fatalf("calendar = %d days", len(view.Calendar))
	}
	last := view.Calendar[CalendarDays-1]
	if last.DayStartMS != today.UnixMilli() || last.Total != 10 || !last.HasData || last.HasIncident {
		t.Fatalf("today = %+v", last)
	}
	twoDaysAgo := view.Calendar[CalendarDays-3]
	if twoDaysAgo.Total != 4 || !twoDaysAgo.HasData || !twoDaysAgo.HasIncident {
		t.Fatalf("two days ago = %+v", twoDaysAgo)
	}
	if yesterday := view.Calendar[CalendarDays-2]; yesterday.HasData || yesterday.Total != 0 {
		t.Fatalf("a day without rollup rows is a gap: %+v", yesterday)
	}
	if first := view.Calendar[0]; first.DayStartMS != firstDay.UnixMilli() || first.Total != 6 || !first.HasIncident {
		t.Fatalf("first day = %+v", first)
	}
	if lines := flatten(view); len(lines) == 0 || lines[len(lines)-1].ID != formatID(edge) {
		t.Fatalf("the ledger reaches its 90-day edge: %+v", lines)
	}
	downloads, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WhereSeason})
	if err != nil || downloads.Calendar[CalendarDays-3].HasIncident {
		t.Fatalf("the incident ring follows the filter: %v", err)
	}
}

// TestChangeLinesPageThroughTheDomainHistory pages through the phone's
// changes one at a time, ties included, skipping the desktop's, and counts
// today's in Now.
func TestChangeLinesPageThroughTheDomainHistory(t *testing.T) {
	db, reader := openTestReader(t)
	want := []string{"13"}
	for i := range 12 {
		insertChange(t, db, "mobile", "Ao Ashi", minutesAgo(1+i), 0)
		want = append(want, strconv.Itoa(1+i))
	}
	insertChange(t, db, "mobile", "same millisecond", minutesAgo(1), 0)
	insertChange(t, db, "desktop", "older", minutesAgo(23*60), 0)
	insertChange(t, db, "mobile", "yesterday", minutesAgo(19*60), 0)
	want = append(want, "15")

	lines := pageHistory(t, reader, WherePhone, 1)
	got := make([]string, len(lines))
	for i, line := range lines {
		got[i] = line.ID
	}
	if !slices.Equal(got, want) {
		t.Fatalf("paged change ids = %v, want %v", got, want)
	}
	whole, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WherePhone, Limit: MaxPageLimit})
	if err != nil || len(whole.Days) != 2 || len(whole.Days[1].Lines) != 1 || whole.Days[1].Lines[0].Title != "yesterday" {
		t.Fatalf("day groups = %+v (%v), want today then yesterday", whole.Days, err)
	}
	view, err := reader.Now(context.Background(), NowInput{Now: testNow, LocalMidnight: testNow.Add(-22 * time.Hour), ProcessStartedAt: testNow})
	if err != nil || view.ChangesToday != 14 {
		t.Fatalf("changes today = %d (%v), want 14", view.ChangesToday, err)
	}
}
