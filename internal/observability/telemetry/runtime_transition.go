package telemetry

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"

	"autoreas-bridge/internal/observability/syncdiag"
)

// KindRuntimeTransition is one real state change of a mobile process, such
// as the sync service starting or dying -- never one row per tick. Like every
// kind after cycle_report it has no default and must be named.
const KindRuntimeTransition KindName = "runtime_transition"

// runtimeTransitionRetentionLimit is this kind's own row cap: the 26 a day
// left of the 50 new reports a day the owner approved once hourly_summary has
// its 24, kept for the 90 days Bridge retains mobile reports.
const runtimeTransitionRetentionLimit = 26 * 90

// runtimeTransitionDied is the one transition the contract gives a rule: a
// death is reported per event only for the sync process; deaths of the main
// process are counted in hourly_summary.process_deaths instead.
const runtimeTransitionDied = "died"

// runtimeTransitionDyingProcess is the only process a per-event death names.
const runtimeTransitionDyingProcess = "sync"

// appVersionPattern is the shape of the reporting build's version: a semantic
// version with its optional pre-release and build parts, short enough to show.
var appVersionPattern = regexp.MustCompile(`^[0-9A-Za-z._+-]{1,32}$`)

// wireRuntimeTransition is the strict-decoded wire body of one
// runtime_transition. Members are json.RawMessage so an absent key stays
// distinguishable from an explicit null.
type wireRuntimeTransition struct {
	// Kind is the discriminator the endpoint already dispatched on; declared
	// only so DisallowUnknownFields does not reject it.
	Kind          string          `json:"kind"`
	ObservationID json.RawMessage `json:"observation_id"`
	ObservedAtMS  json.RawMessage `json:"observed_at_ms"`
	ProcessName   json.RawMessage `json:"process_name"`
	Subject       json.RawMessage `json:"subject"`
	Transition    json.RawMessage `json:"transition"`
	Reason        json.RawMessage `json:"reason"`
	AppVersion    json.RawMessage `json:"app_version"`
}

// runtimeTransitionPayload is the stored five-key shape. Every key is always
// present; reason is null when the tablet recorded none. It carries neither
// kind, observation_id nor observed_at_ms, which the envelope owns.
type runtimeTransitionPayload struct {
	ProcessName string  `json:"process_name"`
	Subject     string  `json:"subject"`
	Transition  string  `json:"transition"`
	Reason      *string `json:"reason"`
	AppVersion  string  `json:"app_version"`
}

// RuntimeTransitionKind is the runtime_transition kind: one complete
// declaration -- decoder, validation, stored shape and retention.
type RuntimeTransitionKind struct{}

// Name reports the wire discriminator.
func (RuntimeTransitionKind) Name() KindName { return KindRuntimeTransition }

// RetentionLimit reports this kind's own declared row cap.
func (RuntimeTransitionKind) RetentionLimit() int { return runtimeTransitionRetentionLimit }

// Decode strict-decodes and validates one runtime_transition body. subject and
// transition are mobile's own codes: Bridge closes their shape, not their
// members, and stores them as sent.
func (RuntimeTransitionKind) Decode(body []byte) (Validated, error) {
	var wire wireRuntimeTransition
	if err := strictDecode(body, &wire); err != nil {
		if fieldErr := undeclaredKey("", err); fieldErr != nil {
			return Validated{}, fieldErr
		}
		return Validated{}, fmt.Errorf("telemetry: decode %s body: %w", KindRuntimeTransition, err)
	}

	observationID, err := decodeObservationID(wire.ObservationID)
	if err != nil {
		return Validated{}, err
	}
	observedAtMS, err := boundedInt("observed_at_ms", wire.ObservedAtMS, 0, math.MaxInt64)
	if err != nil {
		return Validated{}, err
	}
	payload, err := decodeRuntimeTransitionPayload(wire)
	if err != nil {
		return Validated{}, err
	}

	stored, err := json.Marshal(payload)
	if err != nil {
		return Validated{}, fmt.Errorf("telemetry: marshal %s payload: %w", KindRuntimeTransition, err)
	}
	return Validated{EventID: observationID, ObservedAtMS: &observedAtMS, Payload: stored}, nil
}

// decodeRuntimeTransitionPayload validates every payload member in wire order.
func decodeRuntimeTransitionPayload(wire wireRuntimeTransition) (runtimeTransitionPayload, error) {
	var payload runtimeTransitionPayload
	var err error
	if payload.ProcessName, err = vocabularyString("process_name", wire.ProcessName, reportProcessNames); err != nil {
		return payload, err
	}
	if payload.Subject, err = patternString("subject", wire.Subject, reportCodePattern); err != nil {
		return payload, err
	}
	if payload.Transition, err = patternString("transition", wire.Transition, reportCodePattern); err != nil {
		return payload, err
	}
	if payload.Transition == runtimeTransitionDied && payload.ProcessName != runtimeTransitionDyingProcess {
		return payload, &syncdiag.FieldError{Field: "transition", Reason: "died is reported per event only for process_name sync"}
	}
	if payload.Reason, err = optionalPatternString("reason", wire.Reason, reportCodePattern); err != nil {
		return payload, err
	}
	payload.AppVersion, err = patternString("app_version", wire.AppVersion, appVersionPattern)
	return payload, err
}
