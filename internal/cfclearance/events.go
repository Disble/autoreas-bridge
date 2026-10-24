package cfclearance

import (
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// clearance.* event names on the bridge bus. They are backend facts for the activity log, not
// user notifications, and none of them ever carries a cookie value.
const (
	// EventNameChallengeDetected identifies a response recognised as a Cloudflare challenge.
	EventNameChallengeDetected = "clearance.challenge_detected"
	// EventNameClearanceSolved identifies a solve that yielded a fresh clearance.
	EventNameClearanceSolved = "clearance.solved"
	// EventNameClearanceFailed identifies a solve that ended without a usable clearance.
	EventNameClearanceFailed = "clearance.failed"
)

// ChallengeDetectedEvent reports that a response for Domain was recognised as a challenge.
// Attempt counts the request's solves so far plus one; Reason names how it was recognised.
type ChallengeDetectedEvent struct {
	Domain  string
	Attempt int
	Reason  string
}

// Name returns the bus event name for ChallengeDetectedEvent.
func (e ChallengeDetectedEvent) Name() string {
	return EventNameChallengeDetected
}

// ClearanceSolvedEvent reports a solve that yielded a fresh clearance for Domain after
// DurationMs, on the request's Attempt-th solve.
type ClearanceSolvedEvent struct {
	Domain     string
	Attempt    int
	DurationMs int64
}

// Name returns the bus event name for ClearanceSolvedEvent.
func (e ClearanceSolvedEvent) Name() string {
	return EventNameClearanceSolved
}

// ClearanceFailedEvent reports a solve that ended without a usable clearance for Domain after
// DurationMs; Reason is the failure's error text and never a cookie value.
type ClearanceFailedEvent struct {
	Domain     string
	Attempt    int
	DurationMs int64
	Reason     string
}

// Name returns the bus event name for ClearanceFailedEvent.
func (e ClearanceFailedEvent) Name() string {
	return EventNameClearanceFailed
}

// logDomain is the runtime_events domain every clearance fact is logged under.
const logDomain = "clearance"

// announce publishes event on the bus and writes the same fact to the log under the event's own
// name, which is what Activity and the request MCP read: a bus event alone reaches neither.
func (t *Transport) announce(event events.Event, level string, durationMs int64, metadata map[string]any, format string, args ...any) {
	t.publisher.Publish(event)
	t.log.Logf(logDomain, level, sharedlogger.Fields{EventType: event.Name(), DurationMs: durationMs, Metadata: metadata}, format, args...)
}
