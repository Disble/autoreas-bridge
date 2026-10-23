package telemetry

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/observability/syncdiag"
)

// screenStallBody is the canonical valid screen_stall body, written as a
// literal because it IS the wire contract mobile agreed. Every rejection row
// perturbs it in exactly one place, so the named field is attributable.
const screenStallBody = `{"kind":"screen_stall","observation_id":"0b6f3c1e-2a4d-4f7b-9c1d-5e8a7b6c4d3f","observed_at_ms":1761200700000,"duration_ms":120000,"trigger":"app_active","app_state":"active","window_focused":null,"window_width":600,"window_height":900,"screen_width":1200,"screen_height":900,"transitions":[{"event":"background","at_ms":1761200600000},{"event":"active","at_ms":1761200700000}]}`

// screenStallWith swaps one literal fragment of the canonical body.
func screenStallWith(from, to string) string {
	if !strings.Contains(screenStallBody, from) {
		panic("screenStallWith: fragment not in canonical body: " + from)
	}
	return strings.Replace(screenStallBody, from, to, 1)
}

// TestScreenStallKindDecodesTheCanonicalBody pins the envelope values and the
// stored nine-key payload, transitions included, with no envelope key copied in.
func TestScreenStallKindDecodesTheCanonicalBody(t *testing.T) {
	t.Parallel()

	validated, err := ScreenStallKind{}.Decode([]byte(screenStallBody))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if validated.EventID != "0b6f3c1e-2a4d-4f7b-9c1d-5e8a7b6c4d3f" {
		t.Fatalf("EventID = %q", validated.EventID)
	}
	if validated.ObservedAtMS == nil || *validated.ObservedAtMS != 1761200700000 {
		t.Fatalf("ObservedAtMS = %v", validated.ObservedAtMS)
	}
	if validated.Degraded != nil {
		t.Fatalf("Degraded = %v, want nil", *validated.Degraded)
	}
	want := `{"duration_ms":120000,"trigger":"app_active","app_state":"active","window_focused":null,"window_width":600,"window_height":900,"screen_width":1200,"screen_height":900,"transitions":[{"event":"background","at_ms":1761200600000},{"event":"active","at_ms":1761200700000}]}`
	if string(validated.Payload) != want {
		t.Fatalf("Payload = %s\nwant      %s", validated.Payload, want)
	}
}

// TestScreenStallKindAcceptsEveryBoundaryAndVocabularyMember accepts the
// inclusive bounds, a focused flag, an empty transitions array (stored as []
// rather than null) and the members each closed vocabulary admits.
func TestScreenStallKindAcceptsEveryBoundaryAndVocabularyMember(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name, from, to, stored string
	}{
		{"minimum duration", `"duration_ms":120000`, `"duration_ms":2000`, `"duration_ms":2000`},
		{"maximum duration", `"duration_ms":120000`, `"duration_ms":3600000`, `"duration_ms":3600000`},
		{"focused", `"window_focused":null`, `"window_focused":true`, `"window_focused":true`},
		{"blurred", `"window_focused":null`, `"window_focused":false`, `"window_focused":false`},
		{"no transitions", `[{"event":"background","at_ms":1761200600000},{"event":"active","at_ms":1761200700000}]`, `[]`, `"transitions":[]`},
		{"touch trigger", `"trigger":"app_active"`, `"trigger":"touch"`, `"trigger":"touch"`},
		{"focus trigger", `"trigger":"app_active"`, `"trigger":"focus"`, `"trigger":"focus"`},
		{"resize trigger", `"trigger":"app_active"`, `"trigger":"resize"`, `"trigger":"resize"`},
		{"background state", `"app_state":"active"`, `"app_state":"background"`, `"app_state":"background"`},
		{"inactive state", `"app_state":"active"`, `"app_state":"inactive"`, `"app_state":"inactive"`},
		{"unknown state", `"app_state":"active"`, `"app_state":"unknown"`, `"app_state":"unknown"`},
		{"blur transition", `"event":"background"`, `"event":"blur"`, `"event":"blur"`},
		{"focus transition", `"event":"background"`, `"event":"focus"`, `"event":"focus"`},
		{"resize transition", `"event":"background"`, `"event":"resize"`, `"event":"resize"`},
		{"inactive transition", `"event":"background"`, `"event":"inactive"`, `"event":"inactive"`},
		{"one-dp window", `"window_width":600`, `"window_width":1`, `"window_width":1`},
		{"epoch transition time", `"at_ms":1761200600000`, `"at_ms":0`, `"at_ms":0`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			validated, err := ScreenStallKind{}.Decode([]byte(screenStallWith(tc.from, tc.to)))
			if err != nil {
				t.Fatalf("Decode() error = %v", err)
			}
			if !strings.Contains(string(validated.Payload), tc.stored) {
				t.Fatalf("Payload %s does not store %s", validated.Payload, tc.stored)
			}
		})
	}
}

// TestScreenStallKindAcceptsAnEpochObservedAt accepts the inclusive lower
// bound of observed_at_ms, which lives in the envelope rather than the payload.
func TestScreenStallKindAcceptsAnEpochObservedAt(t *testing.T) {
	t.Parallel()

	validated, err := ScreenStallKind{}.Decode([]byte(screenStallWith(`"observed_at_ms":1761200700000`, `"observed_at_ms":0`)))
	if err != nil || validated.ObservedAtMS == nil || *validated.ObservedAtMS != 0 {
		t.Fatalf("Decode() = %v, %v; want observed_at_ms 0", validated.ObservedAtMS, err)
	}
}

// TestScreenStallKindAcceptsEightTransitions accepts the declared maximum.
func TestScreenStallKindAcceptsEightTransitions(t *testing.T) {
	t.Parallel()

	items := strings.TrimSuffix(strings.Repeat(`{"event":"resize","at_ms":1},`, 8), ",")
	body := screenStallWith(`[{"event":"background","at_ms":1761200600000},{"event":"active","at_ms":1761200700000}]`, "["+items+"]")
	if _, err := (ScreenStallKind{}).Decode([]byte(body)); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
}

// TestScreenStallKindRejectsAndNamesTheField refuses every out-of-contract
// value with a *syncdiag.FieldError naming the offending field, which is what
// mobile logs.
func TestScreenStallKindRejectsAndNamesTheField(t *testing.T) {
	t.Parallel()

	nineItems := "[" + strings.TrimSuffix(strings.Repeat(`{"event":"resize","at_ms":1},`, 9), ",") + "]"
	transitions := `[{"event":"background","at_ms":1761200600000},{"event":"active","at_ms":1761200700000}]`
	tests := []struct {
		name, from, to, field string
	}{
		{"empty observation id", `"observation_id":"0b6f3c1e-2a4d-4f7b-9c1d-5e8a7b6c4d3f"`, `"observation_id":""`, "observation_id"},
		{"null observation id", `"observation_id":"0b6f3c1e-2a4d-4f7b-9c1d-5e8a7b6c4d3f"`, `"observation_id":null`, "observation_id"},
		{"missing observation id", `"observation_id":"0b6f3c1e-2a4d-4f7b-9c1d-5e8a7b6c4d3f",`, ``, "observation_id"},
		{"negative observed at", `"observed_at_ms":1761200700000`, `"observed_at_ms":-1`, "observed_at_ms"},
		{"missing observed at", `"observed_at_ms":1761200700000,`, ``, "observed_at_ms"},
		{"null observed at", `"observed_at_ms":1761200700000`, `"observed_at_ms":null`, "observed_at_ms"},
		{"null transition time", `"at_ms":1761200600000`, `"at_ms":null`, "transitions[0].at_ms"},
		{"duration below floor", `"duration_ms":120000`, `"duration_ms":1999`, "duration_ms"},
		{"duration above ceiling", `"duration_ms":120000`, `"duration_ms":3600001`, "duration_ms"},
		{"fractional duration", `"duration_ms":120000`, `"duration_ms":2500.5`, "duration_ms"},
		{"string duration", `"duration_ms":120000`, `"duration_ms":"120000"`, "duration_ms"},
		{"null duration", `"duration_ms":120000`, `"duration_ms":null`, "duration_ms"},
		{"unknown trigger", `"trigger":"app_active"`, `"trigger":"scroll"`, "trigger"},
		{"missing trigger", `"trigger":"app_active",`, ``, "trigger"},
		{"unknown app state", `"app_state":"active"`, `"app_state":"focused"`, "app_state"},
		{"null app state", `"app_state":"active"`, `"app_state":null`, "app_state"},
		{"string focus flag", `"window_focused":null`, `"window_focused":"true"`, "window_focused"},
		{"missing focus flag", `"window_focused":null,`, ``, "window_focused"},
		{"zero window width", `"window_width":600`, `"window_width":0`, "window_width"},
		{"negative window height", `"window_height":900`, `"window_height":-900`, "window_height"},
		{"zero screen width", `"screen_width":1200`, `"screen_width":0`, "screen_width"},
		{"missing screen height", `"screen_height":900,`, ``, "screen_height"},
		{"null transitions", transitions, `null`, "transitions"},
		{"object transitions", transitions, `{}`, "transitions"},
		{"nine transitions", transitions, nineItems, "transitions"},
		{"unknown transition event", `"event":"background"`, `"event":"paint"`, "transitions[0].event"},
		{"negative transition time", `"at_ms":1761200600000`, `"at_ms":-1`, "transitions[0].at_ms"},
		{"missing transition time", `,"at_ms":1761200700000`, ``, "transitions[1].at_ms"},
		{"undeclared transition key", `"at_ms":1761200600000}`, `"at_ms":1761200600000,"x":1}`, "transitions[0].x"},
		{"string transition", `{"event":"background","at_ms":1761200600000}`, `"background"`, "transitions[0]"},
		{"undeclared top-level key", `"trigger":"app_active"`, `"trigger":"app_active","note":"x"`, "note"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := ScreenStallKind{}.Decode([]byte(screenStallWith(tc.from, tc.to)))
			var fieldErr *syncdiag.FieldError
			if !errors.As(err, &fieldErr) {
				t.Fatalf("Decode() error = %v, want a *syncdiag.FieldError naming %s", err, tc.field)
			}
			if fieldErr.Field != tc.field {
				t.Fatalf("rejection names %q, want %q (%v)", fieldErr.Field, tc.field, err)
			}
		})
	}
}

// TestScreenStallKindKeepsMalformedJSONUnnamed asserts a body that is not
// JSON at all is a plain decode error, not a FieldError naming a guessed key.
func TestScreenStallKindKeepsMalformedJSONUnnamed(t *testing.T) {
	t.Parallel()

	_, err := ScreenStallKind{}.Decode([]byte(`{"kind":"screen_stall",`))
	var fieldErr *syncdiag.FieldError
	if err == nil || errors.As(err, &fieldErr) {
		t.Fatalf("Decode() error = %v, want an unnamed decode error", err)
	}
}

// TestDefaultRegistryServesScreenStall pins that the kind is reachable on the
// wire with its own retention cap.
func TestDefaultRegistryServesScreenStall(t *testing.T) {
	t.Parallel()

	kind, ok := DefaultRegistry().Lookup(KindScreenStall)
	if !ok {
		t.Fatal("DefaultRegistry() does not serve screen_stall")
	}
	if kind.RetentionLimit() != 5000 {
		t.Fatalf("RetentionLimit() = %d, want 5000", kind.RetentionLimit())
	}
	var stored map[string]json.RawMessage
	validated, err := kind.Decode([]byte(screenStallBody))
	if err != nil || json.Unmarshal(validated.Payload, &stored) != nil || len(stored) != 9 {
		t.Fatalf("registry kind decoded %s (err %v), want the nine-key payload", validated.Payload, err)
	}
}
