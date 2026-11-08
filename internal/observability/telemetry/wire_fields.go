package telemetry

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"

	"autoreas-bridge/internal/observability/syncdiag"
)

// reportCodePattern is the shape of a code mobile coins on its own: a reason,
// a runtime subject or a transition. Bridge does not close these vocabularies,
// so it closes their shape instead -- lowercase words joined by underscores,
// short enough to show as stored.
var reportCodePattern = regexp.MustCompile(`^[a-z0-9_]{1,40}$`)

// isNull reports whether a present raw wire value is the JSON null literal.
func isNull(raw json.RawMessage) bool {
	return bytes.Equal(raw, []byte("null"))
}

// patternString decodes a required string that must match pattern.
func patternString(field string, raw json.RawMessage, pattern *regexp.Regexp) (string, error) {
	value, err := requiredString(field, raw)
	if err != nil {
		return "", err
	}
	if !pattern.MatchString(value) {
		return "", &syncdiag.FieldError{Field: field, Reason: "must match " + pattern.String()}
	}
	return value, nil
}

// optionalPatternString decodes an optional string: an absent key or a null
// is no value (nil); a present value must match pattern.
func optionalPatternString(field string, raw json.RawMessage, pattern *regexp.Regexp) (*string, error) {
	if raw == nil || isNull(raw) {
		return nil, nil
	}
	value, err := patternString(field, raw, pattern)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

// optionalBoundedInt decodes an optional integer: an absent key or a null is
// no value (nil); a present value must lie within [minimum, maximum].
func optionalBoundedInt(field string, raw json.RawMessage, minimum, maximum int64) (*int64, error) {
	if raw == nil || isNull(raw) {
		return nil, nil
	}
	value, err := boundedInt(field, raw, minimum, maximum)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

// objectItems splits an array of at most maximum objects into its raw items,
// each still to be strict-decoded by the caller. A required array refuses an
// absent key and a null; an optional one reads both as an empty array.
func objectItems(field string, raw json.RawMessage, maximum int, required bool) ([]json.RawMessage, error) {
	if raw == nil {
		if required {
			return nil, &syncdiag.FieldError{Field: field, Reason: "missing required key"}
		}
		return nil, nil
	}
	if isNull(raw) && !required {
		return nil, nil
	}
	var items []json.RawMessage
	if isNull(raw) || json.Unmarshal(raw, &items) != nil {
		return nil, &syncdiag.FieldError{Field: field, Reason: "must be an array"}
	}
	if len(items) > maximum {
		return nil, &syncdiag.FieldError{Field: field, Reason: fmt.Sprintf("must hold at most %d items", maximum)}
	}
	return items, nil
}

// strictItem strict-decodes one array item, naming an undeclared key under
// the item's prefix and any other failure as the item itself.
func strictItem(prefix string, item json.RawMessage, into any) error {
	if err := strictDecode(item, into); err != nil {
		if fieldErr := undeclaredKey(prefix+".", err); fieldErr != nil {
			return fieldErr
		}
		return &syncdiag.FieldError{Field: prefix, Reason: "must be an object"}
	}
	return nil
}

// decodeObservationID decodes the required, non-empty observation_id that is
// a mobile report's kind-scoped idempotency key.
func decodeObservationID(raw json.RawMessage) (string, error) {
	observationID, err := requiredString("observation_id", raw)
	if err != nil {
		return "", err
	}
	if observationID == "" {
		return "", &syncdiag.FieldError{Field: "observation_id", Reason: "must be a non-empty string"}
	}
	return observationID, nil
}
