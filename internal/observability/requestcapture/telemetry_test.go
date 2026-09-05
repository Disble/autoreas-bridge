package requestcapture

import (
	"net/http"
	"strings"
	"testing"
)

func TestSanitizeHeadersRedactsCredentialValuesButKeepsTheHeaderVisible(t *testing.T) {
	t.Parallel()

	header := http.Header{}
	header.Set("Authorization", "Bearer secret-token")
	header.Set("Cookie", "session=abc123")
	header.Set("Set-Cookie", "session=abc123")
	header.Set("Proxy-Authorization", "Basic xyz")
	header.Set("Content-Type", "application/json")
	header.Add("X-Multi", "first")
	header.Add("X-Multi", "second")

	sanitized := SanitizeHeaders(header)
	for key, want := range map[string]string{
		"Authorization":       "[redacted]",
		"Cookie":              "[redacted]",
		"Set-Cookie":          "[redacted]",
		"Proxy-Authorization": "[redacted]",
		"Content-Type":        "application/json",
		"X-Multi":             "first, second",
	} {
		if sanitized[key] != want {
			t.Fatalf("expected %q=%q, got %#v", key, want, sanitized)
		}
	}
	if len(sanitized) != 6 {
		t.Fatalf("expected every header key to stay present, got %#v", sanitized)
	}
}

// TestSanitizeHeadersNeverLeaksACredentialSubstring pins the property the
// redaction exists for: no fragment of the original secret survives anywhere in
// the persisted map. Asserting the placeholder alone would still pass if a
// future change kept, say, a token prefix "for correlation".
func TestSanitizeHeadersNeverLeaksACredentialSubstring(t *testing.T) {
	t.Parallel()

	header := http.Header{}
	header.Set("Authorization", "Bearer d7a69a6da98195f5dc0dad872d440662")
	header.Set("Cookie", "session=zzz-private-value")

	for key, value := range SanitizeHeaders(header) {
		for _, secret := range []string{"d7a69a6da98195f5dc0dad872d440662", "zzz-private-value", "Bearer "} {
			if strings.Contains(value, secret) {
				t.Fatalf("header %q leaked %q: %q", key, secret, value)
			}
		}
	}
}

// TestSanitizeHeadersKeepsUnknownCustomHeadersVerbatim pins the property the
// mobile client's trace correlation depends on: a header nobody enumerated in
// advance still reaches the capture row intact. A credential allowlist would
// silently drop these, which is why redaction is value-scoped, not key-scoped.
func TestSanitizeHeadersKeepsUnknownCustomHeadersVerbatim(t *testing.T) {
	t.Parallel()

	header := http.Header{}
	header.Set("X-Sync-Cycle-Id", "01JD8Z2K7QW3")
	header.Set("X-Sync-Generation", "7")

	sanitized := SanitizeHeaders(header)
	if sanitized["X-Sync-Cycle-Id"] != "01JD8Z2K7QW3" {
		t.Fatalf("expected the cycle id verbatim, got %#v", sanitized)
	}
	if sanitized["X-Sync-Generation"] != "7" {
		t.Fatalf("expected the generation verbatim, got %#v", sanitized)
	}
}

func TestSanitizeHeadersKeepsSingleValuesVerbatim(t *testing.T) {
	t.Parallel()

	header := http.Header{}
	header.Set("X-Sync-Version", "3")
	header.Set("X-App-Version", "1.2.3")
	header.Set("X-Client-Version", "beta")
	header.Set("X-Api-Version", "v1")
	header.Set("Accept", "application/json")
	header.Set("Content-Length", "42")

	sanitized := SanitizeHeaders(header)
	for key, want := range map[string]string{
		"X-Sync-Version":   "3",
		"X-App-Version":    "1.2.3",
		"X-Client-Version": "beta",
		"X-Api-Version":    "v1",
		"Accept":           "application/json",
		"Content-Length":   "42",
	} {
		if sanitized[key] != want {
			t.Fatalf("expected %q=%q, got %#v", key, want, sanitized)
		}
	}
}

func TestSanitizeResponseBodyPreservesSuccessfulJSONExactly(t *testing.T) {
	t.Parallel()

	raw := []byte(`{"ok":true,"items":[1,2,3]}`)
	sanitized := SanitizeResponseBody(raw)
	if sanitized == nil {
		t.Fatal("expected captured body, got nil")
	}
	if *sanitized != string(raw) {
		t.Fatalf("expected exact response body %q, got %q", string(raw), *sanitized)
	}
}

func TestSanitizeResponseBodyPreservesErrorJSONExactly(t *testing.T) {
	t.Parallel()

	raw := []byte(`{"error":"anime not found","status":404,"message":"not found","secret":"leak-me"}`)
	sanitized := SanitizeResponseBody(raw)
	if sanitized == nil {
		t.Fatal("expected captured body, got nil")
	}
	if *sanitized != string(raw) {
		t.Fatalf("expected exact error body %q, got %q", string(raw), *sanitized)
	}
}

func TestSanitizeResponseBodyPreservesNonJSONExactly(t *testing.T) {
	t.Parallel()

	raw := []byte("not json at all")
	sanitized := SanitizeResponseBody(raw)
	if sanitized == nil {
		t.Fatal("expected captured body, got nil")
	}
	if *sanitized != string(raw) {
		t.Fatalf("expected exact non-JSON body %q, got %q", string(raw), *sanitized)
	}
}
