package activityread

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"
)

// TestFoldRequestsFoldsIdenticalPolls pins the fold key: route template plus status.
func TestFoldRequestsFoldsIdenticalPolls(t *testing.T) {
	ok, failed := 200, 500
	duration := func(v int64) *int64 { return &v }
	rows := []windowRequest{
		{id: "p1", atMS: 1000, kind: "get", route: "/api/status", status: &ok, outcome: "completed", durationMS: duration(5)},
		{id: "r1", atMS: 2000, kind: "reconcile", route: "/api/sync/reconcile", status: &failed, outcome: "failed", durationMS: duration(41)},
		{id: "r2", atMS: 2500, kind: "reconcile", route: "/api/sync/reconcile", status: &failed, outcome: "failed", durationMS: duration(10)},
		{id: "p2", atMS: 3000, kind: "get", route: "/api/status?x=1", status: &ok, outcome: "completed", durationMS: duration(9)},
		{id: "c1", atMS: 3500, kind: "get", route: "/api/animes/abc/cover", status: &ok, outcome: "completed"},
		{id: "c2", atMS: 3600, kind: "get", route: "/api/animes/def/cover", status: &ok, outcome: "completed"},
		{id: "p3", atMS: 4000, kind: "get", route: "/api/status", status: nil, outcome: "pending"},
	}
	got := foldRequests(rows, "r1")
	if len(got) != 4 {
		t.Fatalf("folded rows = %d, want 4: %+v", len(got), got)
	}
	polls := got[0]
	if polls.RouteTemplate != "/api/status" || polls.Count != 2 || polls.FirstAtMS != 1000 || polls.LastAtMS != 3000 ||
		polls.LatestRequestID != "p2" || *polls.MaxDurationMS != 9 || polls.ContainsTrigger {
		t.Fatalf("polls row = %+v", polls)
	}
	if !got[1].ContainsTrigger || got[1].Count != 2 || got[1].LatestRequestID != "r2" || *got[1].MaxDurationMS != 41 {
		t.Fatalf("trigger row = %+v", got[1])
	}
	if got[2].RouteTemplate != "/api/animes/:id/cover" || got[2].Count != 2 || got[2].MaxDurationMS != nil {
		t.Fatalf("cover row = %+v", got[2])
	}
	if got[3].HTTPStatus != nil || got[3].Count != 1 {
		t.Fatalf("a missing status is its own fold key: %+v", got[3])
	}
}

// TestIncidentsGroupsFingerprintsOverSevenDays checks counts, newness and the 7-day bound.
func TestIncidentsGroupsFingerprintsOverSevenDays(t *testing.T) {
	db, reader := openTestReader(t)
	reconcile := "server_error|http|reconcile|500|list_changes_failed"
	insertIncident(t, db, reconcile, "server_error", minutesAgo(10*24*60), "request", "old") // first seen, outside 7 days
	insertIncident(t, db, reconcile, "server_error", minutesAgo(2*24*60), "request", "a")
	latest := insertIncident(t, db, reconcile, "server_error", minutesAgo(60), "request", "b")
	insertIncident(t, db, "slow|http|get", "slow", minutesAgo(30), "request", "c")
	insertIncident(t, db, "rejected|http|patch|stale", "rejected", minutesAgo(8*24*60), "request", "d") // gone

	got, err := reader.Incidents(context.Background(), IncidentsInput{Now: testNow, Where: WhereAll})
	if err != nil {
		t.Fatalf("Incidents: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("incidents = %+v, want 2 fingerprints", got)
	}
	slow, sync := got[0], got[1]
	if slow.Fingerprint != "slow|http|get" || !slow.IsNew || slow.IsError || slow.Occurrences != 1 {
		t.Fatalf("slow = %+v", slow)
	}
	if sync.LatestID != latest || sync.LatestAtMS != minutesAgo(60) || sync.Occurrences != 2 || sync.IsNew || !sync.IsError {
		t.Fatalf("sync = %+v", sync)
	}
	if sync.FirstSeenAtMS != minutesAgo(10*24*60) {
		t.Fatalf("first seen must cover every retained occurrence: %d", sync.FirstSeenAtMS)
	}
	if sync.Title == "" || sync.Title == sync.Fingerprint {
		t.Fatalf("title must be plain words: %q", sync.Title)
	}
}

// TestWhereFilterNarrowsIncidents checks each filter selects its own sources.
func TestWhereFilterNarrowsIncidents(t *testing.T) {
	db, reader := openTestReader(t)
	insertIncident(t, db, "server_error|http|reconcile|500|x", "server_error", minutesAgo(5), "request", "r")
	insertIncident(t, db, "mobile_failure|episode_action|sync|", "mobile_failure", minutesAgo(6), "mobile", "m")
	insertIncident(t, db, "error_event|sync|sync.changelog", "error_event", minutesAgo(7), "event", "1")
	insertIncident(t, db, "error_event|download|download.run_finished", "error_event", minutesAgo(8), "event", "2")
	insertIncident(t, db, "error_event|downloads|other", "error_event", minutesAgo(8), "event", "2b")
	insertIncident(t, db, "error_event|anime|anime.backfill", "error_event", minutesAgo(9), "event", "3")
	insertIncident(t, db, "error_event|schedule|missed", "error_event", minutesAgo(10), "event", "4")
	insertIncident(t, db, "error_event|season|notification.forwarded", "error_event", minutesAgo(11), "event", "5")
	insertIncident(t, db, "manual_pin|pin-1", "manual_pin", minutesAgo(12), "request", "")

	cases := []struct {
		where Where
		want  []string
	}{
		{WherePhone, []string{"server_error|http|reconcile|500|x", "mobile_failure|episode_action|sync|", "error_event|sync|sync.changelog"}},
		{WhereDownloads, []string{"error_event|download|download.run_finished"}},
		{WhereEditor, []string{"error_event|anime|anime.backfill"}},
		{WhereSchedule, []string{"error_event|schedule|missed"}},
		{WhereSeason, []string{"error_event|season|notification.forwarded"}},
	}
	for _, tc := range cases {
		t.Run(string(tc.where), func(t *testing.T) {
			got, err := reader.Incidents(context.Background(), IncidentsInput{Now: testNow, Where: tc.where})
			if err != nil {
				t.Fatalf("Incidents: %v", err)
			}
			assertFingerprints(t, got, tc.want)
		})
	}
	all, err := reader.Incidents(context.Background(), IncidentsInput{Now: testNow, Where: WhereAll})
	if err != nil || len(all) != 9 {
		t.Fatalf("All = %d incidents (%v), want 9", len(all), err)
	}
	if _, err := reader.Incidents(context.Background(), IncidentsInput{Now: testNow, Where: "kitchen"}); err == nil {
		t.Fatal("an unknown filter must be refused")
	}
}

// assertFingerprints checks the incident list holds exactly want, in order.
func assertFingerprints(t *testing.T, got []IncidentSummary, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %d incidents %+v, want %v", len(got), got, want)
	}
	for i := range want {
		if got[i].Fingerprint != want[i] {
			t.Fatalf("incident %d = %s, want %s", i, got[i].Fingerprint, want[i])
		}
	}
}

// TestIncidentDetailReadsItsWindow checks every part of the detail.
func TestIncidentDetailReadsItsWindow(t *testing.T) {
	db, reader := openTestReader(t)
	at := minutesAgo(60)
	insertCapture(t, db, capture{id: "trigger", kind: "reconcile", route: "/api/sync/reconcile", atMS: at, status: 500,
		outcome: "failed", errorCode: "list_changes_failed", errorMessage: "database is locked", durationMS: 41})
	for i, offset := range []int64{-90_000, -60_000, 10_000} {
		insertCapture(t, db, capture{id: "poll" + string(rune('a'+i)), kind: "get", route: "/api/status", atMS: at + offset, status: 200})
	}
	insertCapture(t, db, capture{id: "outside", kind: "get", route: "/api/status", atMS: at - 3*60_000, status: 200})
	insertEvent(t, db, event{atMS: at - 1000, domain: "sync", level: "warn", message: "changelog read retried", entityID: "anime-3"})
	insertEvent(t, db, event{atMS: at - 500, domain: "sync", level: "info", message: "forwarded", eventType: "sync.reconcile"})
	insertTelemetry(t, db, "obs-1", at+5000, at-20_000, `{"action":"episode_plus_one","outcome":"failed"}`)
	fingerprint := "server_error|http|reconcile|500|list_changes_failed"
	first := insertIncident(t, db, fingerprint, "server_error", minutesAgo(3*24*60), "request", "gone")
	id := insertIncident(t, db, fingerprint, "server_error", at, "request", "trigger")

	detail, err := reader.IncidentDetail(context.Background(), id)
	if err != nil {
		t.Fatalf("IncidentDetail: %v", err)
	}
	assertDetailHeader(t, detail, at)
	assertDetailLanes(t, detail, at, first)
	if _, err := reader.IncidentDetail(context.Background(), id+100); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing incident error = %v, want ErrNotFound", err)
	}
}

// assertDetailHeader checks the occurrence, its cause and its expiry.
func assertDetailHeader(t *testing.T, detail IncidentDetail, at int64) {
	t.Helper()
	if detail.Incident.WindowStartMS != at-2*60_000 || detail.Incident.WindowEndMS != at+30_000 || detail.Incident.Title == "" {
		t.Fatalf("incident = %+v", detail.Incident)
	}
	if !detail.Cause.Known || detail.Cause.Message != "database is locked" || detail.Cause.ErrorCode != "list_changes_failed" {
		t.Fatalf("cause = %+v", detail.Cause)
	}
	if detail.ExpiresAtMS != at+(90*24*time.Hour).Milliseconds() {
		t.Fatalf("expires = %d", detail.ExpiresAtMS)
	}
}

// assertDetailLanes checks the window's requests, events, phone reports and
// the earlier occurrences.
func assertDetailLanes(t *testing.T, detail IncidentDetail, at, first int64) {
	t.Helper()
	if len(detail.Requests) != 2 || detail.Requests[0].Count != 3 || !detail.Requests[1].ContainsTrigger {
		t.Fatalf("requests = %+v, want the three polls folded into one row, then the trigger", detail.Requests)
	}
	if detail.Requests[0].Count+detail.Requests[1].Count != 4 {
		t.Fatalf("the window holds 4 requests, the one 3 min before is outside: %+v", detail.Requests)
	}
	if len(detail.Events) != 1 || detail.Events[0].Message != "changelog read retried" || detail.Events[0].EntityID != "anime-3" {
		t.Fatalf("events = %+v, want the non-noise event only", detail.Events)
	}
	if len(detail.PhoneReports) != 1 || detail.PhoneReports[0].Outcome != "failed" || *detail.PhoneReports[0].PhoneAtMS != at-20_000 {
		t.Fatalf("phone reports = %+v", detail.PhoneReports)
	}
	if len(detail.Earlier) != 1 || detail.Earlier[0].ID != first {
		t.Fatalf("earlier = %+v", detail.Earlier)
	}
}

// TestIncidentDetailCauseOfAnEvent reads the triggering event's message.
func TestIncidentDetailCauseOfAnEvent(t *testing.T) {
	db, reader := openTestReader(t)
	for range 10 { // ids from 11 on read differently in any base but 10
		insertEvent(t, db, event{atMS: minutesAgo(6), domain: "download", level: "info", message: "filler"})
	}
	eventID := insertEvent(t, db, event{atMS: minutesAgo(5), domain: "download", level: "error", message: "hoster declared dead"})
	id := insertIncident(t, db, "error_event|download|", "error_event", minutesAgo(5), "event", strconv.FormatInt(eventID, 10))
	gone := insertIncident(t, db, "server_error|http|get|500|", "server_error", minutesAgo(4), "request", "pruned")

	detail, err := reader.IncidentDetail(context.Background(), id)
	if err != nil || !detail.Cause.Known || detail.Cause.Message != "hoster declared dead" {
		t.Fatalf("cause = %+v (%v)", detail.Cause, err)
	}
	detail, err = reader.IncidentDetail(context.Background(), gone)
	if err != nil || detail.Cause.Known {
		t.Fatalf("a pruned source must leave the cause unknown: %+v (%v)", detail.Cause, err)
	}
	insertCapture(t, db, capture{id: "coded", kind: "get", route: "/api/x", atMS: minutesAgo(3), status: 500, errorCode: "boom"})
	insertCapture(t, db, capture{id: "silent", kind: "get", route: "/api/x", atMS: minutesAgo(2), status: 500})
	for _, tc := range []struct {
		source string
		known  bool
	}{{"coded", true}, {"silent", false}} {
		id := insertIncident(t, db, "server_error|http|get|500|", "server_error", minutesAgo(2), "request", tc.source)
		if detail, err := reader.IncidentDetail(context.Background(), id); err != nil || detail.Cause.Known != tc.known {
			t.Fatalf("%s cause = %+v (%v), want known %v", tc.source, detail.Cause, err, tc.known)
		}
	}
}

// TestTitleForNamesEveryReason pins the plain-words title of each fingerprint
// shape incident.Classify* builds, and which reasons count as errors.
func TestTitleForNamesEveryReason(t *testing.T) {
	cases := []struct {
		fingerprint, reason, want string
		isError                   bool
	}{
		{"server_error|http|reconcile|500|list_changes_failed", "server_error", "Sync failed with a server error 500 (list_changes_failed)", true},
		{"client_error|http|patch|409|stale", "client_error", "A write was refused with status 409 (stale)", true},
		{"rejected|websocket|ws_reconcile|malformed", "rejected", "Sync was rejected (malformed)", true},
		{"slow|http|get", "slow", "A read is slow", false},
		{"mobile_failure|cycle_report||sqlite_busy", "mobile_failure", "The phone's sync cycle failed (sqlite_busy)", true},
		{"mobile_failure|episode_action|sync|network", "mobile_failure", "An episode change failed on the phone (network)", true},
		{"error_event|download|download.hoster_attempt", "error_event", "Error in downloads (download.hoster_attempt)", true},
		{"manual_pin|pin-1", "manual_pin", "Pinned moment", false},
		{"server_error|http|ws_ping|500|", "server_error", "The live connection failed with a server error 500", true},
		{"unknown|x", "unknown", "unknown|x", true},
	}
	for _, tc := range cases {
		if got := titleFor(tc.fingerprint, tc.reason); got != tc.want {
			t.Errorf("titleFor(%q) = %q, want %q", tc.fingerprint, got, tc.want)
		}
		if got := isErrorReason(tc.reason); got != tc.isError {
			t.Errorf("isErrorReason(%q) = %v, want %v", tc.reason, got, tc.isError)
		}
	}
}

// TestIncidentSpansFollowTheDesign checks the open, new and 7-day edges.
func TestIncidentSpansFollowTheDesign(t *testing.T) {
	db, reader := openTestReader(t)
	edge := func(span time.Duration, inside bool) int64 {
		if inside {
			return testNow.Add(-span + time.Minute).UnixMilli()
		}
		return testNow.Add(-span - time.Minute).UnixMilli()
	}
	insertIncident(t, db, "slow|http|get", "slow", edge(OpenSpan, true), "request", "open")
	insertIncident(t, db, "slow|http|post", "slow", edge(OpenSpan, false), "request", "closed")
	insertIncident(t, db, "slow|http|delete", "slow", edge(7*24*time.Hour, true), "request", "listed")
	insertIncident(t, db, "slow|http|put", "slow", edge(7*24*time.Hour, false), "request", "unlisted")
	insertIncident(t, db, "slow|http|patch", "slow", edge(7*24*time.Hour, false), "request", "first")
	insertIncident(t, db, "slow|http|patch", "slow", minutesAgo(5), "request", "again")

	view, err := reader.Now(context.Background(), NowInput{Now: testNow, LocalMidnight: testNow, ProcessStartedAt: testNow})
	if err != nil || view.OpenIncidents != 2 {
		t.Fatalf("open = %d (%v), want the occurrence just inside 24 h and the recent one", view.OpenIncidents, err)
	}
	got, err := reader.Incidents(context.Background(), IncidentsInput{Now: testNow, Where: WhereAll})
	if err != nil {
		t.Fatalf("Incidents: %v", err)
	}
	assertFingerprints(t, got, []string{"slow|http|patch", "slow|http|get", "slow|http|post", "slow|http|delete"})
	if !got[1].IsNew || got[2].IsNew || got[0].IsNew {
		t.Fatalf("new = %v %v %v, want only the fingerprint first seen within 24 h", got[0].IsNew, got[1].IsNew, got[2].IsNew)
	}
	exact := testNow.Add(-NewSpan).UnixMilli()
	insertIncident(t, db, "slow|http|head", "slow", exact, "request", "exact")
	got, err = reader.Incidents(context.Background(), IncidentsInput{Now: testNow, Where: WhereAll})
	if err != nil || len(got) != 5 || got[2].Fingerprint != "slow|http|head" || !got[2].IsNew {
		t.Fatalf("a fingerprint first seen exactly 24 h ago is new: %+v (%v)", got, err)
	}
}
