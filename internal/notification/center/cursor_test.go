package center

import "testing"

// TestCursorRoundTrip asserts encodeRecordCursor then decodeRecordCursor
// returns the original recordCursor unchanged.
func TestCursorRoundTrip(t *testing.T) {
	t.Parallel()

	original := recordCursor{CreatedAtMS: 1234, ID: 42}
	encoded := encodeRecordCursor(original)

	decoded, err := decodeRecordCursor(encoded)
	if err != nil {
		t.Fatalf("decode round-tripped cursor: %v", err)
	}
	if decoded != original {
		t.Fatalf("expected round-tripped cursor %#v, got %#v", original, decoded)
	}
}

// TestDecodeCursorRejectsZeroID asserts a cursor with ID == 0 is rejected:
// id 0 is never a valid notification_records primary key (AUTOINCREMENT
// starts at 1), so accepting it would silently break the keyset tiebreaker.
func TestDecodeCursorRejectsZeroID(t *testing.T) {
	t.Parallel()

	zeroIDCursor := encodeRecordCursor(recordCursor{CreatedAtMS: 1234, ID: 0})

	if _, err := decodeRecordCursor(zeroIDCursor); err == nil {
		t.Fatal("expected an error decoding a cursor with ID == 0, got nil")
	}
}
