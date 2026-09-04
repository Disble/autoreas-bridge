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

// RedactedHeaderPlaceholder replaces the value of a credential-bearing header.
// The header key is deliberately kept: Activity is a network inspector, and an
// absent Authorization row would misreport an authenticated request as
// anonymous. What it must not do is persist the credential itself.
const RedactedHeaderPlaceholder = "[redacted]"

// credentialHeaders are the headers whose VALUE is replaced by
// RedactedHeaderPlaceholder before persistence, in canonical casing.
//
// This is a value-scoped denylist, not a key allowlist, and the distinction is
// load-bearing: an allowlist has to enumerate every header that may ever be
// useful, so it silently drops the ones nobody predicted -- which is exactly
// how a future correlation header (the mobile client's X-Sync-Cycle-Id, say)
// would vanish from the capture table with no error to notice.
var credentialHeaders = map[string]bool{
	"Authorization":       true,
	"Proxy-Authorization": true,
	"Cookie":              true,
	"Set-Cookie":          true,
}

// SanitizeHeaders preserves the exact header values captured for local
// debugging -- except the credential-bearing ones, whose values are redacted --
// joining repeated values with `, ` under the conventional header casing so the
// persisted map stays faithful to the wire while fitting the existing
// `map[string]string` contract.
//
// The redaction exists because a bridge auth token never expires and is never
// rotated (internal/device/service.go: PairDevice mints it once, and
// FindByAuthToken matches it forever), so a captured Bearer token is a
// permanent credential sitting at rest in a database that is routinely copied
// alongside its own backups. That is a different exposure from a browser's
// devtools showing the same header in memory, which is the comparison the
// original passthrough was reasoning from.
func SanitizeHeaders(header http.Header) map[string]string {
	return sanitizeHeadersWithConfig(header, defaultSanitizerConfig())
}

// sanitizeHeadersWithConfig preserves exact header values except for
// credentialHeaders, whose values are redacted. The config parameter is
// retained only for API compatibility with existing tests/callers.
func sanitizeHeadersWithConfig(header http.Header, config SanitizerConfig) map[string]string {
	sanitized := map[string]string{}
	for name, values := range header {
		if len(values) == 0 {
			continue
		}
		canonical := canonicalHeaderName(name)
		if credentialHeaders[canonical] {
			sanitized[canonical] = RedactedHeaderPlaceholder
			continue
		}
		sanitized[canonical] = strings.Join(values, ", ")
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
