package telemetry

import (
	"encoding/json"
	"errors"
	"reflect"
	"sort"
	"strings"
	"testing"

	"autoreas-bridge/internal/observability/syncdiag"
)

// Canonical valid episode_action bodies, one per phase plus the failed
// finished combination, written as literals rather than built with a helper:
// they ARE the frozen wire contract, so a reader can check the key names
// against it directly. Every rejection case below perturbs one of them in
// exactly one place, which is what makes the named field attributable.
const (
	episodeActionReceivedBody = `{"kind":"episode_action","observation_id":"obs-received","action":"episode_plus_one","phase":"received","observed_at_ms":1710000000000,"correlation_id":"corr-received","duration_ms":null}`
	episodeActionSkippedBody  = `{"kind":"episode_action","observation_id":"obs-skipped","action":"episode_minus_half","phase":"skipped","observed_at_ms":1710000000001,"correlation_id":"corr-skipped","reason":"in_flight","duration_ms":null}`
	episodeActionFinishedBody = `{"kind":"episode_action","observation_id":"obs-finished","action":"episode_plus_one","phase":"finished","observed_at_ms":1710000000002,"correlation_id":"corr-finished","outcome":"committed","duration_ms":137}`
	episodeActionFailedBody   = `{"kind":"episode_action","observation_id":"obs-failed","action":"episode_plus_half","phase":"finished","observed_at_ms":1710000000003,"correlation_id":"corr-failed","outcome":"failed","cause":"disk_full","duration_ms":900}`
	episodeActionSyncBody     = `{"kind":"episode_action","observation_id":"obs-sync","action":"episode_minus_one","phase":"sync","observed_at_ms":1710000000004,"correlation_id":"corr-sync","outcome":"ok","duration_ms":null}`
)

// episodeActionWith swaps one literal member value in a canonical body, so a
// rejection case differs from a known-valid body in exactly one place.
func episodeActionWith(body, from, to string) string {
	return strings.Replace(body, from, to, 1)
}

// decodeEpisodeActionBody decodes one body and fails the test on any error.
func decodeEpisodeActionBody(t *testing.T, body string) Validated {
	t.Helper()

	validated, err := EpisodeActionKind{}.Decode([]byte(body))
	if err != nil {
		t.Fatalf("expected %s to decode, got error: %v", body, err)
	}
	return validated
}

// assertEpisodeActionNamesField asserts a body is rejected by a
// *syncdiag.FieldError naming one field. That type is the endpoint's
// which-field 400 shape, so a rejection that names nothing would reach mobile
// as an undiagnosable generic error.
func assertEpisodeActionNamesField(t *testing.T, body string, field string) {
	t.Helper()

	_, err := EpisodeActionKind{}.Decode([]byte(body))
	if err == nil {
		t.Fatalf("expected %s to be rejected, got no error", body)
	}
	var fieldErr *syncdiag.FieldError
	if !errors.As(err, &fieldErr) {
		t.Fatalf("expected a *syncdiag.FieldError naming %s, got %T: %v", field, err, err)
	}
	if fieldErr.Field != field {
		t.Fatalf("expected the rejection to name %s, got %s (%v)", field, fieldErr.Field, err)
	}
}

// assertEpisodeActionPayloadShape asserts the stored payload is the fixed
// seven-key shape: a stable key set rather than a sparse one, so a later
// reader can query payload_json without first establishing which keys a phase
// happens to carry. It also pins the three keys the envelope columns own --
// kind, observation_id and observed_at_ms are never repeated inside the
// payload, where a copy could only contradict the column that owns it.
func assertEpisodeActionPayloadShape(t *testing.T, payload []byte) {
	t.Helper()

	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("stored payload %s is not a JSON object: %v", payload, err)
	}

	keys := make([]string, 0, len(decoded))
	for key := range decoded {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	want := []string{"action", "cause", "correlation_id", "duration_ms", "outcome", "phase", "reason"}
	if !reflect.DeepEqual(keys, want) {
		t.Fatalf("stored payload keys = %v, want exactly %v (payload %s)", keys, want, payload)
	}
	for _, envelopeOwned := range []string{"kind", "observation_id", "observed_at_ms"} {
		if _, repeated := decoded[envelopeOwned]; repeated {
			t.Fatalf("stored payload repeats %s, which the envelope columns own: %s", envelopeOwned, payload)
		}
	}
}

// TestEpisodeActionKindDecodesEveryPhase asserts each of the four phases has a
// valid body, and that the envelope takes the wire observation_id as the
// kind-scoped idempotency key and observed_at_ms as the client event time. No
// phase carries a fidelity signal, so degraded must stay nil rather than
// becoming an empty string.
func TestEpisodeActionKindDecodesEveryPhase(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		body         string
		eventID      string
		observedAtMS int64
	}{
		{"received", episodeActionReceivedBody, "obs-received", 1710000000000},
		// Zero is a legal observed_at_ms: the rule is non-negative, and the
		// epoch is the one non-negative value a truthiness check would reject.
		{"received at the epoch", episodeActionWith(episodeActionReceivedBody, `"observed_at_ms":1710000000000`, `"observed_at_ms":0`), "obs-received", 0},
		{"skipped", episodeActionSkippedBody, "obs-skipped", 1710000000001},
		{"finished", episodeActionFinishedBody, "obs-finished", 1710000000002},
		{"finished failed", episodeActionFailedBody, "obs-failed", 1710000000003},
		{"sync", episodeActionSyncBody, "obs-sync", 1710000000004},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			validated := decodeEpisodeActionBody(t, tc.body)

			if validated.EventID != tc.eventID {
				t.Fatalf("event id = %q, want the wire observation_id %q", validated.EventID, tc.eventID)
			}
			if validated.ObservedAtMS == nil {
				t.Fatal("observed_at_ms must reach the envelope, got nil")
			}
			if *validated.ObservedAtMS != tc.observedAtMS {
				t.Fatalf("observed_at_ms = %d, want the wire value %d", *validated.ObservedAtMS, tc.observedAtMS)
			}
			if validated.Degraded != nil {
				t.Fatalf("this kind declares no fidelity signal, but degraded = %q", *validated.Degraded)
			}
			assertEpisodeActionPayloadShape(t, validated.Payload)
		})
	}
}

// TestEpisodeActionKindRejectsOffListVocabularyMembers asserts every closed
// vocabulary refuses a member outside it and names its own field, so mobile
// can tell which of several enumerations rejected the body.
func TestEpisodeActionKindRejectsOffListVocabularyMembers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		body string
	}{
		{"action", episodeActionWith(episodeActionFinishedBody, `"action":"episode_plus_one"`, `"action":"episode_plus_two"`)},
		{"phase", episodeActionWith(episodeActionFinishedBody, `"phase":"finished"`, `"phase":"dropped"`)},
		{"outcome on finished", episodeActionWith(episodeActionFinishedBody, `"outcome":"committed"`, `"outcome":"abandoned"`)},
		{"outcome on sync", episodeActionWith(episodeActionSyncBody, `"outcome":"ok"`, `"outcome":"abandoned"`)},
		{"reason", episodeActionWith(episodeActionSkippedBody, `"reason":"in_flight"`, `"reason":"not_ready"`)},
		{"cause", episodeActionWith(episodeActionFailedBody, `"cause":"disk_full"`, `"cause":"solar_flare"`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertEpisodeActionNamesField(t, tc.body, strings.Fields(tc.name)[0])
		})
	}
}

// TestEpisodeActionKindOutcomeIsOneCrossFieldRule asserts outcome membership
// is evaluated against phase, not on its own: a finished payload carrying ok
// and a sync payload carrying committed are each a member of SOME episode
// action outcome set, so only a rule keyed by phase can refuse both. Two
// independent membership tests would accept them.
func TestEpisodeActionKindOutcomeIsOneCrossFieldRule(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		body string
	}{
		{"finished with the sync-only outcome", episodeActionWith(episodeActionFinishedBody, `"outcome":"committed"`, `"outcome":"ok"`)},
		{"sync with the finished-only outcome", episodeActionWith(episodeActionSyncBody, `"outcome":"ok"`, `"outcome":"committed"`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertEpisodeActionNamesField(t, tc.body, "outcome")
		})
	}
}

// TestEpisodeActionKindGatesOutcomeByPhasePresence asserts the other half of
// the same rule: outcome is required on the two phases that admit one and must
// be absent on the two that do not. An explicit null counts as present -- it
// is a value the client chose to send, not an omission.
func TestEpisodeActionKindGatesOutcomeByPhasePresence(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		body string
	}{
		{"outcome present on received", episodeActionWith(episodeActionReceivedBody, `"correlation_id":"corr-received",`, `"correlation_id":"corr-received","outcome":"committed",`)},
		{"null outcome on received", episodeActionWith(episodeActionReceivedBody, `"correlation_id":"corr-received",`, `"correlation_id":"corr-received","outcome":null,`)},
		{"outcome present on skipped", episodeActionWith(episodeActionSkippedBody, `"correlation_id":"corr-skipped",`, `"correlation_id":"corr-skipped","outcome":"committed",`)},
		{"outcome absent on finished", episodeActionWith(episodeActionFinishedBody, `"outcome":"committed",`, ``)},
		{"outcome absent on sync", episodeActionWith(episodeActionSyncBody, `"outcome":"ok",`, ``)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertEpisodeActionNamesField(t, tc.body, "outcome")
		})
	}
}

// TestEpisodeActionKindGatesReasonToSkipped asserts reason belongs to the
// skipped phase alone: it is required there and refused everywhere else,
// because a reason on a finished action would be a second, contradictable
// answer to the same question cause already answers.
func TestEpisodeActionKindGatesReasonToSkipped(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		body string
	}{
		{"reason absent on skipped", episodeActionWith(episodeActionSkippedBody, `"reason":"in_flight",`, ``)},
		{"null reason on skipped", episodeActionWith(episodeActionSkippedBody, `"reason":"in_flight"`, `"reason":null`)},
		{"reason on received", episodeActionWith(episodeActionReceivedBody, `"correlation_id":"corr-received",`, `"correlation_id":"corr-received","reason":"in_flight",`)},
		{"reason on finished", episodeActionWith(episodeActionFinishedBody, `"outcome":"committed",`, `"outcome":"committed","reason":"in_flight",`)},
		{"reason on sync", episodeActionWith(episodeActionSyncBody, `"outcome":"ok",`, `"outcome":"ok","reason":"in_flight",`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertEpisodeActionNamesField(t, tc.body, "reason")
		})
	}
}

// TestEpisodeActionKindGatesCauseToFinishedFailure asserts cause is admissible
// on exactly one combination: a finished phase whose outcome is failed. A
// cause on finished+committed would describe a failure that did not happen,
// and a missing cause on finished+failed would leave the only failure class
// the field exists to record unrecorded.
func TestEpisodeActionKindGatesCauseToFinishedFailure(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		body string
	}{
		{"cause absent on finished failure", episodeActionWith(episodeActionFailedBody, `"cause":"disk_full",`, ``)},
		{"null cause on finished failure", episodeActionWith(episodeActionFailedBody, `"cause":"disk_full"`, `"cause":null`)},
		{"cause on finished success", episodeActionWith(episodeActionFinishedBody, `"outcome":"committed",`, `"outcome":"committed","cause":"disk_full",`)},
		// A failure on the sync phase must not carry a cause either: cause is
		// admissible on ONE combination, and "this phase failed" is not it.
		{"cause on sync failure", episodeActionWith(episodeActionSyncBody, `"outcome":"ok",`, `"outcome":"failed","cause":"disk_full",`)},
		{"cause on received", episodeActionWith(episodeActionReceivedBody, `"correlation_id":"corr-received",`, `"correlation_id":"corr-received","cause":"disk_full",`)},
		{"cause on skipped", episodeActionWith(episodeActionSkippedBody, `"correlation_id":"corr-skipped",`, `"correlation_id":"corr-skipped","cause":"disk_full",`)},
		{"cause on sync", episodeActionWith(episodeActionSyncBody, `"outcome":"ok",`, `"outcome":"ok","cause":"disk_full",`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertEpisodeActionNamesField(t, tc.body, "cause")
		})
	}
}

// TestEpisodeActionKindGatesDurationNotNullOnFinishedOnly asserts the key is
// present on every payload and its nullability is the phase's: finished
// carries a measurement, and every other phase carries null rather than 0,
// because a duration of zero on a phase that has none is a value a reader
// cannot tell from a real instantaneous measurement.
func TestEpisodeActionKindGatesDurationNotNullOnFinishedOnly(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		body string
	}{
		{"null duration on finished", episodeActionWith(episodeActionFinishedBody, `"duration_ms":137`, `"duration_ms":null`)},
		{"duration on received", episodeActionWith(episodeActionReceivedBody, `"duration_ms":null`, `"duration_ms":0`)},
		{"duration on skipped", episodeActionWith(episodeActionSkippedBody, `"duration_ms":null`, `"duration_ms":0`)},
		{"duration on sync", episodeActionWith(episodeActionSyncBody, `"duration_ms":null`, `"duration_ms":0`)},
		{"duration absent on finished", episodeActionWith(episodeActionFinishedBody, `,"duration_ms":137`, ``)},
		{"duration absent on received", episodeActionWith(episodeActionReceivedBody, `,"duration_ms":null`, ``)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertEpisodeActionNamesField(t, tc.body, "duration_ms")
		})
	}
}

// TestEpisodeActionKindRejectsUndeclaredKeys asserts the body is
// strict-decoded, so a key this kind never declared -- including a
// body-supplied device_id, whose authority is the authenticated token -- is a
// decode failure rather than a silently ignored field. It must stay a decode
// failure and not a *syncdiag.FieldError: the endpoint renders the two as
// different 400 shapes, and only the generic one says "unreadable body"
// without pinning the blame on a field this kind does not accept anyway.
func TestEpisodeActionKindRejectsUndeclaredKeys(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		body string
	}{
		{"device_id", episodeActionWith(episodeActionFinishedBody, `"correlation_id":"corr-finished",`, `"correlation_id":"corr-finished","device_id":"spoofed",`)},
		{"cycle_id", episodeActionWith(episodeActionFinishedBody, `"correlation_id":"corr-finished",`, `"correlation_id":"corr-finished","cycle_id":"c1",`)},
		{"unknown trailing key", episodeActionWith(episodeActionFinishedBody, `"duration_ms":137}`, `"duration_ms":137,"extra":1}`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := EpisodeActionKind{}.Decode([]byte(tc.body))
			if err == nil {
				t.Fatalf("expected %s to be rejected as an undeclared key, got no error", tc.body)
			}
			var fieldErr *syncdiag.FieldError
			if errors.As(err, &fieldErr) {
				t.Fatalf("an undeclared key is a malformed body, not a field this kind validates, but the error named %s", fieldErr.Field)
			}
		})
	}
}

// TestEpisodeActionKindRejectsUnusableIdentityAndObservationTime asserts the
// three required values that carry no vocabulary: an observation_id and a
// correlation_id that are present but empty are not identifiers, and a
// negative epoch millisecond is not a time. A negative duration is left alone
// -- nothing in this contract forbids one.
func TestEpisodeActionKindRejectsUnusableIdentityAndObservationTime(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		body  string
		field string
	}{
		{"negative observed_at_ms", episodeActionWith(episodeActionFinishedBody, `"observed_at_ms":1710000000002`, `"observed_at_ms":-1`), "observed_at_ms"},
		{"null observed_at_ms", episodeActionWith(episodeActionFinishedBody, `"observed_at_ms":1710000000002`, `"observed_at_ms":null`), "observed_at_ms"},
		{"absent observed_at_ms", episodeActionWith(episodeActionFinishedBody, `"observed_at_ms":1710000000002,`, ``), "observed_at_ms"},
		{"non-integer observed_at_ms", episodeActionWith(episodeActionFinishedBody, `"observed_at_ms":1710000000002`, `"observed_at_ms":"1710000000002"`), "observed_at_ms"},
		{"empty observation_id", episodeActionWith(episodeActionFinishedBody, `"observation_id":"obs-finished"`, `"observation_id":""`), "observation_id"},
		{"absent observation_id", episodeActionWith(episodeActionFinishedBody, `"observation_id":"obs-finished",`, ``), "observation_id"},
		{"empty correlation_id", episodeActionWith(episodeActionFinishedBody, `"correlation_id":"corr-finished"`, `"correlation_id":""`), "correlation_id"},
		{"absent correlation_id", episodeActionWith(episodeActionFinishedBody, `"correlation_id":"corr-finished",`, ``), "correlation_id"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertEpisodeActionNamesField(t, tc.body, tc.field)
		})
	}
}

// TestWireStringRefusesPresentNull pins the anti-coercion guard the three
// vocabulary-backed optional members share. json.Unmarshal leaves a string
// destination untouched and reports no error for a JSON null, so without this
// guard a null would decode to the empty string and be refused by the
// vocabulary check instead -- an off-list member complaint about a value the
// client never sent, and one that would read as a misspelling rather than as a
// null. The refusal is asserted here at the helper boundary because every
// caller then rejects the empty string anyway, which makes the guard's effect
// invisible through the exported Decode alone.
func TestWireStringRefusesPresentNull(t *testing.T) {
	t.Parallel()

	_, err := wireString("reason", json.RawMessage("null"))
	if err == nil {
		t.Fatal("a present null must be refused, not coerced into the empty string")
	}
	var fieldErr *syncdiag.FieldError
	if !errors.As(err, &fieldErr) || fieldErr.Field != "reason" {
		t.Fatalf("expected a *syncdiag.FieldError naming reason, got %v", err)
	}

	value, err := wireString("reason", json.RawMessage(`"in_flight"`))
	if err != nil {
		t.Fatalf("a present string must decode, got error: %v", err)
	}
	if value != "in_flight" {
		t.Fatalf("value = %q, want the wire string", value)
	}
}

// TestEpisodeActionKindStoresTheFixedSevenKeyPayload pins the stored contract
// against a literal rather than a re-marshal of the values it came from: a
// payload compared against its own source proves only that encoding/json is
// deterministic and passes with every tag removed. This literal is what fails
// when a tag is renamed, dropped, or made omitempty.
func TestEpisodeActionKindStoresTheFixedSevenKeyPayload(t *testing.T) {
	t.Parallel()

	validated := decodeEpisodeActionBody(t, episodeActionFinishedBody)

	const want = `{"action":"episode_plus_one","phase":"finished","correlation_id":"corr-finished","outcome":"committed","reason":null,"cause":null,"duration_ms":137}`
	if string(validated.Payload) != want {
		t.Fatalf("stored payload = %s, want %s", validated.Payload, want)
	}
	assertEpisodeActionPayloadShape(t, validated.Payload)

	// The failed combination carries the two members the successful one must
	// leave null, so the fixed shape is proven to still be able to express a
	// value in every nullable slot.
	failed := decodeEpisodeActionBody(t, episodeActionFailedBody)
	const wantFailed = `{"action":"episode_plus_half","phase":"finished","correlation_id":"corr-failed","outcome":"failed","reason":null,"cause":"disk_full","duration_ms":900}`
	if string(failed.Payload) != wantFailed {
		t.Fatalf("stored payload = %s, want %s", failed.Payload, wantFailed)
	}
}

// TestDefaultRegistryContainsEpisodeAction asserts the single declaration
// point resolves the new kind, that each kind answers its own declared cap,
// and that the two caps are independently owned. Equality is asserted against
// the other kind rather than only against itself because a kind that borrowed
// its neighbour's cap would satisfy every self-comparison while removing the
// per-kind retention the registry exists to provide.
func TestDefaultRegistryContainsEpisodeAction(t *testing.T) {
	t.Parallel()

	registry := DefaultRegistry()
	episodeAction, ok := registry.Lookup(KindEpisodeAction)
	if !ok {
		t.Fatalf("expected the default vocabulary to declare %s", KindEpisodeAction)
	}
	if got := episodeAction.Name(); got != KindEpisodeAction {
		t.Fatalf("expected the %s kind, got %q", KindEpisodeAction, got)
	}
	if got, want := episodeAction.RetentionLimit(), (EpisodeActionKind{}).RetentionLimit(); got != want {
		t.Fatalf("expected the declared retention limit %d, got %d", want, got)
	}
	if got := episodeAction.RetentionLimit(); got <= 0 {
		t.Fatalf("retention limit = %d, want a positive cap: a zero cap prunes every row of this kind", got)
	}

	cycleReport, ok := registry.Lookup(KindCycleReport)
	if !ok {
		t.Fatalf("expected %s to stay registered", KindCycleReport)
	}
	if episodeAction.RetentionLimit() == cycleReport.RetentionLimit() {
		t.Fatalf("both kinds declared the same cap %d: retention is per kind so a high-frequency kind cannot evict a low-frequency one, and one shared number cannot express that", episodeAction.RetentionLimit())
	}
}
