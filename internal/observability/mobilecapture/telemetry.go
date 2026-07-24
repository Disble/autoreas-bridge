package mobilecapture

import (
	"encoding/json"
	"net/http"
	"strings"
)

const (
	maxSanitizedResponseBodyBytes = 2048
	redactedResponseBodyMarker    = `{"error":"response body redacted"}`
)

// SanitizerConfig defines the default-deny allowlists used to sanitize captured
// telemetry before persistence. Zero-value falls back to the safe bridge defaults.
type SanitizerConfig struct {
	AllowedHeaders    map[string]bool
	AllowedBodyKeys   map[string]bool
	MaxResponseBodyKB int
}

// defaultSanitizerConfig returns the bridge-owned default-deny sanitizer policy.
func defaultSanitizerConfig() SanitizerConfig {
	return SanitizerConfig{
		AllowedHeaders: map[string]bool{
			"content-type":     true,
			"content-length":   true,
			"accept":           true,
			"x-sync-version":   true,
			"x-app-version":    true,
			"x-client-version": true,
			"x-api-version":    true,
		},
		AllowedBodyKeys: map[string]bool{
			"error":      true,
			"status":     true,
			"message":    true,
			"conflict":   true,
			"code":       true,
			"kept_grade": true,
		},
		MaxResponseBodyKB: 2,
	}
}

// Telemetry carries the additive request/response instrumentation captured
// alongside a base CaptureRecord. Nil fields mean "not captured" and are copied
// onto the record verbatim by WithTelemetry.
type Telemetry struct {
	DurationMS      *int64
	ResponseBody    *string
	RequestHeaders  map[string]string
	ResponseHeaders map[string]string
}

// SanitizeHeaders projects an http.Header through the default-deny allowlist.
// Authorization, Cookie, Set-Cookie, Proxy-Authorization, and any header absent
// from the allowlist are never emitted.
func SanitizeHeaders(header http.Header) map[string]string {
	return sanitizeHeadersWithConfig(header, defaultSanitizerConfig())
}

// sanitizeHeadersWithConfig applies an explicit sanitizer configuration.
func sanitizeHeadersWithConfig(header http.Header, config SanitizerConfig) map[string]string {
	sanitized := map[string]string{}
	for name, values := range header {
		if len(values) == 0 {
			continue
		}
		if !config.AllowedHeaders[strings.ToLower(name)] {
			continue
		}
		sanitized[canonicalHeaderName(name)] = values[0]
	}
	return sanitized
}

// canonicalHeaderName restores the conventional casing for a known header name.
func canonicalHeaderName(name string) string {
	return http.CanonicalHeaderKey(name)
}

// SanitizeResponseBody parses raw as JSON, keeps only sanctioned keys, and
// bounds the re-marshaled result to <=2KB. Non-JSON or oversized input
// collapses to a redaction marker; it never echoes raw payloads or headers.
func SanitizeResponseBody(raw []byte) *string {
	return sanitizeResponseBodyWithConfig(raw, defaultSanitizerConfig())
}

// sanitizeResponseBodyWithConfig applies an explicit sanitizer configuration.
func sanitizeResponseBodyWithConfig(raw []byte, config SanitizerConfig) *string {
	maxBytes := maxSanitizedResponseBodyBytes
	if config.MaxResponseBodyKB > 0 {
		maxBytes = config.MaxResponseBodyKB * 1024
	}

	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		marker := redactedResponseBodyMarker
		return &marker
	}

	sanctioned := map[string]any{}
	for key, value := range parsed {
		if config.AllowedBodyKeys[key] {
			sanctioned[key] = value
		}
	}

	encoded, err := json.Marshal(sanctioned)
	if err != nil {
		marker := redactedResponseBodyMarker
		return &marker
	}
	if len(encoded) > maxBytes {
		marker := redactedResponseBodyMarker
		return &marker
	}
	result := string(encoded)
	return &result
}

// WithTelemetry copies non-nil telemetry fields onto the record and returns it,
// enabling fluent chaining at the capture site.
func (r CaptureRecord) WithTelemetry(t Telemetry) CaptureRecord {
	if t.DurationMS != nil {
		r.DurationMS = t.DurationMS
	}
	if t.ResponseBody != nil {
		r.ResponseBody = t.ResponseBody
	}
	if t.RequestHeaders != nil {
		r.RequestHeaders = t.RequestHeaders
	}
	if t.ResponseHeaders != nil {
		r.ResponseHeaders = t.ResponseHeaders
	}
	return r
}
