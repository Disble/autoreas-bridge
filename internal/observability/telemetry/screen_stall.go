package telemetry

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"autoreas-bridge/internal/observability/syncdiag"
)

// KindScreenStall is one mobile screen stall: a probe armed by a touch, a
// resume, a window focus or a resize that took at least the reporting floor to
// paint a change. Like KindEpisodeAction it has no default and must be named.
const KindScreenStall KindName = "screen_stall"

// screenStallRetentionLimit is this kind's own row cap. Mobile reports only
// probes of two seconds or more, so this kind is written far less often than
// episode_action; it keeps cycle_report's cap rather than reading it, because
// retention is per kind and tuning one kind must never retune another.
const screenStallRetentionLimit = 5000

// The bounds the wire contract declares. duration_ms starts at the reporting
// floor mobile applies before enqueueing, so a shorter value is a client bug,
// and ends at one hour, beyond which the probe measured a suspended app rather
// than a frozen screen.
const (
	screenStallMinDurationMS  = 2000
	screenStallMaxDurationMS  = 3600000
	screenStallMaxTransitions = 8
)

// screenStallTriggers gates trigger.
var screenStallTriggers = map[string]struct{}{
	"touch":      {},
	"app_active": {},
	"focus":      {},
	"resize":     {},
}

// screenStallAppStates gates app_state.
var screenStallAppStates = map[string]struct{}{
	"active":     {},
	"background": {},
	"inactive":   {},
	"unknown":    {},
}

// screenStallTransitionEvents gates transitions[].event. It shares members
// with screenStallAppStates and is still its own set: widening what a
// transition may record must not widen what app_state accepts.
var screenStallTransitionEvents = map[string]struct{}{
	"active":     {},
	"background": {},
	"inactive":   {},
	"focus":      {},
	"blur":       {},
	"resize":     {},
}

// wireScreenStall is the strict-decoded wire body of one screen_stall. Every
// member is json.RawMessage so an absent key stays distinguishable from an
// explicit null: the contract declares every key always present, and only
// window_focused admits null.
type wireScreenStall struct {
	// Kind is the discriminator the endpoint already dispatched on; it is
	// declared only so DisallowUnknownFields does not reject it.
	Kind          string          `json:"kind"`
	ObservationID json.RawMessage `json:"observation_id"`
	ObservedAtMS  json.RawMessage `json:"observed_at_ms"`
	DurationMS    json.RawMessage `json:"duration_ms"`
	Trigger       json.RawMessage `json:"trigger"`
	AppState      json.RawMessage `json:"app_state"`
	WindowFocused json.RawMessage `json:"window_focused"`
	WindowWidth   json.RawMessage `json:"window_width"`
	WindowHeight  json.RawMessage `json:"window_height"`
	ScreenWidth   json.RawMessage `json:"screen_width"`
	ScreenHeight  json.RawMessage `json:"screen_height"`
	Transitions   json.RawMessage `json:"transitions"`
}

// wireScreenStallTransition is one strict-decoded transitions item.
type wireScreenStallTransition struct {
	Event json.RawMessage `json:"event"`
	AtMS  json.RawMessage `json:"at_ms"`
}

// screenStallTransition is one stored transition.
type screenStallTransition struct {
	Event string `json:"event"`
	AtMS  int64  `json:"at_ms"`
}

// screenStallPayload is the stored nine-key shape. Every key is always
// present and transitions is never null, so a reader can query payload_json
// without probing for keys. It carries neither kind, observation_id nor
// observed_at_ms, because the envelope columns own all three.
type screenStallPayload struct {
	DurationMS    int64                   `json:"duration_ms"`
	Trigger       string                  `json:"trigger"`
	AppState      string                  `json:"app_state"`
	WindowFocused *bool                   `json:"window_focused"`
	WindowWidth   int64                   `json:"window_width"`
	WindowHeight  int64                   `json:"window_height"`
	ScreenWidth   int64                   `json:"screen_width"`
	ScreenHeight  int64                   `json:"screen_height"`
	Transitions   []screenStallTransition `json:"transitions"`
}

// ScreenStallKind is the screen_stall kind: one complete declaration --
// decoder, validation, stored shape and retention.
type ScreenStallKind struct{}

// Name reports the wire discriminator.
func (ScreenStallKind) Name() KindName { return KindScreenStall }

// RetentionLimit reports this kind's own declared row cap.
func (ScreenStallKind) RetentionLimit() int { return screenStallRetentionLimit }

// Decode strict-decodes and validates one screen_stall body. It rejects and
// never coerces, and every rejection names the field it refused.
func (ScreenStallKind) Decode(body []byte) (Validated, error) {
	var wire wireScreenStall
	if err := strictDecode(body, &wire); err != nil {
		if fieldErr := undeclaredKey("", err); fieldErr != nil {
			return Validated{}, fieldErr
		}
		return Validated{}, fmt.Errorf("telemetry: decode %s body: %w", KindScreenStall, err)
	}

	observationID, err := requiredString("observation_id", wire.ObservationID)
	if err != nil {
		return Validated{}, err
	}
	if observationID == "" {
		return Validated{}, &syncdiag.FieldError{Field: "observation_id", Reason: "must be a non-empty string"}
	}
	observedAtMS, err := boundedInt("observed_at_ms", wire.ObservedAtMS, 0, math.MaxInt64)
	if err != nil {
		return Validated{}, err
	}
	payload, err := decodeScreenStallPayload(wire)
	if err != nil {
		return Validated{}, err
	}

	stored, err := json.Marshal(payload)
	if err != nil {
		return Validated{}, fmt.Errorf("telemetry: marshal %s payload: %w", KindScreenStall, err)
	}
	return Validated{EventID: observationID, ObservedAtMS: &observedAtMS, Payload: stored}, nil
}

// decodeScreenStallPayload validates every payload member in wire order, so
// the first refusal named is the first offending key a reader of the body sees.
func decodeScreenStallPayload(wire wireScreenStall) (screenStallPayload, error) {
	var payload screenStallPayload
	var err error
	if payload.DurationMS, err = boundedInt("duration_ms", wire.DurationMS, screenStallMinDurationMS, screenStallMaxDurationMS); err != nil {
		return payload, err
	}
	if payload.Trigger, err = vocabularyString("trigger", wire.Trigger, screenStallTriggers); err != nil {
		return payload, err
	}
	if payload.AppState, err = vocabularyString("app_state", wire.AppState, screenStallAppStates); err != nil {
		return payload, err
	}
	if payload.WindowFocused, err = nullableBool("window_focused", wire.WindowFocused); err != nil {
		return payload, err
	}
	dimensions := []struct {
		field string
		raw   json.RawMessage
		into  *int64
	}{
		{"window_width", wire.WindowWidth, &payload.WindowWidth},
		{"window_height", wire.WindowHeight, &payload.WindowHeight},
		{"screen_width", wire.ScreenWidth, &payload.ScreenWidth},
		{"screen_height", wire.ScreenHeight, &payload.ScreenHeight},
	}
	for _, dimension := range dimensions {
		if *dimension.into, err = boundedInt(dimension.field, dimension.raw, 1, math.MaxInt32); err != nil {
			return payload, err
		}
	}
	payload.Transitions, err = screenStallTransitions(wire.Transitions)
	return payload, err
}

// screenStallTransitions validates the transitions array. Order is not
// checked: at_ms is the device clock, which can step backwards, and refusing
// the row would make mobile delete the only copy of the stall.
func screenStallTransitions(raw json.RawMessage) ([]screenStallTransition, error) {
	if raw == nil {
		return nil, &syncdiag.FieldError{Field: "transitions", Reason: "missing required key"}
	}
	var items []json.RawMessage
	if bytes.Equal(raw, []byte("null")) || json.Unmarshal(raw, &items) != nil {
		return nil, &syncdiag.FieldError{Field: "transitions", Reason: "must be an array"}
	}
	if len(items) > screenStallMaxTransitions {
		return nil, &syncdiag.FieldError{Field: "transitions", Reason: fmt.Sprintf("must hold at most %d items", screenStallMaxTransitions)}
	}
	transitions := make([]screenStallTransition, 0, len(items))
	for i, item := range items {
		prefix := fmt.Sprintf("transitions[%d]", i)
		var wire wireScreenStallTransition
		if err := strictDecode(item, &wire); err != nil {
			if fieldErr := undeclaredKey(prefix+".", err); fieldErr != nil {
				return nil, fieldErr
			}
			return nil, &syncdiag.FieldError{Field: prefix, Reason: "must be an object"}
		}
		event, err := vocabularyString(prefix+".event", wire.Event, screenStallTransitionEvents)
		if err != nil {
			return nil, err
		}
		atMS, err := boundedInt(prefix+".at_ms", wire.AtMS, 0, math.MaxInt64)
		if err != nil {
			return nil, err
		}
		transitions = append(transitions, screenStallTransition{Event: event, AtMS: atMS})
	}
	return transitions, nil
}

// strictDecode decodes one JSON object refusing undeclared keys.
func strictDecode(body []byte, into any) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	return decoder.Decode(into)
}

// unknownFieldPrefix is how encoding/json reports a key DisallowUnknownFields
// refused. The standard library exports no typed error for it, so the message
// is the only place the key name exists.
const unknownFieldPrefix = `json: unknown field "`

// undeclaredKey turns a refused undeclared key into a FieldError naming it
// (under prefix), so the 400 tells mobile which key it must stop sending.
// Any other decode error yields nil.
func undeclaredKey(prefix string, err error) *syncdiag.FieldError {
	name, found := strings.CutPrefix(err.Error(), unknownFieldPrefix)
	if !found {
		return nil
	}
	return &syncdiag.FieldError{Field: prefix + strings.TrimSuffix(name, `"`), Reason: "undeclared key"}
}

// requiredString decodes a required, present, non-null string.
func requiredString(field string, raw json.RawMessage) (string, error) {
	if raw == nil {
		return "", &syncdiag.FieldError{Field: field, Reason: "missing required key"}
	}
	return wireString(field, raw)
}

// vocabularyString decodes a required string that must be a member of one
// closed vocabulary.
func vocabularyString(field string, raw json.RawMessage, vocabulary map[string]struct{}) (string, error) {
	value, err := requiredString(field, raw)
	if err != nil {
		return "", err
	}
	if !inVocabulary(vocabulary, value) {
		return "", &syncdiag.FieldError{Field: field, Reason: "not a member of the closed vocabulary"}
	}
	return value, nil
}

// boundedInt decodes a required integer within [minimum, maximum]. A fraction,
// a string or a null is refused rather than truncated or defaulted.
func boundedInt(field string, raw json.RawMessage, minimum, maximum int64) (int64, error) {
	if raw == nil {
		return 0, &syncdiag.FieldError{Field: field, Reason: "missing required key"}
	}
	var value int64
	if bytes.Equal(raw, []byte("null")) || json.Unmarshal(raw, &value) != nil {
		return 0, &syncdiag.FieldError{Field: field, Reason: "must be an integer"}
	}
	if value < minimum || value > maximum {
		return 0, &syncdiag.FieldError{Field: field, Reason: fmt.Sprintf("must be between %d and %d", minimum, maximum)}
	}
	return value, nil
}

// nullableBool decodes a required key whose value is true, false or null.
func nullableBool(field string, raw json.RawMessage) (*bool, error) {
	if raw == nil {
		return nil, &syncdiag.FieldError{Field: field, Reason: "missing required key"}
	}
	if bytes.Equal(raw, []byte("null")) {
		return nil, nil
	}
	var value bool
	if json.Unmarshal(raw, &value) != nil {
		return nil, &syncdiag.FieldError{Field: field, Reason: "must be a boolean or null"}
	}
	return &value, nil
}
