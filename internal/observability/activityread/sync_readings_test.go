package activityread

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"slices"
	"strconv"
	"testing"

	"autoreas-bridge/internal/observability/syncreading"
)

// failedSyncPayload is a failed episode action at phase sync as mobile stores it.
const failedSyncPayload = `{"action":"episode_plus_one","phase":"sync","correlation_id":"c1","outcome":"failed","reason":null,"cause":"network","duration_ms":40}`

// insertStart stores one api.listening row, minutes ago, with its metadata.
func insertStart(t *testing.T, db *sql.DB, minutes int, metadata string) int64 {
	t.Helper()
	atMS := minutesAgo(minutes)
	insertEvent(t, db, event{atMS: atMS, domain: "api", level: "info", message: "http server listening", eventType: "api.listening", metadata: metadata})
	return atMS
}

// insertFailedSync stores one failed sync report: failed and arrived minutes ago.
func insertFailedSync(t *testing.T, db *sql.DB, id string, failed, arrived int) {
	t.Helper()
	insertTelemetry(t, db, id, minutesAgo(arrived), minutesAgo(failed), failedSyncPayload)
}

// contactRecord is the metadata of a start that holds device-1's last contact.
func contactRecord(minutes int) string {
	return `{"addr":"[::]:9876","lastContacts":{"device-1":` + strconv.FormatInt(minutesAgo(minutes), 10) + `}}`
}

// readingsOf returns one label per line, newest first: a report's reading, or
// a group's start and size.
func readingsOf(lines []FeedLine) []string {
	out := make([]string, len(lines))
	for i, line := range lines {
		switch {
		case line.BridgeOff != nil:
			out[i] = fmt.Sprintf("group of %d", len(line.BridgeOff.Reports))
		case line.SyncReading != nil:
			out[i] = string(line.SyncReading.Reading)
		default:
			out[i] = "plain"
		}
	}
	return out
}

// trafficLines reads every traffic line of one feed input.
func trafficLines(t *testing.T, r *Reader, in FeedInput) []FeedLine {
	t.Helper()
	in.Types = []FeedType{FeedTraffic}
	return feedLines(feedOf(t, r, in))
}

// seedReadings stores four starts and one report of each reading. Newest
// first its lines are: a contact after the failure (real), a late tablet, a
// failure with Bridge on (real), the group of two at the start at 300, and a
// failure older than the oldest start. The tablet's first report after the
// start at 230 is the late report itself, 30 minutes on.
func seedReadings(t *testing.T, db *sql.DB) {
	t.Helper()
	insertStart(t, db, 600, "")
	insertStart(t, db, 300, `{"addr":"[::]:9876"}`)
	insertStart(t, db, 230, "")
	insertStart(t, db, 100, contactRecord(150))
	insertFailedSync(t, db, "off-1", 400, 290)
	insertFailedSync(t, db, "off-2", 350, 280)
	insertFailedSync(t, db, "late", 240, 200)
	insertFailedSync(t, db, "on", 250, 245)
	insertFailedSync(t, db, "heard", 160, 90)
	insertFailedSync(t, db, "old", 700, 650)
}

func TestFeedShowsEachFailedSyncAsItsReading(t *testing.T) {
	db, r := openTestReader(t)
	seedReadings(t, db)

	lines := trafficLines(t, r, FeedInput{})
	want := []string{"real_failure", "tablet_late", "real_failure", "group of 2", "plain"}
	if got := readingsOf(lines); !slices.Equal(got, want) {
		t.Fatalf("lines = %v, want %v", got, want)
	}
	for i, failed := range []bool{true, true, true, false, true} {
		if lines[i].Failed != failed {
			t.Errorf("line %d (%s) failed = %v, want %v", i, readingsOf(lines)[i], lines[i].Failed, failed)
		}
	}

	heard := lines[0].SyncReading
	wantEvidence := syncreading.Evidence{FailedAtMS: minutesAgo(160), ArrivedAtMS: minutesAgo(90),
		LastContactMS: ptr(minutesAgo(150)), NextStartMS: ptr(minutesAgo(100))}
	if !reflect.DeepEqual(heard.Evidence, wantEvidence) || strconv.FormatInt(heard.ReportID, 10) != lines[0].Line.ID {
		t.Errorf("reading = %+v, want evidence %+v on report %s", heard, wantEvidence, lines[0].Line.ID)
	}
	late := lines[1].SyncReading.Evidence
	wantLate := syncreading.Evidence{FailedAtMS: minutesAgo(240), ArrivedAtMS: minutesAgo(200), NextStartMS: ptr(minutesAgo(230)),
		GraceUntilMS: ptr(minutesAgo(210)), FirstReportMS: ptr(minutesAgo(200)), OverdueMS: ptr(minutesAgo(200) - minutesAgo(210))}
	if !reflect.DeepEqual(late, wantLate) {
		t.Errorf("late evidence = %+v, want Bridge off to 230, grace to 210, its own arrival first, 10 minutes overdue", late)
	}

	group := lines[3]
	if group.Type != FeedTraffic || group.Origin != OriginPhone || group.Line.Kind != LineBridgeOff || group.Line.AtMS != minutesAgo(300) {
		t.Errorf("group line = %+v, want a phone traffic line at its start", group)
	}
	if group.BridgeOff.BridgeStartMS != minutesAgo(300) {
		t.Errorf("group start = %d, want %d", group.BridgeOff.BridgeStartMS, minutesAgo(300))
	}
	for i, arrivedAt := range []int{280, 290} {
		report := group.BridgeOff.Reports[i]
		if report.Reading != syncreading.BridgeOff || report.Evidence.ArrivedAtMS != minutesAgo(arrivedAt) || report.ReportID == 0 ||
			!reflect.DeepEqual(report.Evidence.FirstReportMS, ptr(minutesAgo(290))) ||
			!reflect.DeepEqual(report.Evidence.GraceUntilMS, ptr(minutesAgo(280))) || report.Evidence.OverdueMS != nil {
			t.Errorf("group report %d = %+v, want the report that arrived %d minutes ago, first report at 290", i, report, arrivedAt)
		}
	}
}

// TestFeedMeasuresTheFirstReportAfterTheNextStart walks S1's first report F
// through the feed: any kind of the failing device counts, from the first
// start after the failure, and a group sits on that start.
func TestFeedMeasuresTheFirstReportAfterTheNextStart(t *testing.T) {
	const okCycle = `{"previous_cycle":{"outcome":"completed"}}`
	tests := []struct {
		name   string
		starts []int
		seed   func(t *testing.T, db *sql.DB)
		want   []string
		atMS   int64
	}{
		{"backlog: first report at 2 minutes, the last one after another start", []int{600, 300, 280},
			func(t *testing.T, db *sql.DB) {
				insertFailedSync(t, db, "first", 400, 298)
				insertFailedSync(t, db, "fifteenth", 400, 269)
			}, []string{"group of 2"}, minutesAgo(300)},
		{"silent after the next start, back one minute after the second", []int{600, 300, 200},
			func(t *testing.T, db *sql.DB) { insertFailedSync(t, db, "back", 400, 199) },
			[]string{"tablet_late"}, minutesAgo(199)},
		{"a first report of another kind", []int{600, 300},
			func(t *testing.T, db *sql.DB) {
				insertTelemetryOfKind(t, db, "cycle_report", "cycle", minutesAgo(295), minutesAgo(295), okCycle)
				insertFailedSync(t, db, "change", 400, 250)
			}, []string{"group of 1"}, minutesAgo(300)},
		{"another device's report is ignored", []int{600, 300},
			func(t *testing.T, db *sql.DB) {
				insertDeviceReport(t, db, "device-2", "cycle_report", "cycle", minutesAgo(295), minutesAgo(295), okCycle)
				insertFailedSync(t, db, "change", 400, 250)
			}, []string{"tablet_late"}, minutesAgo(250)},
		{"a report before the next start is ignored", []int{600, 300},
			func(t *testing.T, db *sql.DB) {
				insertTelemetryOfKind(t, db, "cycle_report", "cycle", minutesAgo(310), minutesAgo(310), okCycle)
				insertFailedSync(t, db, "change", 400, 250)
			}, []string{"tablet_late"}, minutesAgo(250)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, r := openTestReader(t)
			for _, minutes := range tt.starts {
				insertStart(t, db, minutes, "")
			}
			tt.seed(t, db)

			lines := trafficLines(t, r, FeedInput{})
			if got := readingsOf(lines); !slices.Equal(got, tt.want) || lines[0].Line.AtMS != tt.atMS {
				t.Fatalf("lines = %v at %d, want %v at %d", got, lines[0].Line.AtMS, tt.want, tt.atMS)
			}
		})
	}
}

func TestBridgeOffGroupKeepsItsIdentityAsItGrows(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 600, "")
	insertStart(t, db, 300, "")
	insertFailedSync(t, db, "off-1", 400, 295)

	before := trafficLines(t, r, FeedInput{})
	insertFailedSync(t, db, "off-2", 400, 280)
	after := trafficLines(t, r, FeedInput{})

	if len(before) != 1 || len(after) != 1 || before[0].Line.ID != after[0].Line.ID || before[0].Line.AtMS != after[0].Line.AtMS {
		t.Fatalf("before = %+v, after = %+v, want one line keeping its id and time", before, after)
	}
	if got := len(after[0].BridgeOff.Reports); got != 2 {
		t.Fatalf("group = %d reports, want 2", got)
	}
}

func TestBridgeOffGroupIsWholeInARangeThatEndsBeforeItsReports(t *testing.T) {
	db, r := openTestReader(t)
	seedReadings(t, db)

	lines := trafficLines(t, r, FeedInput{FromMS: minutesAgo(301), ToMS: minutesAgo(299)})
	if len(lines) != 1 || lines[0].BridgeOff == nil || len(lines[0].BridgeOff.Reports) != 2 {
		t.Fatalf("lines = %+v, want the group with both reports that arrived after the range", lines)
	}
}

func TestBridgeOffLineSortsAboveTheSystemLineOfItsStart(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 600, "")
	insertStart(t, db, 300, "")
	insertFailedSync(t, db, "off", 400, 295)

	lines := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic, FeedSystem}, ToMS: minutesAgo(299), FromMS: minutesAgo(301)}))
	if got := typesOf(lines); len(lines) != 2 || lines[0].BridgeOff == nil || lines[1].System == nil {
		t.Fatalf("lines = %v, want the group, then the start's System line", got)
	}
}

func TestBridgeOffIsNotAFailure(t *testing.T) {
	db, r := openTestReader(t)
	seedReadings(t, db)

	failures := trafficLines(t, r, FeedInput{FailuresOnly: true})
	if got, want := readingsOf(failures), []string{"real_failure", "tablet_late", "real_failure", "plain"}; !slices.Equal(got, want) {
		t.Fatalf("failures = %v, want %v", got, want)
	}
	view := overviewOf(t, r, OverviewInput{Scale: Scale90d, Types: []FeedType{FeedTraffic}, FailuresOnly: true})
	if got := countOf(t, view, FeedTraffic); got.Lines != 5 || got.Failed != 4 {
		t.Fatalf("traffic count = %+v, want 5 lines and 4 failed", got)
	}
	var slotLines, slotFailed int64
	for _, slot := range view.Slots {
		slotLines, slotFailed = slotLines+slot.Count, slotFailed+slot.Failed
	}
	if slotLines != 4 || slotFailed != 4 {
		t.Fatalf("slots = %d lines, %d failed; want the 4 failures", slotLines, slotFailed)
	}
}

func TestReadingCountsEqualTheLinesOfEveryRange(t *testing.T) {
	db, r := openTestReader(t)
	seedReadings(t, db)

	ranges := []struct {
		name         string
		fromMS, toMS int64
	}{
		{"everything", 0, 0},
		{"the group's start alone", minutesAgo(301), minutesAgo(299)},
		{"the group's reports without its start", minutesAgo(295), minutesAgo(270)},
		{"the group and one failed line", minutesAgo(310), minutesAgo(190)},
		{"the failures after the group", minutesAgo(250), 0},
	}
	for _, tc := range ranges {
		t.Run(tc.name, func(t *testing.T) {
			lines := trafficLines(t, r, FeedInput{FromMS: tc.fromMS, ToMS: tc.toMS})
			var failed int64
			for _, line := range lines {
				if line.Failed {
					failed++
				}
			}
			got := countOf(t, overviewOf(t, r, OverviewInput{Scale: Scale90d, FromMS: tc.fromMS, ToMS: tc.toMS}), FeedTraffic)
			if got.Lines != int64(len(lines)) || got.Failed != failed {
				t.Fatalf("count = %+v, want %d lines and %d failed: %v", got, len(lines), failed, readingsOf(lines))
			}
		})
	}
}

func TestChartSlotHoldsAGroupAtItsStartAndAReportAtItsArrival(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 600, "")
	startMS := insertStart(t, db, 130, "") // 15:50, so the group's slot is the hour before its reports'
	insertFailedSync(t, db, "plain", 700, 110)
	insertFailedSync(t, db, "waited", 300, 110)

	var slotOfGroup, slotOfReport ChartSlot
	for _, slot := range overviewOf(t, r, OverviewInput{Scale: Scale24h, Types: []FeedType{FeedTraffic}}).Slots {
		if slot.StartMS <= startMS && startMS < slot.EndMS {
			slotOfGroup = slot
		}
		if at := minutesAgo(110); slot.StartMS <= at && at < slot.EndMS {
			slotOfReport = slot
		}
	}
	if slotOfGroup.Count != 1 || slotOfGroup.Failed != 0 || slotOfReport.Count != 1 || slotOfReport.Failed != 1 {
		t.Fatalf("group slot = %+v, report slot = %+v", slotOfGroup, slotOfReport)
	}
}

func TestFeedPagesThroughGroupsAndReportsSharingAMillisecond(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 900, "")
	insertStart(t, db, 300, "")
	insertStart(t, db, 200, "")
	insertFailedSync(t, db, "off-a", 400, 295)
	insertFailedSync(t, db, "off-b", 250, 195)
	insertFailedSync(t, db, "same-ms", 210, 200) // arrives at its group's own millisecond
	insertFailedSync(t, db, "plain", 1000, 300)  // older than every start, at the other group's millisecond

	full := trafficLines(t, r, FeedInput{})
	var paged []FeedLine
	cursor := ""
	for range len(full) + 1 {
		view := feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, Cursor: cursor, Limit: 1})
		paged = append(paged, feedLines(view)...)
		if cursor = view.NextCursor; cursor == "" {
			break
		}
	}
	if got, want := readingsOf(paged), readingsOf(full); !slices.Equal(got, want) || len(got) != 3 {
		t.Fatalf("paged = %v, want %v", got, want)
	}
	for i := range paged {
		if paged[i].Line.ID != full[i].Line.ID {
			t.Fatalf("line %d = %s, want %s", i, paged[i].Line.ID, full[i].Line.ID)
		}
	}
}

func TestFeedLimitsGroupsToThePageItFetches(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 900, "")
	for i, minutes := range []int{300, 200, 100} {
		insertStart(t, db, minutes, "")
		insertFailedSync(t, db, fmt.Sprintf("off-%d", i), minutes+1, minutes-1)
	}

	first := feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, Limit: 1})
	lines := feedLines(first)
	if len(lines) != 1 || lines[0].Line.AtMS != minutesAgo(100) || first.NextCursor == "" {
		t.Fatalf("first page = %+v, cursor %q; want the newest group and a cursor", lines, first.NextCursor)
	}
}

func TestOnlyFailedSyncActionsGetAReading(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 600, "")
	insertStart(t, db, 300, "")
	insertTelemetry(t, db, "other-phase", minutesAgo(290), minutesAgo(400), `{"phase":"finished","outcome":"failed"}`)
	insertTelemetryOfKind(t, db, "cycle_report", "cycle", minutesAgo(285), minutesAgo(400), `{"previous_cycle":{"outcome":"failed"}}`)
	insertTelemetry(t, db, "not-failed", minutesAgo(280), minutesAgo(400), `{"phase":"sync","outcome":"ok"}`)

	lines := trafficLines(t, r, FeedInput{})
	if got, want := readingsOf(lines), []string{"plain", "plain"}; !slices.Equal(got, want) {
		t.Fatalf("lines = %v, want the two other failures as they are today", got)
	}
	for _, line := range lines {
		if !line.Failed || line.Line.Kind != LinePhoneReport {
			t.Errorf("line = %+v, want a failed report", line)
		}
	}
}

func TestStoredIncidentsStayOnTheirReadingsAndNeverOnAGroup(t *testing.T) {
	db, r := openTestReader(t)
	seedReadings(t, db)
	insertIncident(t, db, "mobile_failure|episode_action|sync|network", "mobile_failure", minutesAgo(290), "mobile", "off-1")
	late := insertIncident(t, db, "mobile_failure|episode_action|sync|network", "mobile_failure", minutesAgo(200), "mobile", "late")

	lines := trafficLines(t, r, FeedInput{})
	if lines[1].IncidentID != late || lines[3].IncidentID != 0 {
		t.Fatalf("incidents = %d and %d, want %d on the late line and none on the group", lines[1].IncidentID, lines[3].IncidentID, late)
	}
}

func TestFailedSyncsReadsAreBounded(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 900, "")
	insertStart(t, db, 300, "")
	for i := range syncReportLimit + 1 {
		insertTelemetry(t, db, fmt.Sprintf("off-%d", i), minutesAgo(290)+int64(i), minutesAgo(400), failedSyncPayload)
	}

	reads, err := r.readFailedSyncs(context.Background(), minutesAgo(900))
	if err != nil {
		t.Fatalf("read failed syncs: %v", err)
	}
	if got := len(reads.readings); got != syncReportLimit {
		t.Fatalf("reports read = %d, want %d", got, syncReportLimit)
	}
}

func TestSyncStartsReadOldestFirstWithTheirRecordsOnly(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 100, contactRecord(150))
	insertStart(t, db, 300, "")
	insertEvent(t, db, event{atMS: minutesAgo(200), domain: "api", level: "warn", message: "capture swept", eventType: "api.capture_swept"})
	insertEvent(t, db, event{atMS: minutesAgo(250), domain: "api", level: "info", message: "request accepted"})
	insertEvent(t, db, event{atMS: minutesAgo(240), domain: "api", level: "info", message: "http server listening on [::]:9876", eventType: "api.other"})
	insertEvent(t, db, event{atMS: minutesAgo(400), domain: "api", level: "info", message: "http server listening on [::]:9876"})

	starts, err := r.SyncStarts(context.Background())
	if err != nil {
		t.Fatalf("sync starts: %v", err)
	}
	want := []syncreading.Start{{AtMS: minutesAgo(400)}, {AtMS: minutesAgo(300)},
		{AtMS: minutesAgo(100), LastContacts: map[string]int64{"device-1": minutesAgo(150)}}}
	if !reflect.DeepEqual(starts, want) {
		t.Fatalf("starts = %+v, want %+v", starts, want)
	}
}

func TestPhoneReportReturnsTheStoredReportUnchanged(t *testing.T) {
	db, r := openTestReader(t)
	seedReadings(t, db)
	group := trafficLines(t, r, FeedInput{})[3].BridgeOff

	detail, err := r.PhoneReport(context.Background(), group.Reports[0].ReportID)
	if err != nil {
		t.Fatalf("phone report: %v", err)
	}
	want := PhoneReport{ID: group.Reports[0].ReportID, AtMS: minutesAgo(280), PhoneAtMS: ptr(minutesAgo(350)), DeviceID: "device-1",
		Kind: "episode_action", Outcome: "failed"}
	if !detail.Found || detail.PayloadJSON != failedSyncPayload || !reflect.DeepEqual(detail.Report, want) {
		t.Fatalf("detail = %+v, want the stored report %+v with its payload", detail, want)
	}

	missing, err := r.PhoneReport(context.Background(), 999_999)
	if err != nil || missing.Found {
		t.Fatalf("missing report = %+v, %v; want not found", missing, err)
	}
}

func TestHistoryKeepsEveryReportAsStored(t *testing.T) {
	db, r := openTestReader(t)
	seedReadings(t, db)

	view, err := r.History(context.Background(), HistoryInput{Now: testNow, Where: WherePhone})
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	reports := 0
	for _, day := range view.Days {
		for _, line := range day.Lines {
			if line.Kind == LinePhoneReport && line.Detail == "failed" {
				reports++
			}
		}
	}
	if reports != 6 {
		t.Fatalf("failed reports in History = %d, want all 6", reports)
	}
}

// ptr returns a pointer to v.
func ptr(v int64) *int64 {
	return &v
}
