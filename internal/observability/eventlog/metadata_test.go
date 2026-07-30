package eventlog

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestMetadataNilMapBindsNull asserts a nil/empty metadata map binds NULL
// rather than "{}" or "null".
func TestMetadataNilMapBindsNull(t *testing.T) {
	t.Parallel()

	got := boundMetadataJSON(nil)
	if got != nil {
		t.Fatalf("expected nil metadata to bind NULL, got %v", *got)
	}

	got = boundMetadataJSON(map[string]any{})
	if got != nil {
		t.Fatalf("expected empty metadata to bind NULL, got %v", *got)
	}
}

// TestMetadataRedactsSensitiveKeys asserts every sensitive key (case
// insensitive) is redacted before marshaling.
func TestMetadataRedactsSensitiveKeys(t *testing.T) {
	t.Parallel()

	for _, key := range []string{"authorization", "Authorization", "TOKEN", "cookie", "Password", "secret", "api_key", "Bearer"} {
		metadata := map[string]any{key: "sensitive-value", "safe": "kept"}
		got := boundMetadataJSON(metadata)
		if got == nil {
			t.Fatalf("expected non-nil bound metadata for key %q", key)
		}
		if strings.Contains(*got, "sensitive-value") {
			t.Fatalf("expected key %q to be redacted, got %q", key, *got)
		}
		if !strings.Contains(*got, "kept") {
			t.Fatalf("expected non-sensitive key to survive, got %q", *got)
		}
	}
}

// TestMetadataOverBudgetStoresMarkerNotTruncatedJSON asserts metadata past
// the 4KB bound stores a marker object instead of truncated JSON (which
// would be unparseable and surface as malformed on every read).
func TestMetadataOverBudgetStoresMarkerNotTruncatedJSON(t *testing.T) {
	t.Parallel()

	big := map[string]any{"blob": strings.Repeat("x", maxMetadataBytes+1)}
	got := boundMetadataJSON(big)
	if got == nil {
		t.Fatal("expected a marker object, got nil")
	}
	if len(*got) >= maxMetadataBytes {
		t.Fatalf("expected the marker object itself to stay small, got %d bytes", len(*got))
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(*got), &decoded); err != nil {
		t.Fatalf("expected marker object to be valid JSON, got error: %v", err)
	}
}

// TestMetadataMarshalFailureBindsNullNotError asserts an unmarshalable value
// (e.g. a channel) degrades to NULL rather than propagating a marshal error.
func TestMetadataMarshalFailureBindsNullNotError(t *testing.T) {
	t.Parallel()

	unmarshalable := map[string]any{"bad": make(chan int)}
	got := boundMetadataJSON(unmarshalable)
	if got != nil {
		t.Fatalf("expected marshal failure to bind NULL, got %v", *got)
	}
}

// TestMetadataNeverStoresRawHeaders asserts common raw-header-shaped keys are
// redacted, mirroring the Runtime Events tab's existing display surface (no
// new capture surface).
func TestMetadataNeverStoresRawHeaders(t *testing.T) {
	t.Parallel()

	metadata := map[string]any{"authorization": "Bearer abc123", "request_headers": map[string]any{"Authorization": "Bearer abc123"}}
	got := boundMetadataJSON(metadata)
	if got == nil {
		t.Fatal("expected non-nil bound metadata")
	}
	if strings.Contains(*got, "abc123") {
		t.Fatalf("expected no raw token material to survive, got %q", *got)
	}
}
