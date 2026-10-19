package activityread

import (
	"context"
	"testing"
	"time"
)

// TestStatusForPicksTheSentence pins the three wordings and their boundaries.
func TestStatusForPicksTheSentence(t *testing.T) {
	nowMS := testNow.UnixMilli()
	ms := func(d time.Duration) *int64 { v := nowMS - d.Milliseconds(); return &v }
	startedLongAgo := nowMS - (3 * time.Hour).Milliseconds()
	cases := []struct {
		name         string
		lastContact  *int64
		processStart int64
		problems     int
		wantKind     StatusKind
		wantSentence string
		wantMinutes  int
	}{
		{"recent contact", ms(14 * time.Second), startedLongAgo, 0, StatusInSync, "Phone and bridge are in sync", 0},
		{"just under the threshold", ms(QuietThreshold - time.Millisecond), startedLongAgo, 0, StatusInSync, "Phone and bridge are in sync", 0},
		{"at the threshold", ms(QuietThreshold), startedLongAgo, 0, StatusQuiet, "The phone has been quiet for 2 min", 2},
		{"minutes round down", ms(43*time.Minute + 59*time.Second), startedLongAgo, 0, StatusQuiet, "The phone has been quiet for 43 min", 43},
		{"no contact, bridge just started", nil, nowMS - time.Minute.Milliseconds(), 0, StatusInSync, "Phone and bridge are in sync", 0},
		{"no contact since start", nil, nowMS - (5 * time.Minute).Milliseconds(), 0, StatusQuiet, "The phone has been quiet for 5 min", 5},
		{"one problem", ms(14 * time.Second), startedLongAgo, 1, StatusProblems, "1 problem needs a look", 0},
		{"problems win over quiet", ms(time.Hour), startedLongAgo, 3, StatusProblems, "3 problems need a look", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := statusFor(nowMS, tc.lastContact, tc.processStart, tc.problems)
			if got.Kind != tc.wantKind || got.Sentence != tc.wantSentence || got.QuietMinutes != tc.wantMinutes {
				t.Fatalf("statusFor = %+v, want kind %s sentence %q minutes %d", got, tc.wantKind, tc.wantSentence, tc.wantMinutes)
			}
			if tc.wantKind == StatusProblems && got.Problems != tc.problems {
				t.Fatalf("Problems = %d, want %d", got.Problems, tc.problems)
			}
		})
	}
}

// TestNowReadsFiguresFromTheirSources builds one realistic day and checks
// every figure of the Now view against the table that owns it.
func TestNowReadsFiguresFromTheirSources(t *testing.T) {
	db, reader := openTestReader(t)
	midnight := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	currentHour := testNow.UnixMilli()
	insertRollup(t, db, currentHour, "/api/sync/reconcile", 2, 30)
	insertRollup(t, db, currentHour, "/api/sync/reconcile", 5, 10)
	insertRollup(t, db, midnight.UnixMilli(), "/api/status", 2, 5)
	insertRollup(t, db, midnight.Add(-time.Hour).UnixMilli(), "/api/status", 2, 99) // yesterday

	insertCapture(t, db, capture{id: "poll", kind: "get", route: "/api/status", atMS: minutesAgo(1), status: 200})
	insertCapture(t, db, capture{id: "push", kind: "ws_broadcast", route: "/ws", atMS: minutesAgo(0)})

	insertIncident(t, db, "server_error|http|reconcile|500|list_changes_failed", "server_error", minutesAgo(30), "request", "r1")
	insertIncident(t, db, "server_error|http|reconcile|500|list_changes_failed", "server_error", minutesAgo(10), "request", "r2")
	insertIncident(t, db, "slow|http|get", "slow", minutesAgo(5), "request", "r3")
	insertIncident(t, db, "rejected|http|patch|stale", "rejected", minutesAgo(25*60), "request", "r4") // not open
	insertIncident(t, db, "manual_pin|pin-1", "manual_pin", minutesAgo(2), "request", "")

	for i := range 6 {
		insertChange(t, db, "mobile", "Date A Live IV", minutesAgo(10+i), 0)
	}
	insertChange(t, db, "desktop", "Ao Ashi", midnight.Add(-time.Minute).UnixMilli(), 0) // yesterday
	insertChange(t, db, "desktop", "Ao Ashi", midnight.UnixMilli(), 0)                   // today, at midnight

	view, err := reader.Now(context.Background(), NowInput{
		Now: testNow, LocalMidnight: midnight, ProcessStartedAt: testNow.Add(-3 * time.Hour),
	})
	if err != nil {
		t.Fatalf("Now: %v", err)
	}
	if view.LastPhoneContactMS == nil || *view.LastPhoneContactMS != minutesAgo(1) {
		t.Fatalf("last contact = %v, want the poll, not the broadcast", view.LastPhoneContactMS)
	}
	if view.RequestsToday != 45 || view.OpenIncidents != 2 || view.ChangesToday != 7 {
		t.Fatalf("figures = requests %d open %d changes %d, want 45 2 7", view.RequestsToday, view.OpenIncidents, view.ChangesToday)
	}
	if view.UptimeMS != (3 * time.Hour).Milliseconds() {
		t.Fatalf("uptime = %d", view.UptimeMS)
	}
	if view.Status.Kind != StatusProblems || view.Status.Problems != 2 {
		t.Fatalf("status = %+v, want 2 problems", view.Status)
	}
	assertNowHours(t, view.Hours, currentHour)
	assertNowLists(t, view)
}

// assertNowHours checks the 24 bars: the current hour's counts and an empty
// hour drawn as a gap.
func assertNowHours(t *testing.T, hours []HourBar, currentHour int64) {
	t.Helper()
	if len(hours) != 24 {
		t.Fatalf("hours = %d, want 24", len(hours))
	}
	last := hours[23]
	if last.HourStartMS != currentHour || last.Count != 40 || last.Failed != 10 || last.FailedShare != 0.25 || !last.HasData {
		t.Fatalf("current hour bar = %+v", last)
	}
	if hours[22].HasData || hours[22].Count != 0 {
		t.Fatalf("empty hour must be a gap: %+v", hours[22])
	}
}

// assertNowLists checks "Needs a look" and "Recent changes".
func assertNowLists(t *testing.T, view NowView) {
	t.Helper()
	if len(view.NeedsALook) != 2 || view.NeedsALook[0].Reason != "server_error" || view.NeedsALook[1].Reason != "slow" {
		t.Fatalf("needs a look = %+v, want the error before the slow one", view.NeedsALook)
	}
	if view.NeedsALook[0].Occurrences != 2 {
		t.Fatalf("occurrences = %d, want 2", view.NeedsALook[0].Occurrences)
	}
	if len(view.RecentChanges) != 5 || // "latest 5" (activity-ui-design.md)
		view.RecentChanges[0].AtMS != minutesAgo(10) {
		t.Fatalf("recent changes = %+v", view.RecentChanges)
	}
	if view.RecentChanges[0].BeforeJSON == "" || view.RecentChanges[0].Source != "mobile" {
		t.Fatalf("change must carry its stored before/after and source: %+v", view.RecentChanges[0])
	}
}

// TestNeedsALookKeepsAtMostThree checks the cap and the error-and-new-first order.
func TestNeedsALookKeepsAtMostThree(t *testing.T) {
	db, reader := openTestReader(t)
	insertIncident(t, db, "slow|http|get", "slow", minutesAgo(1), "request", "a")
	insertIncident(t, db, "server_error|http|get|500|x", "server_error", minutesAgo(20*60), "request", "b")
	insertIncident(t, db, "server_error|http|get|500|x", "server_error", minutesAgo(30), "request", "b2")
	insertIncident(t, db, "client_error|http|get|404|y", "client_error", minutesAgo(40), "request", "c")
	insertIncident(t, db, "error_event|download|download.failed", "error_event", minutesAgo(50), "event", "1")
	// An older occurrence makes "x" not new although it is still open.
	insertIncident(t, db, "server_error|http|get|500|x", "server_error", minutesAgo(3*24*60), "request", "b0")

	view, err := reader.Now(context.Background(), NowInput{Now: testNow, LocalMidnight: testNow, ProcessStartedAt: testNow})
	if err != nil {
		t.Fatalf("Now: %v", err)
	}
	if view.OpenIncidents != 4 || len(view.NeedsALook) != 3 { // "at most 3" (activity-ui-design.md)
		t.Fatalf("open %d, needs a look %d", view.OpenIncidents, len(view.NeedsALook))
	}
	got := []string{view.NeedsALook[0].Fingerprint, view.NeedsALook[1].Fingerprint, view.NeedsALook[2].Fingerprint}
	want := []string{"client_error|http|get|404|y", "error_event|download|download.failed", "server_error|http|get|500|x"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order = %v, want %v", got, want)
		}
	}
}

// TestHourBarsEndWithTheCurrentHour reads the bars mid-hour: the last bar is
// the hour now falls in, and a single failed request is a full failed share.
func TestHourBarsEndWithTheCurrentHour(t *testing.T) {
	db, reader := openTestReader(t)
	insertRollup(t, db, testNow.UnixMilli(), "/api/sync/reconcile", 5, 1)
	bars, err := reader.hourBars(context.Background(), testNow.Add(30*time.Minute).UnixMilli())
	if err != nil {
		t.Fatalf("hourBars: %v", err)
	}
	if last := bars[23]; last.HourStartMS != testNow.UnixMilli() || last.Count != 1 || last.FailedShare != 1 {
		t.Fatalf("current hour bar = %+v", last)
	}
}
