// Package incident decides which observed facts open an incident (ADR-028 D2,
// docs/observability/architecture.md "2. Incidents"). It is pure: no storage,
// no I/O, no goroutines and no clock reads. Every time it needs is passed in.
package incident

import (
	"strconv"
	"strings"
	"time"

	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/telemetry"
)

// Reason names why a fact opens an incident.
type Reason string

const (
	// ReasonServerError is an HTTP 5xx response.
	ReasonServerError Reason = "server_error"
	// ReasonClientError is an HTTP 4xx response.
	ReasonClientError Reason = "client_error"
	// ReasonRejected is a request the bridge refused (outcome rejected or malformed).
	ReasonRejected Reason = "rejected"
	// ReasonSlow is a request slower than SlowThreshold.
	ReasonSlow Reason = "slow"
	// ReasonMobileFailure is a phone report of a failed sync cycle or a failed write.
	ReasonMobileFailure Reason = "mobile_failure"
	// ReasonErrorEvent is an error-level internal bridge event from any domain.
	ReasonErrorEvent Reason = "error_event"
	// ReasonManualPin is a "pin this moment" from the UI.
	ReasonManualPin Reason = "manual_pin"
)

const (
	// WindowBefore is how far before the trigger the pinned window starts.
	WindowBefore = 2 * time.Minute
	// WindowAfter is how far after the trigger the pinned window ends.
	WindowAfter = 30 * time.Second
	// SlowThreshold is the duration a request must exceed to count as slow.
	SlowThreshold = 1000 * time.Millisecond
	// StartupGrace is the period after process start in which slow requests
	// never open an incident: cold caches make the first requests slow by nature.
	StartupGrace = 2 * time.Minute
)

// Request outcomes that mean the bridge refused the request. They mirror the
// handler vocabulary (internal/api/handlers/anime_handler.go:51,56).
const (
	outcomeRejected  = "rejected"
	outcomeMalformed = "malformed"
)

// mobileOutcomeFailed is the failure member shared by the sync-cycle outcome
// vocabulary (internal/observability/syncdiag/vocabulary.go:50) and the
// episode-action outcome vocabulary (internal/observability/telemetry/episode_action.go:31).
const mobileOutcomeFailed = "failed"

// fingerprintSeparator joins fingerprint parts.
const fingerprintSeparator = "|"

// Trigger is one classified fact: why it opens an incident and the stable
// fingerprint that groups repeats of the same problem.
type Trigger struct {
	Reason      Reason
	Fingerprint string
}

// RequestFact is the part of a captured request the classifier reads. Field
// names follow requestcapture.CaptureRecord
// (internal/observability/requestcapture/types.go:44-64).
type RequestFact struct {
	// Kind is the capture kind ("patch", "reconcile", "get", "ws_reconcile"). It
	// is used instead of Route because Route is the raw path
	// (internal/api/capture_middleware.go:86) and would split one problem per id.
	Kind string
	// Transport is "http" or "websocket".
	Transport string
	// HTTPStatus is nil when the transport has no status.
	HTTPStatus *int
	// Outcome is the semantic outcome ("accepted", "rejected", "malformed", ...).
	Outcome string
	// ErrorCode is the semantic error code of a refused request.
	ErrorCode string
	// DurationMS is nil when the bridge never observed a duration.
	DurationMS *int64
	// ObservedAt is when the request arrived.
	ObservedAt time.Time
	// ProcessStart is when the bridge process started.
	ProcessStart time.Time
}

// EventFact is the part of an internal bridge event the classifier reads
// (internal/observability/eventlog/types.go:28-36).
type EventFact struct {
	Domain    string
	Level     string
	EventType string
}

// MobileReportFact is the part of a mobile telemetry report the classifier
// reads.
type MobileReportFact struct {
	// Kind is the telemetry kind (internal/observability/telemetry/kind.go:14,20).
	Kind string
	// Outcome is previous_cycle.outcome for a cycle report
	// (internal/observability/syncdiag/types.go:48) or the outcome of an episode
	// action (internal/observability/telemetry/episode_action.go:130).
	Outcome string
	// Phase is the episode-action phase ("finished", "sync"); empty for a cycle report.
	Phase string
	// Cause is the failure class: error_cause of a cycle report or cause of an
	// episode action. It may be empty.
	Cause string
}

// RequestReasons returns every reason a request opens an incident, most severe
// first. An empty result means the request does not trigger.
func RequestReasons(f RequestFact) []Reason {
	var reasons []Reason
	if f.HTTPStatus != nil {
		switch status := *f.HTTPStatus; {
		case status >= 500 && status <= 599:
			reasons = append(reasons, ReasonServerError)
		case status >= 400 && status <= 499:
			reasons = append(reasons, ReasonClientError)
		}
	}
	if f.Outcome == outcomeRejected || f.Outcome == outcomeMalformed {
		reasons = append(reasons, ReasonRejected)
	}
	if isSlow(f) {
		reasons = append(reasons, ReasonSlow)
	}
	return reasons
}

// isSlow reports a duration above SlowThreshold outside the startup grace.
func isSlow(f RequestFact) bool {
	if f.DurationMS == nil || time.Duration(*f.DurationMS)*time.Millisecond <= SlowThreshold {
		return false
	}
	return f.ObservedAt.Sub(f.ProcessStart) >= StartupGrace
}

// ClassifyRequest returns the trigger of a request under its most severe
// reason, and whether it triggers at all.
func ClassifyRequest(f RequestFact) (Trigger, bool) {
	reasons := RequestReasons(f)
	if len(reasons) == 0 {
		return Trigger{}, false
	}
	reason := reasons[0]
	parts := []string{string(reason), f.Transport, f.Kind}
	switch reason {
	case ReasonServerError, ReasonClientError:
		parts = append(parts, strconv.Itoa(*f.HTTPStatus), f.ErrorCode)
	case ReasonRejected:
		parts = append(parts, f.ErrorCode)
	}
	return Trigger{Reason: reason, Fingerprint: fingerprint(parts...)}, true
}

// ClassifyEvent triggers on error-level events only; warnings never open an
// incident (docs/observability/activity-ui.md, owner decision 2026-10-17).
func ClassifyEvent(f EventFact) (Trigger, bool) {
	if f.Level != logger.LevelError {
		return Trigger{}, false
	}
	return Trigger{
		Reason:      ReasonErrorEvent,
		Fingerprint: fingerprint(string(ReasonErrorEvent), f.Domain, f.EventType),
	}, true
}

// ClassifyMobileReport triggers on a failed sync cycle or a failed episode
// action write.
func ClassifyMobileReport(f MobileReportFact) (Trigger, bool) {
	if f.Outcome != mobileOutcomeFailed {
		return Trigger{}, false
	}
	if f.Kind != telemetry.KindCycleReport && f.Kind != telemetry.KindEpisodeAction {
		return Trigger{}, false
	}
	return Trigger{
		Reason:      ReasonMobileFailure,
		Fingerprint: fingerprint(string(ReasonMobileFailure), f.Kind, f.Phase, f.Cause),
	}, true
}

// ManualPin returns the trigger of a manual pin. Each pin is its own problem,
// so pinID (unique per pin) keeps pins from collapsing into one fingerprint.
func ManualPin(pinID string) Trigger {
	return Trigger{Reason: ReasonManualPin, Fingerprint: fingerprint(string(ReasonManualPin), pinID)}
}

// Window returns the pinned window around a trigger time.
func Window(at time.Time) (from, to time.Time) {
	return at.Add(-WindowBefore), at.Add(WindowAfter)
}

// fingerprint joins parts into one stable grouping key.
func fingerprint(parts ...string) string {
	return strings.Join(parts, fingerprintSeparator)
}
