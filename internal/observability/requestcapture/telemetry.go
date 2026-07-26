package requestcapture

import (
	"net/http"
	"strings"
)

// SanitizerConfig defines the legacy sanitizer configuration surface retained so
// existing call sites and tests keep compiling. The hotfix now preserves actual
// headers and bodies for local debugging, so these fields are no longer applied
// by SanitizeHeaders/SanitizeResponseBody.
type SanitizerConfig struct {
	AllowedHeaders    map[string]bool
	AllowedBodyKeys   map[string]bool
	MaxResponseBodyKB int
}

// defaultSanitizerConfig returns the legacy default-deny policy metadata. The
// hotfix preserves exact telemetry, so the returned values are informational.
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

// SanitizeHeaders preserves the exact header values captured for local
// debugging, joining repeated values with `, ` under the conventional header
// casing so the persisted map stays faithful to the wire while fitting the
// existing `map[string]string` contract.
func SanitizeHeaders(header http.Header) map[string]string {
	return sanitizeHeadersWithConfig(header, defaultSanitizerConfig())
}

// sanitizeHeadersWithConfig preserves exact header values. The config parameter
// is retained only for API compatibility with existing tests/callers.
func sanitizeHeadersWithConfig(header http.Header, config SanitizerConfig) map[string]string {
	sanitized := map[string]string{}
	for name, values := range header {
		if len(values) == 0 {
			continue
		}
		sanitized[canonicalHeaderName(name)] = strings.Join(values, ", ")
	}
	return sanitized
}

// canonicalHeaderName restores the conventional casing for a known header name.
func canonicalHeaderName(name string) string {
	return http.CanonicalHeaderKey(name)
}

// SanitizeResponseBody preserves the exact captured response body so Activity can
// behave like a real Network inspector. Empty bodies stay absent via the caller
// passing nil/zero-length inputs.
func SanitizeResponseBody(raw []byte) *string {
	return sanitizeResponseBodyWithConfig(raw, defaultSanitizerConfig())
}

// sanitizeResponseBodyWithConfig preserves the exact captured body. The config
// parameter is retained only for API compatibility with existing tests/callers.
func sanitizeResponseBodyWithConfig(raw []byte, config SanitizerConfig) *string {
	if len(raw) == 0 {
		return nil
	}
	result := string(raw)
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
