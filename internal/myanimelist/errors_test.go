package myanimelist

import (
	"errors"
	"fmt"
	"testing"
)

// TestDriftErrorMessageNamesTheAnchor pins the exact message DriftError
// produces, so a caller reading Error() (e.g. the Wails binding's Message
// field, design D4) sees the anchor by name.
func TestDriftErrorMessageNamesTheAnchor(t *testing.T) {
	t.Parallel()

	err := &DriftError{Anchor: "Type:", URL: "https://myanimelist.net/anime/41467"}

	const want = `myanimelist: markup drift at anchor "Type:" (https://myanimelist.net/anime/41467)`
	if got := err.Error(); got != want {
		t.Fatalf("Error() = %q, want %q", got, want)
	}
}

// TestErrorsAsUnwrapsAWrappedDriftError proves *DriftError stays
// discoverable through errors.As after being wrapped by a caller (e.g.
// detail.go returning fmt.Errorf("...: %w", driftErr)).
func TestErrorsAsUnwrapsAWrappedDriftError(t *testing.T) {
	t.Parallel()

	original := &DriftError{Anchor: "Status:", URL: "https://myanimelist.net/anime/1"}
	wrapped := fmt.Errorf("detail fetch failed: %w", original)

	var driftErr *DriftError
	if !errors.As(wrapped, &driftErr) {
		t.Fatal("expected errors.As to unwrap a wrapped *DriftError")
	}
	if driftErr.Anchor != "Status:" {
		t.Fatalf("expected anchor %q, got %q", "Status:", driftErr.Anchor)
	}
}
