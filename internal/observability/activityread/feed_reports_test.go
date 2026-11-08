package activityread

import (
	"context"
	"reflect"
	"testing"

	"autoreas-bridge/internal/observability/telemetry"
)

// seedReportKinds stores one report of each shape S6 P2 and P3 word, each a
// fixed number of minutes before testNow (a process start one millisecond older than
// the service start, so it lists after it), and returns the feed range holding
// them. The death reached Bridge an hour late.
func seedReportKinds(t *testing.T) (*Reader, FeedInput) {
	t.Helper()
	db, r := openTestReader(t)
	insertTelemetryOfKind(t, db, "runtime_transition", "rt-died", minutesAgo(10), minutesAgo(70),
		`{"process_name":"sync","subject":"process","transition":"died","reason":"low_memory","app_version":"1.4.0"}`)
	insertTelemetryOfKind(t, db, "runtime_transition", "rt-started", minutesAgo(11), minutesAgo(11),
		`{"process_name":"main","subject":"service","transition":"started","reason":null,"app_version":"1.4.0"}`)
	insertTelemetryOfKind(t, db, "runtime_transition", "rt-process", minutesAgo(11)-1, minutesAgo(11),
		`{"process_name":"main","subject":"process","transition":"started","reason":null,"app_version":"1.4.0"}`)
	insertTelemetryOfKind(t, db, "hourly_summary", "hs", minutesAgo(12), minutesAgo(72), `{"counts":[],"dropped_count":0}`)
	insertTelemetryOfKind(t, db, "cycle_report", "cr-http", minutesAgo(13), minutesAgo(13),
		`{"previous_cycle":{"outcome":"failed","last_stage":"http"}}`)
	insertTelemetryOfKind(t, db, "cycle_report", "cr-none", minutesAgo(14), minutesAgo(14),
		`{"previous_cycle":{"outcome":"failed","last_stage":null}}`)
	insertTelemetryOfKind(t, db, "cycle_report", "cr-ok", minutesAgo(15), minutesAgo(15),
		`{"previous_cycle":{"outcome":"completed","last_stage":"closed"}}`)
	insertTelemetry(t, db, "ea-failed", minutesAgo(16), minutesAgo(16), `{"outcome":"failed"}`)
	return r, FeedInput{Types: []FeedType{FeedTraffic}, FromMS: minutesAgo(17), ToMS: minutesAgo(9)}
}

// reportLine is the part of a phone report feed line P2 and P3 word.
type reportLine struct {
	kind   string
	detail string
	failed bool
	report *PhoneReportFacts
}

// reportLinesOf reduces feed lines to what P2 and P3 word.
func reportLinesOf(lines []FeedLine) []reportLine {
	out := make([]reportLine, len(lines))
	for i, line := range lines {
		out[i] = reportLine{kind: line.Line.Title, detail: line.Line.Detail, failed: line.Failed, report: line.Report}
	}
	return out
}

func TestFeedReadsRuntimeTransitionsAndFailedCycleStages(t *testing.T) {
	r, in := seedReportKinds(t)
	died := reportLine{"runtime_transition", "sync process died", true,
		&PhoneReportFacts{ProcessName: "sync", Subject: "process", Transition: "died", Reason: "low_memory"}}
	started := reportLine{"runtime_transition", "main service started", false,
		&PhoneReportFacts{ProcessName: "main", Subject: "service", Transition: "started"}}
	restarted := reportLine{"runtime_transition", "main process started", false,
		&PhoneReportFacts{ProcessName: "main", Subject: "process", Transition: "started"}}
	stage := reportLine{"cycle_report", "failed", true, &PhoneReportFacts{Stage: "http"}}
	noStage := reportLine{"cycle_report", "failed", true, nil}
	episode := reportLine{"episode_action", "failed", true, nil}

	// Every transition is a Traffic line and only the death fails; an hourly
	// summary and a cycle that did not fail are never lines.
	if got, want := reportLinesOf(feedLines(feedOf(t, r, in))), []reportLine{died, started, restarted, stage, noStage, episode}; !reflect.DeepEqual(got, want) {
		t.Fatalf("traffic lines = %+v\nwant %+v", got, want)
	}
	failures := in
	failures.FailuresOnly = true
	if got, want := reportLinesOf(feedLines(feedOf(t, r, failures))), []reportLine{died, stage, noStage, episode}; !reflect.DeepEqual(got, want) {
		t.Fatalf("failed traffic lines = %+v\nwant %+v", got, want)
	}
	// A page holding a single report line still reads its facts.
	single := in
	single.ToMS = minutesAgo(10)
	single.FromMS = minutesAgo(10)
	if got, want := reportLinesOf(feedLines(feedOf(t, r, single))), []reportLine{died}; !reflect.DeepEqual(got, want) {
		t.Fatalf("single line = %+v, want %+v", got, want)
	}
	counts := overviewOf(t, r, OverviewInput{Scale: Scale24h, FromMS: in.FromMS, ToMS: in.ToMS})
	if got := countOf(t, counts, FeedTraffic); got.Lines != 6 || got.Failed != 4 {
		t.Fatalf("traffic count = %+v, want the 6 lines Feed lists, 4 failed", got)
	}
}

func TestHistoryListsEveryServedReportKind(t *testing.T) {
	r, _ := seedReportKinds(t)
	view, err := r.History(context.Background(), HistoryInput{Now: testNow, Where: WherePhone, Limit: MaxPageLimit})
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	var got []string
	for _, line := range flatten(view) {
		if line.Kind != LinePhoneReport {
			continue
		}
		got = append(got, line.Title+" "+line.Detail)
		if line.Title == "hourly_summary" && len(line.Marks) != 0 {
			t.Errorf("a closed hour's summary is not late: marks = %v", line.Marks)
		}
	}
	want := []string{"runtime_transition sync process died", "runtime_transition main service started",
		"runtime_transition main process started", `hourly_summary {"counts":[],"dropped_count":0}`, "cycle_report failed",
		"cycle_report failed", "cycle_report completed", "episode_action failed"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("phone reports = %q\nwant %q", got, want)
	}
}

// rowidOf returns the stored row id of one device's report of a kind.
func rowidOf(t *testing.T, r *Reader, device, eventID string) int64 {
	t.Helper()
	var id int64
	if err := r.db.QueryRow(`SELECT rowid FROM device_telemetry_events WHERE device_id = ? AND event_id = ?`, device, eventID).Scan(&id); err != nil {
		t.Fatalf("rowid of %s %s: %v", device, eventID, err)
	}
	return id
}

func TestFeedTrafficHourCarriesEachDevicesHourlySummaryOfThatHour(t *testing.T) {
	db, r := openTestReader(t)
	insertRollup(t, db, hourStart(2), "/api/status", 2, 30)
	insertRollup(t, db, hourStart(2), "/api/sync/reconcile", 4, 1)
	insertRollup(t, db, hourStart(1), "/api/status", 2, 12)
	// Matched by the hour it reports, not by arrival: device-2's summary of
	// the 16:00 hour reached Bridge in the 17:00 hour, and device-1 sent the
	// same hour before it. The 15:00 hour has a summary and no line.
	insertDeviceReport(t, db, "device-2", "hourly_summary", "inst-b:16", minutesAgo(5), hourStart(2),
		`{"counts":[{"trigger_source":"app_active","outcome":"closed","count":2,"max_duration_ms":812}],"dropped_count":0,"process_deaths":[]}`)
	insertDeviceReport(t, db, "device-1", "hourly_summary", "inst-a:16", hourStart(1)+60_000, hourStart(2),
		`{"counts":[{"trigger_source":"foreground_service","outcome":"presence_refused","count":2,"max_duration_ms":null}],"dropped_count":3,`+
			`"process_deaths":[{"process_name":"sync","reason":"low_memory","count":1}]}`)
	insertDeviceReport(t, db, "device-1", "hourly_summary", "inst-a:15", hourStart(1)+120_000, hourStart(3),
		`{"counts":[],"dropped_count":0,"process_deaths":[]}`)

	slowest := int64(812)
	want := []TabletSummary{
		{ReportID: rowidOf(t, r, "device-1", "inst-a:16"), DeviceID: "device-1", ReceivedAtMS: hourStart(1) + 60_000, Summary: telemetry.HourlySummary{
			Counts:        []telemetry.HourlyCount{{TriggerSource: "foreground_service", Outcome: "presence_refused", Count: 2}},
			DroppedCount:  3,
			ProcessDeaths: []telemetry.ProcessDeath{{ProcessName: "sync", Reason: "low_memory", Count: 1}},
		}},
		{ReportID: rowidOf(t, r, "device-2", "inst-b:16"), DeviceID: "device-2", ReceivedAtMS: minutesAgo(5), Summary: telemetry.HourlySummary{
			Counts:        []telemetry.HourlyCount{{TriggerSource: "app_active", Outcome: "closed", Count: 2, MaxDurationMS: &slowest}},
			ProcessDeaths: []telemetry.ProcessDeath{},
		}},
	}

	lines := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}}))
	if len(lines) != 2 || lines[0].Traffic.HourStartMS != hourStart(1) || lines[1].Traffic.HourStartMS != hourStart(2) {
		t.Fatalf("lines = %+v, want the 17:00 and 16:00 hours", lines)
	}
	if lines[0].TabletSummaries != nil {
		t.Errorf("17:00 summaries = %+v, want none: no device reported that hour", lines[0].TabletSummaries)
	}
	if got := lines[1].TabletSummaries; !reflect.DeepEqual(got, want) {
		t.Errorf("16:00 summaries = %+v\nwant %+v", got, want)
	}
	failed := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, FailuresOnly: true}))
	if len(failed) != 1 || !reflect.DeepEqual(failed[0].TabletSummaries, want) {
		t.Errorf("failures-only lines = %+v, want the 16:00 hour with its summaries", failed)
	}

	// A stored summary that does not decode fails the read instead of
	// showing an hour the tablet reported nothing for.
	exec(t, db, `UPDATE device_telemetry_events SET payload_json = '{"counts":7}' WHERE event_id = 'inst-b:16'`)
	if _, err := r.Feed(context.Background(), FeedInput{Now: testNow, Types: []FeedType{FeedTraffic}}); err == nil {
		t.Fatal("Feed over a corrupt summary succeeded, want an error")
	}
}
