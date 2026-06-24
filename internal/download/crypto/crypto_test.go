package crypto

import (
	"bytes"
	"runtime"
	"testing"
)

// TestProtectUnprotectRoundTripsOnWindows asserts the real DPAPI-backed seam round-trips
// plaintext correctly and that the ciphertext never contains the plaintext bytes
// (download-config spec "JD Credentials Stored Encrypted At Rest"; design §7/§12).
// Windows-gated per "DPAPI Security Invariants Are Windows-Gated" — this scenario MUST
// run only against the real implementation, never the non-Windows fake.
func TestProtectUnprotectRoundTripsOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("DPAPI round-trip security assertion is Windows-gated; skipping on " + runtime.GOOS)
	}
	t.Parallel()

	plaintext := []byte("super-secret-myjd-password")

	ciphertext, err := Protect(plaintext)
	if err != nil {
		t.Fatalf("Protect: %v", err)
	}

	if bytes.Contains(ciphertext, plaintext) {
		t.Fatal("expected ciphertext to never contain the plaintext bytes")
	}

	got, err := Unprotect(ciphertext)
	if err != nil {
		t.Fatalf("Unprotect: %v", err)
	}

	if !bytes.Equal(got, plaintext) {
		t.Fatalf("expected round-tripped plaintext %q, got %q", plaintext, got)
	}
}

// TestUnprotectNeverReturnsPlaintextOnFailure asserts that when decryption fails, the
// returned plaintext value is empty -- the failure path MUST NOT leak or fabricate
// plaintext under any code path (design §7 C4 sink; download-config spec "Decryption
// failure is observable, not fatal"). Windows-gated for the same reason as the round-trip.
func TestUnprotectNeverReturnsPlaintextOnFailure(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("DPAPI failure-path security assertion is Windows-gated; skipping on " + runtime.GOOS)
	}
	t.Parallel()

	corrupted := []byte("not-a-valid-dpapi-blob")

	got, err := Unprotect(corrupted)
	if err == nil {
		t.Fatal("expected Unprotect to return an error for a corrupted/invalid blob")
	}
	if len(got) != 0 {
		t.Fatalf("expected empty plaintext on decrypt failure, got %q", got)
	}
}

// TestNonWindowsFakeIsLabeledInsecureAndNeverSatisfiesSecurityScenarios documents and
// enforces that the non-Windows fake is clearly non-secure: it MUST NOT be mistaken for
// DPAPI (download-config spec "Non-Windows fake never counts as secure storage"). This
// test runs everywhere EXCEPT Windows, and only inspects the labeled constant -- it never
// asserts the fake satisfies any encrypted-at-rest invariant.
func TestNonWindowsFakeIsLabeledInsecureAndNeverSatisfiesSecurityScenarios(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("non-Windows fake label assertion does not apply on windows")
	}
	t.Parallel()

	if !Insecure {
		t.Fatal("expected the non-Windows crypto implementation to declare itself Insecure=true")
	}
}
