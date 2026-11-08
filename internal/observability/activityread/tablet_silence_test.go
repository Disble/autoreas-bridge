package activityread

import (
	"slices"
	"testing"
	"time"
)

// at returns the epoch milliseconds h hours and m minutes after a fixed origin.
func at(h, m int) int64 {
	return (time.Duration(h)*time.Hour + time.Duration(m)*time.Minute).Milliseconds()
}

// report is a stored report of kind received at ms.
func report(kind string, ms int64) SilenceReport {
	return SilenceReport{Kind: kind, ReceivedAtMS: ms}
}

func TestSilencesOfCountOnlyTimeBridgeWasOn(t *testing.T) {
	// Bridge ran from 0:00 to 10:00, then from 12:00 on; now is 20:00.
	spans := []runSpan{{startMS: at(0, 0), endMS: ptr(at(10, 0))}, {startMS: at(12, 0)}}
	next := func(ms int64) *SilenceReport { r := report("runtime_transition", ms); return &r }
	cases := []struct {
		name string
		gap  reportGap
		want []TabletSilence
	}{
		{"a gap inside one run ends at the next report", reportGap{"tab", report("cycle_report", at(1, 0)), next(at(2, 8))},
			[]TabletSilence{{DeviceID: "tab", StartMS: at(1, 0), EndMS: ptr(at(2, 8)), LastReport: report("cycle_report", at(1, 0)),
				NextReport: next(at(2, 8)), BridgeStartedAtMS: at(0, 0)}}},
		{"59 minutes is not a silence", reportGap{"tab", report("cycle_report", at(3, 0)), next(at(3, 59))}, nil},
		{"exactly 60 minutes is", reportGap{"tab", report("cycle_report", at(4, 0)), next(at(5, 0))},
			[]TabletSilence{{DeviceID: "tab", StartMS: at(4, 0), EndMS: ptr(at(5, 0)), LastReport: report("cycle_report", at(4, 0)),
				NextReport: next(at(5, 0)), BridgeStartedAtMS: at(0, 0)}}},
		{"Bridge off cuts a gap: the stop ends one silence, the start begins the next", reportGap{"tab", report("cycle_report", at(8, 30)), next(at(13, 0))},
			[]TabletSilence{
				{DeviceID: "tab", StartMS: at(8, 30), EndMS: ptr(at(10, 0)), LastReport: report("cycle_report", at(8, 30)),
					BridgeStartedAtMS: at(0, 0), BridgeStoppedAtMS: ptr(at(10, 0))},
				{DeviceID: "tab", StartMS: at(12, 0), EndMS: ptr(at(13, 0)), LastReport: report("cycle_report", at(8, 30)),
					NextReport: next(at(13, 0)), BridgeStartedAtMS: at(12, 0)},
			}},
		{"a silence never starts before Bridge did", reportGap{"tab", report("cycle_report", at(9, 40)), next(at(12, 2))}, nil},
		{"no report yet keeps it open while Bridge runs", reportGap{"tab", report("cycle_report", at(15, 0)), nil},
			[]TabletSilence{{DeviceID: "tab", StartMS: at(15, 0), LastReport: report("cycle_report", at(15, 0)), BridgeStartedAtMS: at(12, 0)}}},
	}
	for _, c := range cases {
		got := silencesOf([]reportGap{c.gap}, spans, at(20, 0))
		if !slices.EqualFunc(got, c.want, equalSilence) {
			t.Errorf("%s: silences = %+v, want %+v", c.name, got, c.want)
		}
	}
}

// equalSilence compares two silences by value, pointers included.
func equalSilence(a, b TabletSilence) bool {
	same := func(x, y *int64) bool { return (x == nil) == (y == nil) && (x == nil || *x == *y) }
	sameReport := func(x, y *SilenceReport) bool {
		return (x == nil) == (y == nil) && (x == nil || x.Kind == y.Kind && x.ReceivedAtMS == y.ReceivedAtMS && same(x.HourStartMS, y.HourStartMS))
	}
	return a.DeviceID == b.DeviceID && a.StartMS == b.StartMS && same(a.EndMS, b.EndMS) && sameReport(&a.LastReport, &b.LastReport) &&
		sameReport(a.NextReport, b.NextReport) && a.BridgeStartedAtMS == b.BridgeStartedAtMS && same(a.BridgeStoppedAtMS, b.BridgeStoppedAtMS)
}

func TestFeedShowsATabletSilenceAsAFailedTrafficLineAndCountsIt(t *testing.T) {
	db, r := openTestReader(t)
	for _, e := range []event{
		startEvent(hoursAgo(30)), closeEvent(hoursAgo(20)),
		bootEvent(hoursAgo(10) - 5000), startEvent(hoursAgo(10)),
	} {
		insertEvent(t, db, e)
	}
	insertDeviceReport(t, db, "tab", "cycle_report", "c1", hoursAgo(29), hoursAgo(29), `{}`)
	insertDeviceReport(t, db, "tab", "runtime_transition", "t1", hoursAgo(26), hoursAgo(26), `{"transition":"started"}`)
	insertDeviceReport(t, db, "tab", "cycle_report", "c2", hoursAgo(26)+30*60_000, hoursAgo(26)+30*60_000, `{}`)
	insertDeviceReport(t, db, "tab", "cycle_report", "c3", hoursAgo(3), hoursAgo(3), `{}`)
	insertDeviceReport(t, db, "other", "cycle_report", "o1", minutesAgo(30), minutesAgo(30), `{}`)

	traffic := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}}))
	got := silenceLineWords(t, traffic)
	format := func(ms int64) string { return time.UnixMilli(ms).UTC().Format(time.DateTime) }
	want := []string{
		"tab " + format(hoursAgo(3)) + " open",                               // silent since its last report, Bridge still on
		"tab " + format(hoursAgo(10)) + " " + format(hoursAgo(3)),            // from the start to the next report
		"tab " + format(hoursAgo(26)+30*60_000) + " " + format(hoursAgo(20)), // to the clean close
		"tab " + format(hoursAgo(29)) + " " + format(hoursAgo(26)),           // between two reports
	}
	if !slices.Equal(got, want) {
		t.Fatalf("silences = %v, want %v", got, want)
	}

	// Lines and counts agree; the phone origin does not read Bridge's silences.
	overview, err := r.Overview(t.Context(), OverviewInput{Now: testNow, Scale: Scale24h})
	if err != nil {
		t.Fatal(err)
	}
	var slotsFailed int64
	for _, slot := range overview.Slots {
		slotsFailed += slot.Failed
	}
	if slotsFailed != 2 || overview.Types[1].Type != FeedTraffic || overview.Types[1].Failed != 2 {
		t.Errorf("overview = %+v, want the two silences of the last 24 hours as failed Traffic", overview)
	}
	for _, line := range feedLines(feedOf(t, r, FeedInput{Origin: OriginPhone, Types: []FeedType{FeedTraffic}})) {
		if line.Silence != nil {
			t.Errorf("phone origin read silence %+v", line.Silence)
		}
	}
	failed := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, FailuresOnly: true}))
	if len(failed) != 4 || failed[0].Silence == nil {
		t.Errorf("failures only = %d lines, want the four silences", len(failed))
	}
	if system := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedSystem}})); slices.ContainsFunc(system, func(l FeedLine) bool { return l.Silence != nil }) {
		t.Errorf("a System-only read listed a silence")
	}

	assertPagingListsEachLineOnce(t, r, traffic)
	assertRangesHoldOneSilence(t, r)
}

// silenceLineWords checks every silence line's shape and names each as device, start and end.
func silenceLineWords(t *testing.T, traffic []FeedLine) []string {
	t.Helper()
	var words []string
	for _, line := range traffic {
		if line.Silence == nil {
			continue
		}
		if !line.Failed || line.Origin != OriginBridge || line.Type != FeedTraffic || line.Line.Kind != LineTabletSilence ||
			line.Line.AtMS != line.Silence.StartMS+time.Hour.Milliseconds() {
			t.Errorf("silence line = %+v, want a failed bridge Traffic line an hour after it began", line)
		}
		end := "open"
		if line.Silence.EndMS != nil {
			end = time.UnixMilli(*line.Silence.EndMS).UTC().Format(time.DateTime)
		}
		words = append(words, line.Silence.DeviceID+" "+time.UnixMilli(line.Silence.StartMS).UTC().Format(time.DateTime)+" "+end)
	}
	return words
}

// assertPagingListsEachLineOnce pages one line at a time and expects the full order.
func assertPagingListsEachLineOnce(t *testing.T, r *Reader, traffic []FeedLine) {
	t.Helper()
	var paged []string
	cursor := ""
	for range len(traffic) + 1 {
		view := feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, Cursor: cursor, Limit: 1})
		for _, line := range feedLines(view) {
			paged = append(paged, line.Line.ID)
		}
		if cursor = view.NextCursor; cursor == "" {
			break
		}
	}
	var full []string
	for _, line := range traffic {
		full = append(full, line.Line.ID)
	}
	if !slices.Equal(paged, full) {
		t.Errorf("paged = %v, want %v", paged, full)
	}
}

// assertRangesHoldOneSilence expects a range to hold a silence whose line time is either of its
// edges, and to count it as one failed line.
func assertRangesHoldOneSilence(t *testing.T, r *Reader) {
	t.Helper()
	// The last row leaves an older silence before the range, which must not hide the one inside it.
	secondLineMS := hoursAgo(25) + 30*60_000
	for _, edge := range []struct{ fromMS, toMS int64 }{{hoursAgo(28), hoursAgo(28) + 1}, {hoursAgo(28) - 1, hoursAgo(28)}, {secondLineMS, secondLineMS + 1}} {
		lines := feedLines(feedOf(t, r, FeedInput{Types: []FeedType{FeedTraffic}, FromMS: edge.fromMS, ToMS: edge.toMS}))
		count := countOf(t, overviewOf(t, r, OverviewInput{Scale: Scale90d, FromMS: edge.fromMS, ToMS: edge.toMS}), FeedTraffic)
		if len(lines) != 1 || lines[0].Silence == nil || lines[0].Line.AtMS < edge.fromMS || count.Lines != 1 || count.Failed != 1 {
			t.Errorf("range %+v = %d lines, count %+v; want only the silence whose line is in the range", edge, len(lines), count)
		}
	}
}

// TestHistoryAndOpenSilencesReadTheSameSilences pins what the MCP reads: every
// silence in search_history, and only the running ones in get_status.
func TestHistoryAndOpenSilencesReadTheSameSilences(t *testing.T) {
	db, r := openTestReader(t)
	insertEvent(t, db, startEvent(hoursAgo(10)))
	insertDeviceReport(t, db, "tab", "cycle_report", "c1", hoursAgo(9), hoursAgo(9), `{}`)
	insertDeviceReport(t, db, "tab", "cycle_report", "c2", hoursAgo(6), hoursAgo(6), `{}`)

	want := []string{"tab Tablet silent 360 min so far " + formatID(hoursAgo(5)), "tab Tablet was silent 180 min " + formatID(hoursAgo(8))}
	if got := historySilenceWords(t, r, WherePhone); !slices.Equal(got, want) {
		t.Fatalf("history silences = %q, want %q", got, want)
	}
	if got := historySilenceWords(t, r, Where("downloads")); len(got) != 0 {
		t.Fatalf("downloads read silences %q", got)
	}
	if paged := pageHistory(t, r, WherePhone, 1); countSilenceLines(paged) != 2 {
		t.Fatalf("paged lines = %+v, want the 2 silences once each", paged)
	}

	open, err := r.OpenTabletSilences(t.Context(), testNow)
	if err != nil || len(open) != 1 || open[0].StartMS != hoursAgo(6) || open[0].EndMS != nil {
		t.Fatalf("open silences = %+v (%v), want the one still running", open, err)
	}
	insertEvent(t, db, closeEvent(hoursAgo(1)))
	if open, err = r.OpenTabletSilences(t.Context(), testNow); err != nil || len(open) != 0 {
		t.Fatalf("after a clean close = %+v (%v), want none", open, err)
	}
}

// historySilenceWords names each silence line one History read lists.
func historySilenceWords(t *testing.T, r *Reader, where Where) []string {
	t.Helper()
	view, err := r.History(t.Context(), HistoryInput{Now: testNow, Where: where, Limit: MaxPageLimit})
	if err != nil {
		t.Fatal(err)
	}
	words := []string{}
	for _, line := range flatten(view) {
		if line.Kind == LineTabletSilence {
			words = append(words, line.Source+" "+line.Title+" "+line.Detail+" "+formatID(line.AtMS))
		}
	}
	return words
}

// countSilenceLines counts the silence lines among ledger lines.
func countSilenceLines(lines []LedgerLine) int {
	count := 0
	for _, line := range lines {
		if line.Kind == LineTabletSilence {
			count++
		}
	}
	return count
}

// TestACrashEndsTheSilenceAtTheRunsLastRow pins that a boot row of the next
// run does not stretch the crashed run over the time Bridge was off.
func TestACrashEndsTheSilenceAtTheRunsLastRow(t *testing.T) {
	db, r := openTestReader(t)
	bootRow := event{atMS: hoursAgo(5) - 500, domain: "anime", level: "info", message: "boot row of second run", eventType: "x"}
	for _, e := range []event{
		bootEvent(hoursAgo(20) - 1000), startEvent(hoursAgo(20)),
		{atMS: hoursAgo(15), domain: "anime", level: "info", message: "last row", eventType: "x"},
		bootEvent(hoursAgo(5) - 1000), bootRow, startEvent(hoursAgo(5)),
	} {
		insertEvent(t, db, e)
	}
	insertDeviceReport(t, db, "tab", "cycle_report", "a", hoursAgo(17), hoursAgo(17), `{}`)
	insertDeviceReport(t, db, "tab", "cycle_report", "b", hoursAgo(3), hoursAgo(3), `{}`)
	insertDeviceReport(t, db, "tab", "cycle_report", "c", minutesAgo(10), minutesAgo(10), `{}`)

	silences, err := r.tabletSilences(t.Context(), testNow.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	first, middle := SilenceReport{Kind: "cycle_report", ReceivedAtMS: hoursAgo(17)}, SilenceReport{Kind: "cycle_report", ReceivedAtMS: hoursAgo(3)}
	want := []TabletSilence{
		{DeviceID: "tab", StartMS: hoursAgo(17), EndMS: ptr(hoursAgo(15)), LastReport: first, BridgeStartedAtMS: hoursAgo(20), BridgeStoppedAtMS: ptr(hoursAgo(15))},
		{DeviceID: "tab", StartMS: hoursAgo(5), EndMS: ptr(hoursAgo(3)), LastReport: first, NextReport: &middle, BridgeStartedAtMS: hoursAgo(5)},
		{DeviceID: "tab", StartMS: hoursAgo(3), EndMS: ptr(minutesAgo(10)), LastReport: middle,
			NextReport: &SilenceReport{Kind: "cycle_report", ReceivedAtMS: minutesAgo(10)}, BridgeStartedAtMS: hoursAgo(5)},
	}
	if !slices.EqualFunc(silences, want, equalSilence) {
		t.Fatalf("silences = %+v\nwant %+v", silences, want)
	}
}

func TestSilenceBeforeTheOldestCycleReportIsReadByTheHour(t *testing.T) {
	db, r := openTestReader(t)
	insertEvent(t, db, startEvent(hoursAgo(40)))
	insertEvent(t, db, closeEvent(hoursAgo(5))) // the only run's close ends the last silence
	count := func(outcome string, n string) string {
		return `{"trigger_source":"manual","outcome":"` + outcome + `","count":` + n + `}`
	}
	summary := func(id string, hourAgo int, counts string) {
		payload := `{"counts":[` + counts + `],"dropped_count":0,"process_deaths":[]}`
		insertDeviceReport(t, db, "tab", "hourly_summary", id, hoursAgo(20)+60_000, hoursAgo(hourAgo), payload)
	}
	summary("h33", 33, count("closed", "3"))
	summary("h32", 32, count("closed", "0")) // a closed outcome that never happened
	summary("h31", 31, count("closed", "3"))
	summary("h30", 30, count("closed", "3"))
	summary("h29", 29, count("failed", "3")) // Bridge never answered that hour
	summary("h28", 28, count("closed", "3"))
	summary("h27", 27, count("unsettled", "5")+","+count("closed", "1"))                       // one closed sync is enough
	insertDeviceReport(t, db, "tab", "episode_action", "e1", hoursAgo(24), hoursAgo(24), `{}`) // before the oldest cycle report
	insertDeviceReport(t, db, "tab", "cycle_report", "c1", hoursAgo(20), hoursAgo(20), `{}`)
	insertDeviceReport(t, db, "tab", "cycle_report", "c2", minutesAgo(30), minutesAgo(30), `{}`)

	silences, err := r.tabletSilences(t.Context(), testNow.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	hour := func(h int) *int64 { return ptr(hoursAgo(h)) }
	want := []TabletSilence{
		{DeviceID: "tab", StartMS: hoursAgo(32), EndMS: ptr(hoursAgo(31)), BridgeStartedAtMS: hoursAgo(40),
			LastReport: SilenceReport{Kind: "hourly_summary", ReceivedAtMS: hoursAgo(32), HourStartMS: hour(33)},
			NextReport: &SilenceReport{Kind: "hourly_summary", ReceivedAtMS: hoursAgo(31), HourStartMS: hour(31)}},
		{DeviceID: "tab", StartMS: hoursAgo(29), EndMS: ptr(hoursAgo(28)), BridgeStartedAtMS: hoursAgo(40),
			LastReport: SilenceReport{Kind: "hourly_summary", ReceivedAtMS: hoursAgo(29), HourStartMS: hour(30)},
			NextReport: &SilenceReport{Kind: "hourly_summary", ReceivedAtMS: hoursAgo(28), HourStartMS: hour(28)}},
		{DeviceID: "tab", StartMS: hoursAgo(26), EndMS: ptr(hoursAgo(20)), BridgeStartedAtMS: hoursAgo(40),
			LastReport: SilenceReport{Kind: "hourly_summary", ReceivedAtMS: hoursAgo(26), HourStartMS: hour(27)},
			NextReport: &SilenceReport{Kind: "cycle_report", ReceivedAtMS: hoursAgo(20)}},
		{DeviceID: "tab", StartMS: hoursAgo(20) + 60_000, EndMS: ptr(hoursAgo(5)), BridgeStartedAtMS: hoursAgo(40),
			LastReport: SilenceReport{Kind: "hourly_summary", ReceivedAtMS: hoursAgo(20) + 60_000}, BridgeStoppedAtMS: ptr(hoursAgo(5))},
	}
	if !slices.EqualFunc(silences, want, equalSilence) {
		t.Fatalf("silences = %+v\nwant %+v", silences, want)
	}
}
