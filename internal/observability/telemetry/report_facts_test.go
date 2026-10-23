package telemetry

import (
	"encoding/json"
	"testing"

	"autoreas-bridge/internal/observability/syncdiag"
)

// strPtr returns a pointer to v.
func strPtr(v string) *string { return &v }

// mustMarshal serializes a stored payload shape for a test.
func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	payload, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return payload
}

// TestReadReportFacts asserts the failure facts are read from each kind's own
// stored payload shape, and that anything unreadable yields no facts.
func TestReadReportFacts(t *testing.T) {
	t.Parallel()

	failedCycle := mustMarshal(t, syncdiag.Record{
		CycleID:       "cycle-1",
		RecentEvents:  []syncdiag.RecentEvent{},
		PreviousCycle: &syncdiag.PreviousCycle{Outcome: "failed", ErrorCause: strPtr("network")},
	})
	noPreviousCycle := mustMarshal(t, syncdiag.Record{CycleID: "cycle-2", RecentEvents: []syncdiag.RecentEvent{}})
	failedAction := mustMarshal(t, episodeActionPayload{
		Action: "episode_plus_one", Phase: "finished", Outcome: strPtr("failed"), Cause: strPtr("timeout"),
	})
	receivedAction := mustMarshal(t, episodeActionPayload{Action: "episode_plus_one", Phase: "received"})
	stall := mustMarshal(t, screenStallPayload{DurationMS: 12000, Trigger: "resize", Transitions: []screenStallTransition{}})

	tests := []struct {
		name    string
		kind    KindName
		payload []byte
		want    ReportFacts
	}{
		{"failed cycle report", KindCycleReport, failedCycle, ReportFacts{Outcome: "failed", Cause: "network"}},
		{"cycle report without previous cycle", KindCycleReport, noPreviousCycle, ReportFacts{}},
		{"failed episode action", KindEpisodeAction, failedAction,
			ReportFacts{Outcome: "failed", Phase: "finished", Cause: "timeout"}},
		{"episode action without outcome", KindEpisodeAction, receivedAction, ReportFacts{Phase: "received"}},
		{"undecodable cycle report", KindCycleReport, []byte("{"), ReportFacts{}},
		{"undecodable episode action", KindEpisodeAction, []byte("{"), ReportFacts{}},
		{"screen stall", KindScreenStall, stall, ReportFacts{Phase: "resize", DurationMS: 12000}},
		{"undecodable screen stall", KindScreenStall, []byte("{"), ReportFacts{}},
		{"unknown kind", "other", failedAction, ReportFacts{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := ReadReportFacts(tt.kind, tt.payload); got != tt.want {
				t.Fatalf("ReadReportFacts = %#v, want %#v", got, tt.want)
			}
		})
	}
}
