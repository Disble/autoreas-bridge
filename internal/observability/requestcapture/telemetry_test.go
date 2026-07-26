package requestcapture

import (
	"net/http"
	"testing"
)

func TestSanitizeHeadersPreservesActualHeaderValuesForLocalDebugging(t *testing.T) {
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
		"Authorization":       "Bearer secret-token",
		"Cookie":              "session=abc123",
		"Set-Cookie":          "session=abc123",
		"Proxy-Authorization": "Basic xyz",
		"Content-Type":        "application/json",
		"X-Multi":             "first, second",
	} {
		if got := sanitized[key]; got != want {
			t.Fatalf("expected %q=%q, got %#v", key, want, sanitized)
		}
	}
	if len(sanitized) != 6 {
		t.Fatalf("expected all headers preserved, got %#v", sanitized)
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
		if got := sanitized[key]; got != want {
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
