package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

// Transport-level telemetry (duration_ms, response headers/body, http_status)
// now belongs entirely to internal/api's CaptureMiddleware -- see
// TestCaptureMiddlewareCapturesResponseBodyOnNon2xx in
// internal/api/capture_middleware_test.go. NewSyncHandler no longer takes a
// Capture dependency at all: it only contributes semantic facts to
// requestcapture.Enrich(r.Context()), so there is nothing left for a
// capture-write-failure test to exercise at this layer.

// syncHandlerStubs provides test dependencies for the sync handler.
type syncHandlerStubs struct {
	triggerCalls int
}

// authenticate returns a test authentication function with the requested result.
func (s *syncHandlerStubs) authenticate(authorized bool) AuthenticateFunc {
	return func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
		if !authorized {
			writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
			return device.PairedDevice{}, false
		}

		return device.PairedDevice{DeviceID: "device-1"}, true
	}
}

// patchAnime returns a successful applied result for sync handler tests.
func (s *syncHandlerStubs) patchAnime(_ context.Context, id string, patch AnimePatch) (contracts.AnimePatchResult, error) {
	return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}, nil
}

// decodeAppliedOperationEntries decodes a reconcile response body's
// applied_operations array into raw JSON maps so key presence/absence can be
// asserted directly -- decoding back into ReconcileResponse round-trips
// through the same struct tags that produced the bug this guards against
// (dropping omitempty silently turns an absent key into a present null).
func decodeAppliedOperationEntries(t *testing.T, body []byte) []map[string]json.RawMessage {
	t.Helper()
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("decode response envelope: %v", err)
	}
	var entries []map[string]json.RawMessage
	if err := json.Unmarshal(envelope["applied_operations"], &entries); err != nil {
		t.Fatalf("decode applied_operations: %v", err)
	}
	return entries
}

// assertAppliedEntry asserts the applied/reason/modified_at wire shape of one
// decoded applied_operations entry. A nil wantModifiedAt asserts the key is
// absent; an empty wantReason asserts the reason key is absent.
func assertAppliedEntry(t *testing.T, entry map[string]json.RawMessage, wantApplied bool, wantReason string, wantModifiedAt *int64) {
	t.Helper()
	assertEntryApplied(t, entry, wantApplied)
	assertEntryReason(t, entry, wantReason)
	assertEntryModifiedAt(t, entry, wantModifiedAt)
}

// assertEntryApplied asserts the entry's `applied` flag, which is always present.
func assertEntryApplied(t *testing.T, entry map[string]json.RawMessage, want bool) {
	t.Helper()
	raw, ok := entry["applied"]
	if !ok {
		t.Fatal("expected applied key present")
	}
	var applied bool
	if err := json.Unmarshal(raw, &applied); err != nil || applied != want {
		t.Fatalf("expected applied=%v, got %s (err=%v)", want, raw, err)
	}
}

// assertEntryReason asserts the `reason` key. An empty want asserts the key is
// absent from the serialized entry -- checked on the decoded map rather than a
// struct, because a struct round-trip cannot distinguish an absent key from a
// present-but-empty one.
func assertEntryReason(t *testing.T, entry map[string]json.RawMessage, want string) {
	t.Helper()
	raw, ok := entry["reason"]
	if want == "" {
		if ok {
			t.Fatalf("expected reason key absent, got %s", raw)
		}
		return
	}
	if !ok {
		t.Fatal("expected reason key present")
	}
	var reason string
	if err := json.Unmarshal(raw, &reason); err != nil || reason != want {
		t.Fatalf("expected reason=%q, got %s (err=%v)", want, raw, err)
	}
}

// assertEntryModifiedAt asserts the `modified_at` key. A nil want asserts the
// key is absent; a non-nil want asserts it is present AND equal, including when
// the value is 0 -- a legitimate token, never a sentinel for "no token".
func assertEntryModifiedAt(t *testing.T, entry map[string]json.RawMessage, want *int64) {
	t.Helper()
	raw, ok := entry["modified_at"]
	if want == nil {
		if ok {
			t.Fatalf("expected modified_at key absent, got %s", raw)
		}
		return
	}
	if !ok {
		t.Fatal("expected modified_at key present")
	}
	var modifiedAt int64
	if err := json.Unmarshal(raw, &modifiedAt); err != nil || modifiedAt != *want {
		t.Fatalf("expected modified_at=%d, got %s (err=%v)", *want, raw, err)
	}
}

// int64Ptr returns a pointer to v, for building assertAppliedEntry expectations.
func int64Ptr(v int64) *int64 { return &v }
