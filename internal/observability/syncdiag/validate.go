package syncdiag

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
)

// maxRecentEvents bounds recent_events: the client's own ring caps at 20,
// but this is deliberate server-side headroom, not the client's number.
const maxRecentEvents = 32

// errorFingerprintPattern matches error_fingerprint / previous_cycle's
// error_fingerprint: exactly 8 lowercase hex characters, fixed length. It
// is FNV-1a rendered (hash >>> 0).toString(16).padStart(8, '0'), so an
// identifier-shaped pattern would reject every digit-leading value -- about
// 62% of real ones.
var errorFingerprintPattern = regexp.MustCompile(`^[0-9a-f]{8}$`)

// WireReport is the strict-decoded shape of the POST /api/sync/diagnostics
// request body. Field order mirrors the wire envelope emitted by mobile's
// toWireSyncCycleTelemetry: cycle_id, degraded, trigger_source, app_state,
// previous_cycle, counters, recent_events.
//
// Degraded and PreviousCycle are json.RawMessage, never a pointer type: a
// pointer collapses "key absent" (nil) and "key present, value null" (also
// nil) into the same value, destroying the exact distinction both fields
// exist to preserve. A decoded RawMessage is nil only when the key is
// absent from the JSON object; a present null value decodes to the 4-byte
// literal "null".
type WireReport struct {
	CycleID       string          `json:"cycle_id"`
	Degraded      json.RawMessage `json:"degraded"`
	TriggerSource string          `json:"trigger_source"`
	AppState      string          `json:"app_state"`
	PreviousCycle json.RawMessage `json:"previous_cycle"`
	Counters      *wireCounters   `json:"counters"`
	RecentEvents  []wireEvent     `json:"recent_events"`
}

// wireCounters is the wire envelope's nested counters object. All three
// members are required and non-null: cursor comes from getLastChangelogId,
// which returns 0 for anything absent, non-numeric or out of range, so
// there is no null to model.
type wireCounters struct {
	ConsecutiveUnclosedCycles int `json:"consecutive_unclosed_cycles"`
	PendingOpsCount           int `json:"pending_ops_count"`
	Cursor                    int `json:"cursor"`
}

// wireEvent is one entry of the wire envelope's recent_events array.
type wireEvent struct {
	Source  string `json:"source"`
	Event   string `json:"event"`
	Cause   string `json:"cause"`
	FirstAt int64  `json:"first_at"`
	LastAt  int64  `json:"last_at"`
	Count   int    `json:"count"`
}

// wirePreviousCycle is the decoded shape of a non-null previous_cycle
// object. Every field is independently nullable except Outcome, which is
// required non-null whenever previous_cycle itself is present.
type wirePreviousCycle struct {
	CycleID           *string `json:"cycle_id"`
	TriggerSource     *string `json:"trigger_source"`
	Outcome           string  `json:"outcome"`
	LastStage         *string `json:"last_stage"`
	StartedAt         *int64  `json:"started_at"`
	ElapsedMS         *int64  `json:"elapsed_ms"`
	ErrorName         *string `json:"error_name"`
	NativeErrcodeByte *int    `json:"native_errcode_byte"`
	ErrorStage        *string `json:"error_stage"`
	ErrorCause        *string `json:"error_cause"`
	ErrorFingerprint  *string `json:"error_fingerprint"`
}

// FieldError reports a single rejected field. It is the one non-house
// response shape this endpoint uses: mobile must be able to log which
// member the bridge rejected, and substring-parsing a generic {"error":…}
// string is worse.
type FieldError struct {
	Field  string
	Reason string
}

// Error implements the error interface.
func (e *FieldError) Error() string {
	return fmt.Sprintf("syncdiag: %s: %s", e.Field, e.Reason)
}

// Validate validates a decoded wire report against every closed vocabulary
// and shape rule, returning a storage-ready Record. It rejects, never
// coerces: every rejection returns a *FieldError naming the offending
// field. DeviceID and ReportedAtMS are left zero-valued -- those come from
// the caller's authenticated device and receipt clock, not the wire body.
func Validate(wire WireReport) (Record, error) {
	degraded, err := validateDegraded(wire.Degraded)
	if err != nil {
		return Record{}, err
	}
	if !inVocabulary(telemetrySenderTriggerSources, wire.TriggerSource) {
		return Record{}, &FieldError{"trigger_source", "not a member of the closed vocabulary"}
	}
	if !inVocabulary(telemetryAppStates, wire.AppState) {
		return Record{}, &FieldError{"app_state", "not a member of the closed vocabulary"}
	}
	if wire.Counters == nil {
		return Record{}, &FieldError{"counters", "missing required key"}
	}
	previousCycle, err := validatePreviousCycle(wire.PreviousCycle)
	if err != nil {
		return Record{}, err
	}
	recentEvents, err := validateRecentEvents(wire.RecentEvents)
	if err != nil {
		return Record{}, err
	}

	return Record{
		CycleID:                   wire.CycleID,
		Degraded:                  degraded,
		TriggerSource:             wire.TriggerSource,
		AppState:                  wire.AppState,
		ConsecutiveUnclosedCycles: wire.Counters.ConsecutiveUnclosedCycles,
		PendingOpsCount:           wire.Counters.PendingOpsCount,
		Cursor:                    wire.Counters.Cursor,
		RecentEvents:              recentEvents,
		PreviousCycle:             previousCycle,
	}, nil
}

// validateDegraded resolves the required, nullable top-level degraded
// field. raw == nil means the key was absent from the request body, which
// is always a rejection -- the client sheds by assignment, never by
// omission, so every legitimately degraded (or non-degraded) payload
// carries this key.
func validateDegraded(raw json.RawMessage) (*string, error) {
	if raw == nil {
		return nil, &FieldError{"degraded", "missing required key"}
	}
	if string(raw) == "null" {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, &FieldError{"degraded", "must be a string or null"}
	}
	if !inVocabulary(degradedReasons, value) {
		return nil, &FieldError{"degraded", "not a member of the closed vocabulary"}
	}
	return &value, nil
}

// optionalVocabularyCheck pairs one nullable previous-cycle field with the
// vocabulary that gates it, so the checks read as a table rather than a chain.
type optionalVocabularyCheck struct {
	field      string
	value      *string
	vocabulary map[string]struct{}
}

// validateOptionalVocabularies checks every nullable enumerated field on a
// previous cycle. A nil value is valid: outcome is the only field guaranteed
// non-null inside a non-null previous_cycle, so every other one may be absent
// for a perfectly real cycle.
func validateOptionalVocabularies(wire wirePreviousCycle) error {
	checks := []optionalVocabularyCheck{
		{"previous_cycle.trigger_source", wire.TriggerSource, syncAttemptTriggerSources},
		{"previous_cycle.last_stage", wire.LastStage, syncStages},
		{"previous_cycle.error_name", wire.ErrorName, syncErrorNames},
		{"previous_cycle.error_stage", wire.ErrorStage, syncErrorStages},
		{"previous_cycle.error_cause", wire.ErrorCause, syncErrorCauses},
	}

	for _, check := range checks {
		if check.value != nil && !inVocabulary(check.vocabulary, *check.value) {
			return &FieldError{check.field, "not a member of the closed vocabulary"}
		}
	}

	return nil
}

// validatePreviousCycle resolves the required previous_cycle field. raw ==
// nil means the key was absent, which is always a rejection: previous_cycle
// is always present on the wire, explicitly null when there is nothing to
// report. A present non-null object is strict-decoded here -- the outer
// decode captures previous_cycle as a raw message, so an unknown key
// nested inside it is caught only by this decode.
func validatePreviousCycle(raw json.RawMessage) (*PreviousCycle, error) {
	if raw == nil {
		return nil, &FieldError{"previous_cycle", "missing required key"}
	}
	if string(raw) == "null" {
		return nil, nil
	}

	var wire wirePreviousCycle
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return nil, &FieldError{"previous_cycle", "malformed or contains an undeclared field"}
	}

	if !inVocabulary(syncOutcomes, wire.Outcome) {
		return nil, &FieldError{"previous_cycle.outcome", "not a member of the closed vocabulary"}
	}
	if err := validateOptionalVocabularies(wire); err != nil {
		return nil, err
	}
	if wire.ErrorFingerprint != nil && !errorFingerprintPattern.MatchString(*wire.ErrorFingerprint) {
		return nil, &FieldError{"previous_cycle.error_fingerprint", "must match ^[0-9a-f]{8}$"}
	}
	if wire.NativeErrcodeByte != nil && (*wire.NativeErrcodeByte < 0 || *wire.NativeErrcodeByte > 65535) {
		return nil, &FieldError{"previous_cycle.native_errcode_byte", "must be between 0 and 65535"}
	}

	return &PreviousCycle{
		CycleID:           wire.CycleID,
		TriggerSource:     wire.TriggerSource,
		Outcome:           wire.Outcome,
		LastStage:         wire.LastStage,
		StartedAt:         wire.StartedAt,
		ElapsedMS:         wire.ElapsedMS,
		ErrorName:         wire.ErrorName,
		NativeErrcodeByte: wire.NativeErrcodeByte,
		ErrorStage:        wire.ErrorStage,
		ErrorCause:        wire.ErrorCause,
		ErrorFingerprint:  wire.ErrorFingerprint,
	}, nil
}

// validateRecentEvents validates recent_events and rebuilds it from the
// decoded, strictly-typed wireEvent values -- never from the client's raw
// bytes. wireEvent declares exactly the six known fields, so any
// undeclared key in the request JSON is already dropped by the initial
// json.Unmarshal into []wireEvent, before validation ever runs; the
// RecentEvent(event) conversion below cannot smuggle a field neither type
// declares.
func validateRecentEvents(events []wireEvent) ([]RecentEvent, error) {
	if len(events) > maxRecentEvents {
		return nil, &FieldError{"recent_events", fmt.Sprintf("exceeds maximum of %d entries", maxRecentEvents)}
	}
	validated := make([]RecentEvent, 0, len(events))
	for _, event := range events {
		if !inVocabulary(recentEventSources, event.Source) {
			return nil, &FieldError{"recent_events.source", "not a member of the closed vocabulary"}
		}
		if !inVocabulary(recentEventTypes, event.Event) {
			return nil, &FieldError{"recent_events.event", "not a member of the closed vocabulary"}
		}
		validated = append(validated, RecentEvent(event))
	}
	return validated, nil
}
