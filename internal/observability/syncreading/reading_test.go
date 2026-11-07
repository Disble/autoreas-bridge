package syncreading

import (
	"fmt"
	"reflect"
	"slices"
	"testing"
	"time"
)

// minute is one minute in epoch milliseconds, so a table reads in minutes.
const minute = int64(time.Minute / time.Millisecond)

// testDevice is the device of every failure in these tests.
const testDevice = "device-1"

// at returns a pointer to a time in minutes.
func at(minutes int64) *int64 {
	ms := minutes * minute
	return &ms
}

// start builds a start at the given minute with no last-contact record.
func start(minutes int64) Start {
	return Start{AtMS: minutes * minute}
}

// startWith builds a start at the given minute holding one contact of device.
func startWith(minutes int64, device string, contactMS int64) Start {
	return Start{AtMS: minutes * minute, LastContacts: map[string]int64{device: contactMS}}
}

// failure builds a failure of testDevice at failed, arriving at arrived, in minutes.
func failure(failed, arrived int64) Failure {
	return Failure{DeviceID: testDevice, FailedAtMS: failed * minute, ArrivedAtMS: arrived * minute}
}

// reports answers the first-report lookup from each device's report times, in
// minutes: the first at or after fromMS, as device_telemetry_events does.
func reports(byDevice map[string][]int64) FirstReport {
	return func(deviceID string, fromMS int64) (int64, bool) {
		for _, minutes := range byDevice[deviceID] {
			if minutes*minute >= fromMS {
				return minutes * minute, true
			}
		}
		return 0, false
	}
}

// own is the lookup of testDevice alone, reporting at the given minutes.
func own(minutes ...int64) FirstReport {
	return reports(map[string][]int64{testDevice: minutes})
}

// TestReadAppliesTheApprovedRule walks every branch of S1 and S7 through Read.
// A failure's own report is its device's report at the arrival, so F is never
// later than R, even when the lookup finds nothing.
func TestReadAppliesTheApprovedRule(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		failure Failure
		starts  []Start
		first   FirstReport
		reading Reading
		last    *int64
		next    *int64
		report  *int64
		grace   *int64
		overdue *int64
	}{
		{name: "no start retained", failure: failure(100, 110), reading: NoReading},
		{name: "older than the oldest start", failure: failure(99, 110), starts: []Start{start(100)}, reading: NoReading},
		{name: "one millisecond older than the oldest start",
			failure: Failure{DeviceID: testDevice, FailedAtMS: 100*minute - 1, ArrivedAtMS: 110 * minute},
			starts:  []Start{start(100)}, reading: NoReading},
		{name: "failure at the oldest start stays readable", failure: failure(100, 110), starts: []Start{start(100)},
			reading: RealFailure},
		{name: "no start after the failure", failure: failure(150, 160), starts: []Start{start(100)}, reading: RealFailure},
		{name: "next start falls after the arrival", failure: failure(150, 160), starts: []Start{start(100), start(170)},
			reading: RealFailure, next: at(170)},
		{name: "next start at the arrival", failure: failure(150, 170), starts: []Start{start(100), start(170)},
			reading: BridgeOff, next: at(170), report: at(170), grace: at(190)},
		{name: "a start one millisecond after the failure ends Bridge off",
			failure: failure(150, 160), starts: []Start{start(100), {AtMS: 150*minute + 1}},
			reading: BridgeOff, next: ptr(150*minute + 1), grace: ptr(170*minute + 1), report: at(160)},
		{name: "first report as the grace period opens", failure: failure(150, 300), starts: []Start{start(100), start(170)},
			first: own(170, 300), reading: BridgeOff, next: at(170), report: at(170), grace: at(190)},
		{name: "a start at the failure time is not after it", failure: failure(150, 160), starts: []Start{start(100), start(150)},
			reading: RealFailure},
		{name: "first report inside the grace period", failure: failure(150, 300), starts: []Start{start(100), start(170)},
			first: own(185, 300), reading: BridgeOff, next: at(170), report: at(185), grace: at(190)},
		{name: "first report as the grace period ends", failure: failure(150, 300), starts: []Start{start(100), start(170)},
			first: own(190, 300), reading: BridgeOff, next: at(170), report: at(190), grace: at(190)},
		{name: "first report one millisecond overdue",
			failure: Failure{DeviceID: testDevice, FailedAtMS: 150 * minute, ArrivedAtMS: 190*minute + 1},
			starts:  []Start{start(100), start(170)},
			reading: TabletLate, next: at(170), report: ptr(190*minute + 1), grace: at(190), overdue: ptr(1)},
		{name: "backlog: the first report at 2 minutes, this one at 31",
			failure: failure(150, 201), starts: []Start{start(100), start(170)},
			first: own(172, 180, 190, 201), reading: BridgeOff, next: at(170), report: at(172), grace: at(190)},
		{name: "silent after the first start, back one minute after the second",
			failure: failure(150, 302), starts: []Start{start(100), start(170), start(300)},
			first: own(301, 302), reading: TabletLate, next: at(170), report: at(301), grace: at(190), overdue: at(111)},
		{name: "no report found: the failure's own arrival is the first",
			failure: failure(150, 185), starts: []Start{start(100), start(170)},
			reading: BridgeOff, next: at(170), report: at(185), grace: at(190)},
		{name: "a lookup later than the arrival yields to it",
			failure: failure(150, 185), starts: []Start{start(100), start(170)},
			first: own(250), reading: BridgeOff, next: at(170), report: at(185), grace: at(190)},
		{name: "a report before the start does not count",
			failure: failure(150, 250), starts: []Start{start(100), start(170)},
			first: own(160, 250), reading: TabletLate, next: at(170), report: at(250), grace: at(190), overdue: at(60)},
		{name: "another device's report says nothing",
			failure: failure(150, 250), starts: []Start{start(100), start(170)},
			first:   reports(map[string][]int64{"device-2": {171}, testDevice: {250}}),
			reading: TabletLate, next: at(170), report: at(250), grace: at(190), overdue: at(60)},
		{name: "contact after the failure", failure: failure(150, 180),
			starts:  []Start{start(100), startWith(170, testDevice, 155*minute)},
			reading: RealFailure, last: at(155), next: at(170)},
		{name: "contact at the failure time", failure: failure(150, 180),
			starts:  []Start{start(100), startWith(170, testDevice, 150*minute)},
			reading: RealFailure, last: at(150), next: at(170)},
		{name: "contact before the failure", failure: failure(150, 180),
			starts:  []Start{start(100), startWith(170, testDevice, 150*minute-1)},
			reading: BridgeOff, last: ptr(150*minute - 1), next: at(170), report: at(180), grace: at(190)},
		{name: "another device's contact says nothing", failure: failure(150, 180),
			starts:  []Start{start(100), startWith(170, "device-2", 160*minute)},
			reading: BridgeOff, next: at(170), report: at(180), grace: at(190)},
		{name: "only the next start's record counts", failure: failure(150, 300),
			starts: []Start{start(100), start(170), startWith(290, testDevice, 200*minute)},
			first:  own(175), reading: BridgeOff, next: at(170), report: at(175), grace: at(190)},
		{name: "a start without metadata still reads", failure: failure(150, 500),
			starts:  []Start{start(100), start(170)},
			reading: TabletLate, next: at(170), report: at(500), grace: at(190), overdue: at(310)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			first := tt.first
			if first == nil {
				first = own()
			}
			got := Read(tt.failure, tt.starts, first)
			want := Result{Reading: tt.reading, Evidence: Evidence{
				FailedAtMS: tt.failure.FailedAtMS, ArrivedAtMS: tt.failure.ArrivedAtMS,
				LastContactMS: tt.last, NextStartMS: tt.next, GraceUntilMS: tt.grace, FirstReportMS: tt.report, OverdueMS: tt.overdue,
			}}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("Read = %s, want %s", describe(got), describe(want))
			}
		})
	}
}

// TestReadAsksOnlyWhenTheFirstReportDecides pins the cost on the POST path:
// one lookup, for the failing device from its next start, and only when the
// starts and the last contact leave the reading open.
func TestReadAsksOnlyWhenTheFirstReportDecides(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		failure Failure
		starts  []Start
		want    []string
	}{
		{"no start after the failure", failure(150, 160), []Start{start(100)}, nil},
		{"next start after the arrival", failure(150, 160), []Start{start(100), start(170)}, nil},
		{"contact after the failure", failure(150, 180), []Start{start(100), startWith(170, testDevice, 155*minute)}, nil},
		{"open reading", failure(150, 180), []Start{start(100), start(170), start(175)},
			[]string{fmt.Sprintf("%s@%d", testDevice, 170*minute)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var asked []string
			Read(tt.failure, tt.starts, func(deviceID string, fromMS int64) (int64, bool) {
				asked = append(asked, fmt.Sprintf("%s@%d", deviceID, fromMS))
				return 0, false
			})
			if !slices.Equal(asked, tt.want) {
				t.Fatalf("lookups = %v, want %v", asked, tt.want)
			}
		})
	}
}

// ptr returns a pointer to v.
func ptr(v int64) *int64 {
	return &v
}

// describe renders a result with its pointers dereferenced.
func describe(r Result) string {
	value := func(p *int64) any {
		if p == nil {
			return "nil"
		}
		return *p
	}
	e := r.Evidence
	return fmt.Sprintf("%q failed=%d arrived=%d last=%v next=%v grace=%v first=%v overdue=%v", r.Reading, e.FailedAtMS,
		e.ArrivedAtMS, value(e.LastContactMS), value(e.NextStartMS), value(e.GraceUntilMS), value(e.FirstReportMS),
		value(e.OverdueMS))
}

// TestAppliesOnlyToFailedSyncEpisodeActions pins the reports that get a reading.
func TestAppliesOnlyToFailedSyncEpisodeActions(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                 string
		kind, outcome, phase string
		want                 bool
	}{
		{"failed sync action", "episode_action", "failed", "sync", true},
		{"failed cycle report", "cycle_report", "failed", "sync", false},
		{"failed action at another phase", "episode_action", "failed", "finished", false},
		{"sync action that did not fail", "episode_action", "ok", "sync", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := Applies(tt.kind, tt.outcome, tt.phase); got != tt.want {
				t.Fatalf("Applies = %v, want %v", got, tt.want)
			}
		})
	}
}

// TestWithCurrentStartCountsAnUnflushedStartOnce covers the ingest race: the
// start row may not be stored yet, and once stored it must not count twice,
// because only the row a start wrote carries the record a later read sees.
func TestWithCurrentStartCountsAnUnflushedStartOnce(t *testing.T) {
	t.Parallel()

	current := startWith(200, testDevice, 190*minute)
	tests := []struct {
		name   string
		starts []Start
		want   []int64
	}{
		{"no stored start", nil, []int64{200 * minute}},
		{"row not flushed yet", []Start{start(100)}, []int64{100 * minute, 200 * minute}},
		{"the only row is this process's", []Start{start(201)}, []int64{201 * minute}},
		{"row stored after the process start", []Start{start(100), start(201)}, []int64{100 * minute, 201 * minute}},
		{"row stored in the same millisecond", []Start{start(100), start(200)}, []int64{100 * minute, 200 * minute}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := WithCurrentStart(tt.starts, current)
			times := make([]int64, len(got))
			for i, s := range got {
				times[i] = s.AtMS
			}
			if !slices.Equal(times, tt.want) {
				t.Fatalf("start times = %v, want %v", times, tt.want)
			}
		})
	}
}

// TestWithCurrentStartLeavesTheCallersSliceAlone pins the copy: starts come
// from a shared read, and an append must not write into its backing array.
func TestWithCurrentStartLeavesTheCallersSliceAlone(t *testing.T) {
	t.Parallel()

	backing := make([]Start, 1, 2)
	backing[0] = start(100)
	got := WithCurrentStart(backing, start(200))
	if extended := backing[:2]; extended[1].AtMS != 0 {
		t.Fatalf("backing array was written: %+v", extended)
	}
	if len(got) != 2 {
		t.Fatalf("starts = %+v, want the stored start and the current one", got)
	}
}

// TestDecodeStartReadsTheRecordAndToleratesAnyOtherMetadata pins the record
// S4 writes and S7's older rows, which hold no record.
func TestDecodeStartReadsTheRecordAndToleratesAnyOtherMetadata(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		metadata string
		want     map[string]int64
	}{
		{"record", `{"addr":"[::]:9876","lastContacts":{"device-1":1500}}`, map[string]int64{"device-1": 1500}},
		{"older row", `{"addr":"[::]:9876"}`, nil},
		{"no metadata", ``, nil},
		{"truncation marker", `{"_truncated":true,"_original_keys":2}`, nil},
		{"unreadable record", `{"lastContacts":"[redacted]"}`, nil},
		{"not json", `{`, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := DecodeStart(42, tt.metadata)
			if got.AtMS != 42 || !reflect.DeepEqual(got.LastContacts, tt.want) {
				t.Fatalf("DecodeStart = %+v, want time 42 and contacts %v", got, tt.want)
			}
		})
	}
}

// TestEncodedKeyIsTheKeyDecodeStartReads pins the writer and the reader to one name.
func TestEncodedKeyIsTheKeyDecodeStartReads(t *testing.T) {
	t.Parallel()

	if got := DecodeStart(1, `{"`+LastContactsKey+`":{"d":7}}`); got.LastContacts["d"] != 7 {
		t.Fatalf("DecodeStart = %+v, want the contact under %q", got, LastContactsKey)
	}
}
