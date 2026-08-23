package center

import (
	"encoding/base64"
	"encoding/json"
	"errors"
)

// recordCursor is the pagination cursor, keyed on (created_at_ms, id) -- the
// only stable tiebreaker, since two notifications can share a millisecond.
// Mirrors internal/observability/eventlog/reader.go's eventCursor exactly.
type recordCursor struct {
	CreatedAtMS int64 `json:"created_at_ms"`
	ID          int64 `json:"id"`
}

// encodeRecordCursor serializes the pagination cursor to URL-safe base64.
func encodeRecordCursor(cursor recordCursor) string {
	encoded, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(encoded)
}

// decodeRecordCursor parses a base64 record cursor into its parts, rejecting
// a zero ID: notification_records.id is an AUTOINCREMENT primary key that
// never assigns 0, so a zero ID cursor is always malformed input rather than
// a legitimate reference to the first-ever row.
func decodeRecordCursor(value string) (recordCursor, error) {
	encoded, err := base64.RawURLEncoding.DecodeString(value)
	var cursor recordCursor
	if err != nil || json.Unmarshal(encoded, &cursor) != nil || cursor.ID == 0 {
		return recordCursor{}, errors.New("notification center: invalid list cursor")
	}
	return cursor, nil
}
