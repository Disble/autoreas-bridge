package syncdiag

import "testing"

// TestRetryAfterSecsAndMaxBodyBytesArePinnedWireValues pins the two
// constants this phase declares but does not yet consume: RetryAfterSecs
// backs the Retry-After header the Phase 3 handler sends on a shed
// response, and MaxBodyBytes bounds the request body it reads. Expected
// values are literals, not the constants under test, so a mutated constant
// cannot silently drag its own assertion along with it.
func TestRetryAfterSecsAndMaxBodyBytesArePinnedWireValues(t *testing.T) {
	t.Parallel()

	if RetryAfterSecs != 5 {
		t.Fatalf("expected RetryAfterSecs to be 5, got %d", RetryAfterSecs)
	}
	if MaxBodyBytes != 8192 {
		t.Fatalf("expected MaxBodyBytes to be 8192 (2x the mobile client's 4096-byte cap), got %d", MaxBodyBytes)
	}
}
