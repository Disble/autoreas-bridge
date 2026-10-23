package telemetry

import (
	"encoding/json"

	"autoreas-bridge/internal/observability/syncdiag"
)

// ReportFacts is the failure-relevant part of one stored telemetry payload:
// what an incident classifier needs, read from the shape each kind stores.
type ReportFacts struct {
	// Outcome is previous_cycle.outcome of a cycle report, or the outcome of an
	// episode action. Empty when the payload carries none.
	Outcome string
	// Phase is the episode-action phase or the screen-stall trigger; empty for
	// a cycle report.
	Phase string
	// Cause is previous_cycle.error_cause or the episode-action cause.
	Cause string
	// DurationMS is the screen-stall duration; zero for every other kind.
	DurationMS int64
}

// cycleReportFacts is the slice of the stored cycle-report payload that holds
// the previous cycle's outcome.
type cycleReportFacts struct {
	PreviousCycle *syncdiag.PreviousCycle `json:"previous_cycle"`
}

// ReadReportFacts reads the failure facts from a stored payload of the given
// kind. An unknown kind, an undecodable payload or a cycle report without a
// previous cycle yields no facts.
func ReadReportFacts(kind KindName, payload []byte) ReportFacts {
	switch kind {
	case KindCycleReport:
		var stored cycleReportFacts
		if json.Unmarshal(payload, &stored) != nil || stored.PreviousCycle == nil {
			return ReportFacts{}
		}
		return ReportFacts{Outcome: stored.PreviousCycle.Outcome, Cause: stringValue(stored.PreviousCycle.ErrorCause)}
	case KindEpisodeAction:
		var stored episodeActionPayload
		if json.Unmarshal(payload, &stored) != nil {
			return ReportFacts{}
		}
		return ReportFacts{Outcome: stringValue(stored.Outcome), Phase: stored.Phase, Cause: stringValue(stored.Cause)}
	case KindScreenStall:
		var stored screenStallPayload
		if json.Unmarshal(payload, &stored) != nil {
			return ReportFacts{}
		}
		return ReportFacts{Phase: stored.Trigger, DurationMS: stored.DurationMS}
	}
	return ReportFacts{}
}

// stringValue returns the pointed-to string, or "" for nil.
func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
