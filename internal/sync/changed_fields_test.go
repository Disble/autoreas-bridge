package sync

import (
	"strings"
	"testing"
)

// snapshotWithSchedule is a stored-shape snapshot carrying three scheduled
// days, one genre, one studio, and a cover.
const snapshotWithSchedule = `{
	"name": "One Pace - Wano",
	"days": [{"day": "Lunes", "order": 1}, {"day": "Martes", "order": 2}, {"day": "Jueves", "order": 3}],
	"genres": ["Action"],
	"studios": ["Toei"],
	"cover": {"type": "url", "path": "before.jpg"},
	"active": true
}`

// TestDeriveChangedFieldsNamesOnlyTheChangedField pins the ordinary case: a
// cover-only save declares the cover and nothing else.
func TestDeriveChangedFieldsNamesOnlyTheChangedField(t *testing.T) {
	desired := `{
		"name": "One Pace - Wano",
		"days": [{"day": "Lunes", "order": 1}, {"day": "Martes", "order": 2}, {"day": "Jueves", "order": 3}],
		"genres": ["Action"],
		"studios": ["Toei"],
		"cover": {"type": "url", "path": "after.jpg"},
		"active": true
	}`

	fields, err := deriveChangedFields([]byte(snapshotWithSchedule), []byte(desired))
	if err != nil {
		t.Fatalf("deriveChangedFields returned error: %v", err)
	}

	if got := strings.Join(fields, ","); got != "cover" {
		t.Fatalf("expected %q, got %q", "cover", got)
	}
}

// TestDeriveChangedFieldsNamesAnEmptiedCollection is the incident shape: the
// schedule went from three days to none, and the derived list must say so.
// This is the row that read "update|[]" in the changelog while it wiped days.
func TestDeriveChangedFieldsNamesAnEmptiedCollection(t *testing.T) {
	desired := `{
		"name": "One Pace - Wano",
		"days": [],
		"genres": ["Action"],
		"studios": ["Toei"],
		"cover": {"type": "url", "path": "after.jpg"},
		"active": true
	}`

	fields, err := deriveChangedFields([]byte(snapshotWithSchedule), []byte(desired))
	if err != nil {
		t.Fatalf("deriveChangedFields returned error: %v", err)
	}

	if got := strings.Join(fields, ","); got != "cover,days" {
		t.Fatalf("expected %q, got %q", "cover,days", got)
	}
}

// TestDeriveChangedFieldsOnNoOpWriteIsEmptyNotNil proves a write that changed
// nothing yields an empty list rather than nil: nil marshals to JSON null, and
// a null changed-field list is indistinguishable from the empty envelope this
// change exists to eliminate.
func TestDeriveChangedFieldsOnNoOpWriteIsEmptyNotNil(t *testing.T) {
	fields, err := deriveChangedFields([]byte(snapshotWithSchedule), []byte(snapshotWithSchedule))
	if err != nil {
		t.Fatalf("deriveChangedFields returned error: %v", err)
	}

	if fields == nil {
		t.Fatal("expected a non-nil empty slice, got nil")
	}
	if len(fields) != 0 {
		t.Fatalf("expected no changed fields, got %v", fields)
	}
}

// TestDeriveChangedFieldsIsSortedAndStable pins deterministic output: the same
// pair must always produce the same list in the same order, or the persisted
// value churns for no reason.
func TestDeriveChangedFieldsIsSortedAndStable(t *testing.T) {
	desired := `{
		"name": "Renamed",
		"days": [],
		"genres": ["Action", "Drama"],
		"studios": ["Toei"],
		"cover": {"type": "url", "path": "after.jpg"},
		"active": false
	}`

	first, err := deriveChangedFields([]byte(snapshotWithSchedule), []byte(desired))
	if err != nil {
		t.Fatalf("deriveChangedFields returned error: %v", err)
	}
	second, err := deriveChangedFields([]byte(snapshotWithSchedule), []byte(desired))
	if err != nil {
		t.Fatalf("deriveChangedFields returned error on repeat: %v", err)
	}

	if got := strings.Join(first, ","); got != "active,cover,days,genres,name" {
		t.Fatalf("expected %q, got %q", "active,cover,days,genres,name", got)
	}
	if strings.Join(first, ",") != strings.Join(second, ",") {
		t.Fatalf("derivation is not stable: %v then %v", first, second)
	}
}

// TestDeriveChangedFieldsNamesAnAddedField covers a key present only in the
// desired snapshot: adding a field is a change.
func TestDeriveChangedFieldsNamesAnAddedField(t *testing.T) {
	base := `{"name": "X"}`
	desired := `{"name": "X", "cover": {"type": "url", "path": "a.jpg"}}`

	fields, err := deriveChangedFields([]byte(base), []byte(desired))
	if err != nil {
		t.Fatalf("deriveChangedFields returned error: %v", err)
	}

	if got := strings.Join(fields, ","); got != "cover" {
		t.Fatalf("expected %q, got %q", "cover", got)
	}
}

// TestDeriveChangedFieldsNamesARemovedField covers a key present only in the
// base snapshot: dropping a field is a change too, and missing it is how a
// removal becomes silent.
func TestDeriveChangedFieldsNamesARemovedField(t *testing.T) {
	base := `{"name": "X", "cover": {"type": "url", "path": "a.jpg"}}`
	desired := `{"name": "X"}`

	fields, err := deriveChangedFields([]byte(base), []byte(desired))
	if err != nil {
		t.Fatalf("deriveChangedFields returned error: %v", err)
	}

	if got := strings.Join(fields, ","); got != "cover" {
		t.Fatalf("expected %q, got %q", "cover", got)
	}
}

// TestDeriveChangedFieldsRejectsMalformedSnapshot proves an unreadable snapshot
// surfaces as an error rather than as "nothing changed".
func TestDeriveChangedFieldsRejectsMalformedSnapshot(t *testing.T) {
	if _, err := deriveChangedFields([]byte(`{"days": [`), []byte(snapshotWithSchedule)); err == nil {
		t.Fatal("expected an error for a malformed base snapshot, got nil")
	}
	if _, err := deriveChangedFields([]byte(snapshotWithSchedule), []byte(`{"days": [`)); err == nil {
		t.Fatal("expected an error for a malformed desired snapshot, got nil")
	}
}
