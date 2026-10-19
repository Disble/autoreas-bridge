package incident

import (
	"reflect"
	"testing"
	"time"
)

// processStart is the shared process start of request rows.
var processStart = time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)

// afterGrace is an arrival time outside the startup grace.
var afterGrace = processStart.Add(time.Hour)

// intPtr returns a pointer to v.
func intPtr(v int) *int { return &v }

// msPtr returns a pointer to v.
func msPtr(v int64) *int64 { return &v }

// request builds an accepted HTTP request fact outside the startup grace.
func request(status *int, outcome string, durationMS *int64) RequestFact {
	return RequestFact{
		Kind: "patch", Transport: "http", HTTPStatus: status, Outcome: outcome,
		ErrorCode: "anime_not_found", DurationMS: durationMS,
		ObservedAt: afterGrace, ProcessStart: processStart,
	}
}

func TestRequestReasons(t *testing.T) {
	tests := []struct {
		name string
		fact RequestFact
		want []Reason
	}{
		{"200 fast accepted", request(intPtr(200), "accepted", msPtr(10)), nil},
		{"399 is not a failure", request(intPtr(399), "accepted", nil), nil},
		{"400 is a client error", request(intPtr(400), "accepted", nil), []Reason{ReasonClientError}},
		{"499 is a client error", request(intPtr(499), "accepted", nil), []Reason{ReasonClientError}},
		{"500 is a server error", request(intPtr(500), "accepted", nil), []Reason{ReasonServerError}},
		{"599 is a server error", request(intPtr(599), "accepted", nil), []Reason{ReasonServerError}},
		{"600 is outside every class", request(intPtr(600), "accepted", nil), nil},
		{"no status, no duration", request(nil, "accepted", nil), nil},
		{"rejected outcome", request(nil, "rejected", nil), []Reason{ReasonRejected}},
		{"malformed outcome", request(nil, "malformed", nil), []Reason{ReasonRejected}},
		{"pending is not rejected", request(nil, "pending", nil), nil},
		{"1000 ms is not slow", request(intPtr(200), "accepted", msPtr(1000)), nil},
		{"1001 ms is slow", request(intPtr(200), "accepted", msPtr(1001)), []Reason{ReasonSlow}},
		{"all reasons, most severe first", request(intPtr(422), "rejected", msPtr(5000)),
			[]Reason{ReasonClientError, ReasonRejected, ReasonSlow}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := RequestReasons(tc.fact); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("RequestReasons() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestRequestReasonsStartupGrace(t *testing.T) {
	tests := []struct {
		name    string
		elapsed time.Duration
		want    []Reason
	}{
		{"slow at start is not new", 0, nil},
		// The grace is the documented 2 minutes after startup
		// (docs/observability/architecture.md "2. Incidents").
		{"slow one ms before grace ends", 2*time.Minute - time.Millisecond, nil},
		{"slow exactly at grace end triggers", 2 * time.Minute, []Reason{ReasonSlow}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fact := request(intPtr(200), "accepted", msPtr(1001))
			fact.ObservedAt = processStart.Add(tc.elapsed)
			if got := RequestReasons(fact); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("RequestReasons() = %v, want %v", got, tc.want)
			}
		})
	}
	failing := request(intPtr(500), "accepted", msPtr(1001))
	failing.ObservedAt = processStart
	if got := RequestReasons(failing); !reflect.DeepEqual(got, []Reason{ReasonServerError}) {
		t.Fatalf("grace must suppress only slowness, got %v", got)
	}
}

func TestClassifyRequest(t *testing.T) {
	tests := []struct {
		name string
		fact RequestFact
		want Trigger
		ok   bool
	}{
		{"no trigger", request(intPtr(200), "accepted", msPtr(10)), Trigger{}, false},
		{"server error keys status and code", request(intPtr(503), "accepted", nil),
			Trigger{ReasonServerError, "server_error|http|patch|503|anime_not_found"}, true},
		{"client error keys status and code", request(intPtr(404), "rejected", nil),
			Trigger{ReasonClientError, "client_error|http|patch|404|anime_not_found"}, true},
		{"rejected keys code", request(nil, "rejected", nil),
			Trigger{ReasonRejected, "rejected|http|patch|anime_not_found"}, true},
		{"slow keys transport and kind", request(intPtr(200), "accepted", msPtr(2000)),
			Trigger{ReasonSlow, "slow|http|patch"}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := ClassifyRequest(tc.fact)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("ClassifyRequest() = %+v, %v; want %+v, %v", got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestClassifyEvent(t *testing.T) {
	tests := []struct {
		name  string
		level string
		want  Trigger
		ok    bool
	}{
		{"error triggers", "error", Trigger{ReasonErrorEvent, "error_event|downloads|hoster_dead"}, true},
		{"warning never triggers", "warn", Trigger{}, false},
		{"info never triggers", "info", Trigger{}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := ClassifyEvent(EventFact{Domain: "downloads", Level: tc.level, EventType: "hoster_dead"})
			if got != tc.want || ok != tc.ok {
				t.Fatalf("ClassifyEvent() = %+v, %v; want %+v, %v", got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestClassifyMobileReport(t *testing.T) {
	tests := []struct {
		name string
		fact MobileReportFact
		want Trigger
		ok   bool
	}{
		{"failed sync cycle", MobileReportFact{Kind: "cycle_report", Outcome: "failed", Cause: "network"},
			Trigger{ReasonMobileFailure, "mobile_failure|cycle_report||network"}, true},
		{"failed write", MobileReportFact{Kind: "episode_action", Outcome: "failed", Phase: "sync", Cause: "io_error"},
			Trigger{ReasonMobileFailure, "mobile_failure|episode_action|sync|io_error"}, true},
		{"completed cycle", MobileReportFact{Kind: "cycle_report", Outcome: "completed"}, Trigger{}, false},
		{"committed write", MobileReportFact{Kind: "episode_action", Outcome: "committed", Phase: "finished"}, Trigger{}, false},
		{"undeclared kind", MobileReportFact{Kind: "other", Outcome: "failed"}, Trigger{}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := ClassifyMobileReport(tc.fact)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("ClassifyMobileReport() = %+v, %v; want %+v, %v", got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestManualPinAndWindow(t *testing.T) {
	if got := ManualPin("pin-7"); got != (Trigger{ReasonManualPin, "manual_pin|pin-7"}) {
		t.Fatalf("ManualPin() = %+v", got)
	}
	from, to := Window(afterGrace)
	if want := afterGrace.Add(-2 * time.Minute); !from.Equal(want) {
		t.Fatalf("window from = %v, want %v", from, want)
	}
	if want := afterGrace.Add(30 * time.Second); !to.Equal(want) {
		t.Fatalf("window to = %v, want %v", to, want)
	}
}
