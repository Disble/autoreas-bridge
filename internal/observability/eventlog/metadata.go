package eventlog

import (
	"encoding/json"
	"strings"
)

// sensitiveMetadataKeys is the default-deny key list redacted from
// metadata_json before it is ever stored, case-insensitive. Fields.Metadata
// is default-allow at the logger, so this store-side redaction is the only
// place that guarantees secrets never reach the persisted event log.
var sensitiveMetadataKeys = []string{
	"authorization", "token", "cookie", "password", "secret", "api_key", "bearer",
}

const redactedMarker = "[redacted]"

// boundMetadataJSON marshals a redacted, size-bounded copy of metadata into
// the value to bind for metadata_json. A nil/empty map binds SQL NULL. A
// marshal failure (e.g. an unmarshalable value type) also binds NULL rather
// than propagating an error -- metadata is best-effort, never load-bearing.
// Metadata past the 4KB bound stores a marker object instead of truncated
// (unparseable) JSON.
func boundMetadataJSON(metadata map[string]any) *string {
	if len(metadata) == 0 {
		return nil
	}
	redacted := redactMetadata(metadata)
	encoded, err := json.Marshal(redacted)
	if err != nil {
		return nil
	}
	if len(encoded) <= maxMetadataBytes {
		result := string(encoded)
		return &result
	}
	marker, err := json.Marshal(map[string]any{
		"_truncated":     true,
		"_original_keys": len(metadata),
	})
	if err != nil {
		return nil
	}
	result := string(marker)
	return &result
}

// redactMetadata returns a copy of metadata with every sensitive-keyed value
// replaced by a redaction marker, recursing into nested maps so a
// sensitive key buried under a non-sensitive parent (e.g.
// request_headers.Authorization) is still caught.
func redactMetadata(metadata map[string]any) map[string]any {
	redacted := make(map[string]any, len(metadata))
	for key, value := range metadata {
		switch typed := value.(type) {
		case map[string]any:
			redacted[key] = redactMetadata(typed)
		default:
			if isSensitiveMetadataKey(key) {
				redacted[key] = redactedMarker
				continue
			}
			redacted[key] = value
		}
	}
	return redacted
}

// isSensitiveMetadataKey reports whether key matches the default-deny list,
// case-insensitively and as a substring (so "auth_token" and
// "x-api-key" style variants are still caught).
func isSensitiveMetadataKey(key string) bool {
	lower := strings.ToLower(key)
	for _, sensitive := range sensitiveMetadataKeys {
		if strings.Contains(lower, sensitive) {
			return true
		}
	}
	return false
}
