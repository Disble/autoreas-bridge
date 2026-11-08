package telemetry

import (
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/observability/syncdiag"
)

// runtimeTransitionBody is the canonical valid runtime_transition body, a
// literal because it IS the wire contract offered to mobile. Every rejection
// row perturbs it in exactly one place.
const runtimeTransitionBody = `{"kind":"runtime_transition","observation_id":"rt-0b6f3c1e","observed_at_ms":1794139020000,"process_name":"sync","subject":"service","transition":"died","reason":"low_memory","app_version":"2.7.1"}`

// runtimeTransitionWith swaps one literal fragment of the canonical body.
func runtimeTransitionWith(from, to string) string {
	if !strings.Contains(runtimeTransitionBody, from) {
		panic("runtimeTransitionWith: fragment not in canonical body: " + from)
	}
	return strings.Replace(runtimeTransitionBody, from, to, 1)
}

// TestRuntimeTransitionKindDecodesTheCanonicalBody pins the envelope values
// and the stored five-key payload: observed_at_ms is the report's observed
// time, and no envelope key is copied into the payload.
func TestRuntimeTransitionKindDecodesTheCanonicalBody(t *testing.T) {
	t.Parallel()

	validated, err := RuntimeTransitionKind{}.Decode([]byte(runtimeTransitionBody))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if validated.EventID != "rt-0b6f3c1e" {
		t.Fatalf("EventID = %q", validated.EventID)
	}
	if validated.ObservedAtMS == nil || *validated.ObservedAtMS != 1794139020000 {
		t.Fatalf("ObservedAtMS = %v", validated.ObservedAtMS)
	}
	if validated.Degraded != nil {
		t.Fatalf("Degraded = %v, want nil", *validated.Degraded)
	}
	want := `{"process_name":"sync","subject":"service","transition":"died","reason":"low_memory","app_version":"2.7.1"}`
	if string(validated.Payload) != want {
		t.Fatalf("Payload = %s\nwant      %s", validated.Payload, want)
	}
}

// TestRuntimeTransitionKindAcceptsEveryBoundaryAndMember accepts the main
// process for a non-death change, an absent or null reason (stored as null),
// the regex's bounds and an epoch time.
func TestRuntimeTransitionKindAcceptsEveryBoundaryAndMember(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name, from, to, stored string
	}{
		{"main process started", `"process_name":"sync","subject":"service","transition":"died"`, `"process_name":"main","subject":"process","transition":"started"`, `"process_name":"main","subject":"process","transition":"started"`},
		{"tick alarm subject", `"subject":"service"`, `"subject":"tick_alarm"`, `"subject":"tick_alarm"`},
		{"floor subject", `"subject":"service"`, `"subject":"floor"`, `"subject":"floor"`},
		{"boot subject", `"subject":"service"`, `"subject":"boot"`, `"subject":"boot"`},
		{"network subject", `"subject":"service"`, `"subject":"network"`, `"subject":"network"`},
		{"started", `"transition":"died"`, `"transition":"started"`, `"transition":"started"`},
		{"stopped", `"transition":"died"`, `"transition":"stopped"`, `"transition":"stopped"`},
		{"armed", `"transition":"died"`, `"transition":"armed"`, `"transition":"armed"`},
		{"cancelled", `"transition":"died"`, `"transition":"cancelled"`, `"transition":"cancelled"`},
		{"skipped", `"transition":"died"`, `"transition":"skipped"`, `"transition":"skipped"`},
		{"refused", `"transition":"died"`, `"transition":"refused"`, `"transition":"refused"`},
		{"absent reason", `"reason":"low_memory",`, ``, `"reason":null`},
		{"null reason", `"reason":"low_memory"`, `"reason":null`, `"reason":null`},
		{"forty-char reason", `"reason":"low_memory"`, `"reason":"` + strings.Repeat("z", 40) + `"`, strings.Repeat("z", 40)},
		{"digit reason", `"reason":"low_memory"`, `"reason":"0"`, `"reason":"0"`},
		{"prerelease version", `"app_version":"2.7.1"`, `"app_version":"2.8.0-rc.1+build_7"`, `"app_version":"2.8.0-rc.1+build_7"`},
		{"thirty-two char version", `"app_version":"2.7.1"`, `"app_version":"` + strings.Repeat("9", 32) + `"`, strings.Repeat("9", 32)},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			validated, err := RuntimeTransitionKind{}.Decode([]byte(runtimeTransitionWith(tc.from, tc.to)))
			if err != nil {
				t.Fatalf("Decode() error = %v", err)
			}
			if !strings.Contains(string(validated.Payload), tc.stored) {
				t.Fatalf("Payload %s does not store %s", validated.Payload, tc.stored)
			}
		})
	}
}

// TestRuntimeTransitionKindAcceptsAnEpochObservedAt accepts the inclusive
// lower bound of observed_at_ms, which lives in the envelope.
func TestRuntimeTransitionKindAcceptsAnEpochObservedAt(t *testing.T) {
	t.Parallel()

	validated, err := RuntimeTransitionKind{}.Decode([]byte(runtimeTransitionWith(`"observed_at_ms":1794139020000`, `"observed_at_ms":0`)))
	if err != nil || validated.ObservedAtMS == nil || *validated.ObservedAtMS != 0 {
		t.Fatalf("Decode() = %v, %v; want observed_at_ms 0", validated.ObservedAtMS, err)
	}
}

// TestRuntimeTransitionKindRejectsAndNamesTheField refuses every
// out-of-contract value with a *syncdiag.FieldError naming the field.
func TestRuntimeTransitionKindRejectsAndNamesTheField(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name, from, to, field string
	}{
		{"empty observation id", `"observation_id":"rt-0b6f3c1e"`, `"observation_id":""`, "observation_id"},
		{"missing observation id", `"observation_id":"rt-0b6f3c1e",`, ``, "observation_id"},
		{"missing observed at", `"observed_at_ms":1794139020000,`, ``, "observed_at_ms"},
		{"negative observed at", `"observed_at_ms":1794139020000`, `"observed_at_ms":-1`, "observed_at_ms"},
		{"unknown process", `"process_name":"sync"`, `"process_name":"ui"`, "process_name"},
		{"missing process", `"process_name":"sync",`, ``, "process_name"},
		{"missing subject", `"subject":"service",`, ``, "subject"},
		{"empty subject", `"subject":"service"`, `"subject":""`, "subject"},
		{"unknown subject", `"subject":"service"`, `"subject":"sync_service"`, "subject"},
		{"transition word as subject", `"subject":"service"`, `"subject":"started"`, "subject"},
		{"missing transition", `"transition":"died",`, ``, "transition"},
		{"ran is not a transition", `"transition":"died"`, `"transition":"ran"`, "transition"},
		{"subject word as transition", `"transition":"died"`, `"transition":"service"`, "transition"},
		{"null transition", `"transition":"died"`, `"transition":null`, "transition"},
		{"main death per event", `"process_name":"sync"`, `"process_name":"main"`, "transition"},
		{"empty reason", `"reason":"low_memory"`, `"reason":""`, "reason"},
		{"spaced reason", `"reason":"low_memory"`, `"reason":"low memory"`, "reason"},
		{"forty-one char reason", `"reason":"low_memory"`, `"reason":"` + strings.Repeat("z", 41) + `"`, "reason"},
		{"numeric reason", `"reason":"low_memory"`, `"reason":7`, "reason"},
		{"missing app version", `,"app_version":"2.7.1"`, ``, "app_version"},
		{"empty app version", `"app_version":"2.7.1"`, `"app_version":""`, "app_version"},
		{"spaced app version", `"app_version":"2.7.1"`, `"app_version":"2.7 beta"`, "app_version"},
		{"thirty-three char version", `"app_version":"2.7.1"`, `"app_version":"` + strings.Repeat("9", 33) + `"`, "app_version"},
		{"undeclared key", `"app_version":"2.7.1"`, `"app_version":"2.7.1","device_id":"spoofed"`, "device_id"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := RuntimeTransitionKind{}.Decode([]byte(runtimeTransitionWith(tc.from, tc.to)))
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

// TestRuntimeTransitionKindKeepsMalformedJSONUnnamed asserts a body that is
// not JSON is a plain decode error, not a FieldError naming a guessed key.
func TestRuntimeTransitionKindKeepsMalformedJSONUnnamed(t *testing.T) {
	t.Parallel()

	_, err := RuntimeTransitionKind{}.Decode([]byte(`{"kind":"runtime_transition",`))
	var fieldErr *syncdiag.FieldError
	if err == nil || errors.As(err, &fieldErr) {
		t.Fatalf("Decode() error = %v, want an unnamed decode error", err)
	}
}

// TestDefaultRegistryServesTheMobileReportKinds pins that both kinds are
// reachable on the wire with the row caps sized from the agreed volume:
// 24 hourly summaries a day and the remaining 26 of the 50 a day for
// transitions, each kept 90 days.
func TestDefaultRegistryServesTheMobileReportKinds(t *testing.T) {
	t.Parallel()

	for name, limit := range map[KindName]int{KindHourlySummary: 2160, KindRuntimeTransition: 2340} {
		kind, ok := DefaultRegistry().Lookup(name)
		if !ok {
			t.Fatalf("DefaultRegistry() does not serve %s", name)
		}
		if kind.Name() != name || kind.RetentionLimit() != limit {
			t.Fatalf("%s: Name() = %q, RetentionLimit() = %d; want %d", name, kind.Name(), kind.RetentionLimit(), limit)
		}
	}
}
