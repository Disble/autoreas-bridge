package syncdiag

import (
	"encoding/json"
	"testing"
)

// TestRecordMarshalsTheStoredPayloadContract pins the one JSON shape a stored
// payload may take. The tags are a contract with that payload's consumers,
// not an implementation detail, and each one encodes a distinction that a
// cheaper shape would lose: device_id, reported_at_ms and degraded are absent
// because the envelope's own columns own those facts and a second copy could
// only contradict them; previous_cycle is explicit null rather than absent
// because the record's nil means the wire's explicit null, not a missing key;
// and an empty recent_events is [] rather than null because the array is a
// list the client always sends. The expected bytes are a literal, so a tag
// that is dropped, renamed or made omitempty fails here.
func TestRecordMarshalsTheStoredPayloadContract(t *testing.T) {
	t.Parallel()

	payload, err := json.Marshal(Record{
		CycleID:       "cycle-1",
		TriggerSource: "foreground_service",
		AppState:      "background",
		RecentEvents:  []RecentEvent{},
	})
	if err != nil {
		t.Fatalf("marshal record: %v", err)
	}

	const want = `{"cycle_id":"cycle-1","trigger_source":"foreground_service","app_state":"background","consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0,"recent_events":[],"previous_cycle":null}`
	if string(payload) != want {
		t.Fatalf("expected the stored payload shape %s, got %s", want, payload)
	}
}

// TestRetryAfterSecsIsAPinnedWireValue pins the one wire-visible constant this
// package still declares. MaxBodyBytes and WriteBudget left with the store and
// the handler that consumed them, and the endpoint's own copies now live in
// internal/observability/telemetry; RetryAfterSecs stays because the thumbnail
// download path answers a saturated slot with it. The expected value is a
// literal, not the constant under test, so a mutated constant cannot silently
// drag its own assertion along with it.
func TestRetryAfterSecsIsAPinnedWireValue(t *testing.T) {
	t.Parallel()

	if RetryAfterSecs != 5 {
		t.Fatalf("expected RetryAfterSecs to be 5, got %d", RetryAfterSecs)
	}
}
