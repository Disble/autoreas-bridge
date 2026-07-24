package mobilecapture

import (
	"net/http"
	"strings"
	"testing"
)

func TestSanitizeHeadersDropsAuthAndCookies(t *testing.T) {
	t.Parallel()

	header := http.Header{}
	header.Set("Authorization", "Bearer secret-token")
	header.Set("Cookie", "session=abc123")
	header.Set("Set-Cookie", "session=abc123")
	header.Set("Proxy-Authorization", "Basic xyz")
	header.Set("Content-Type", "application/json")

	sanitized := SanitizeHeaders(header)
	for _, forbidden := range []string{"Authorization", "Cookie", "Set-Cookie", "Proxy-Authorization"} {
		if _, ok := sanitized[forbidden]; ok {
			t.Fatalf("expected %q to be excluded, got %#v", forbidden, sanitized)
		}
	}
	if got := sanitized["Content-Type"]; got != "application/json" {
		t.Fatalf("expected Content-Type to be kept, got %#v", sanitized)
	}
}

func TestSanitizeHeadersKeepsSyncVersion(t *testing.T) {
	t.Parallel()

	header := http.Header{}
	header.Set("X-Sync-Version", "3")
	header.Set("X-App-Version", "1.2.3")
	header.Set("X-Client-Version", "beta")
	header.Set("X-Api-Version", "v1")
	header.Set("Accept", "application/json")
	header.Set("Content-Length", "42")
	header.Set("X-Unlisted-Header", "should-be-dropped")

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
	if _, ok := sanitized["X-Unlisted-Header"]; ok {
		t.Fatalf("expected unlisted header excluded, got %#v", sanitized)
	}
}

func TestSanitizeResponseBodyKeepsErrorMessageBounded(t *testing.T) {
	t.Parallel()

	raw := []byte(`{"error":"anime not found","status":404,"message":"not found","conflict":false,"code":"anime_not_found","kept_grade":5,"secret":"leak-me"}`)
	sanitized := SanitizeResponseBody(raw)
	if sanitized == nil {
		t.Fatal("expected sanitized body, got nil")
	}
	if strings.Contains(*sanitized, "secret") || strings.Contains(*sanitized, "leak-me") {
		t.Fatalf("expected unsanctioned key excluded, got %s", *sanitized)
	}
	for _, want := range []string{"anime not found", "404", "not found", "anime_not_found"} {
		if !strings.Contains(*sanitized, want) {
			t.Fatalf("expected sanctioned content %q present, got %s", want, *sanitized)
		}
	}
	if len(*sanitized) > 2048 {
		t.Fatalf("expected sanitized body bounded to 2KB, got %d bytes", len(*sanitized))
	}
}

func TestSanitizeResponseBodyRedactsNonJSON(t *testing.T) {
	t.Parallel()

	sanitized := SanitizeResponseBody([]byte("not json at all"))
	if sanitized == nil {
		t.Fatal("expected a redaction marker, got nil")
	}
	if strings.Contains(*sanitized, "not json at all") {
		t.Fatalf("expected raw non-JSON body not echoed, got %s", *sanitized)
	}

	oversized := make([]byte, 4096)
	for i := range oversized {
		oversized[i] = 'a'
	}
	oversizedJSON := append([]byte(`{"error":"`), oversized...)
	oversizedJSON = append(oversizedJSON, []byte(`"}`)...)
	sanitizedOversized := SanitizeResponseBody(oversizedJSON)
	if sanitizedOversized == nil {
		t.Fatal("expected a redaction marker for oversized body, got nil")
	}
	if len(*sanitizedOversized) > 2048 {
		t.Fatalf("expected redaction marker bounded, got %d bytes", len(*sanitizedOversized))
	}
}
