package main

import (
	"testing"
)

// baseWithDays is a stored-shape snapshot holding three scheduled days, one
// genre, and a cover. Field names mirror the real stored shape recorded in
// internal/anime/store/testdata/real_snapshot_shape.jsonl.
const baseWithDays = `{
	"name": "One Pace - Wano",
	"days": [{"day": "Lunes", "order": 1}, {"day": "Martes", "order": 2}, {"day": "Jueves", "order": 3}],
	"genres": ["Action"],
	"studios": ["Toei"],
	"cover": {"type": "url", "path": "before.jpg"},
	"active": true
}`

// TestReportsCoverOnlySaveThatEmptiedDays pins the incident shape: a save whose
// intent was the cover, which also emptied the schedule.
func TestReportsCoverOnlySaveThatEmptiedDays(t *testing.T) {
	desired := `{
		"name": "One Pace - Wano",
		"days": [],
		"genres": ["Action"],
		"studios": ["Toei"],
		"cover": {"type": "url", "path": "after.jpg"},
		"active": true
	}`

	findings, err := DetectTruncations(Operation{
		OperationID:         "op-1",
		AnimeID:             "anime-1",
		CommittedAtMs:       1788064372869,
		BaseSnapshotJSON:    []byte(baseWithDays),
		DesiredSnapshotJSON: []byte(desired),
	})
	if err != nil {
		t.Fatalf("DetectTruncations returned error: %v", err)
	}

	if len(findings) != 1 {
		t.Fatalf("expected 1 finding, got %d: %+v", len(findings), findings)
	}
	if findings[0].Field != "days" {
		t.Errorf("expected field %q, got %q", "days", findings[0].Field)
	}
	if findings[0].AnimeID != "anime-1" {
		t.Errorf("expected anime id %q, got %q", "anime-1", findings[0].AnimeID)
	}
	if findings[0].OperationID != "op-1" {
		t.Errorf("expected operation id %q, got %q", "op-1", findings[0].OperationID)
	}
	if findings[0].CommittedAtMs != 1788064372869 {
		t.Errorf("expected committed at %d, got %d", int64(1788064372869), findings[0].CommittedAtMs)
	}
}

// TestDoesNotReportIntentionalClear proves the detector distinguishes a
// deliberate schedule clear from collateral damage: when the emptied collection
// is the only difference, clearing it was the point of the write.
func TestDoesNotReportIntentionalClear(t *testing.T) {
	desired := `{
		"name": "One Pace - Wano",
		"days": [],
		"genres": ["Action"],
		"studios": ["Toei"],
		"cover": {"type": "url", "path": "before.jpg"},
		"active": true
	}`

	findings, err := DetectTruncations(Operation{
		OperationID:         "op-2",
		AnimeID:             "anime-1",
		CommittedAtMs:       1788064372870,
		BaseSnapshotJSON:    []byte(baseWithDays),
		DesiredSnapshotJSON: []byte(desired),
	})
	if err != nil {
		t.Fatalf("DetectTruncations returned error: %v", err)
	}

	if len(findings) != 0 {
		t.Fatalf("expected no findings for an intentional clear, got %d: %+v", len(findings), findings)
	}
}

// TestUntouchedCollectionsReportNothing covers the ordinary write: an unrelated
// field changed and every collection survived.
func TestUntouchedCollectionsReportNothing(t *testing.T) {
	desired := `{
		"name": "One Pace - Wano",
		"days": [{"day": "Lunes", "order": 1}, {"day": "Martes", "order": 2}, {"day": "Jueves", "order": 3}],
		"genres": ["Action"],
		"studios": ["Toei"],
		"cover": {"type": "url", "path": "after.jpg"},
		"active": true
	}`

	findings, err := DetectTruncations(Operation{
		OperationID:         "op-3",
		AnimeID:             "anime-1",
		CommittedAtMs:       1788064372871,
		BaseSnapshotJSON:    []byte(baseWithDays),
		DesiredSnapshotJSON: []byte(desired),
	})
	if err != nil {
		t.Fatalf("DetectTruncations returned error: %v", err)
	}

	if len(findings) != 0 {
		t.Fatalf("expected no findings when no collection emptied, got %d: %+v", len(findings), findings)
	}
}

// TestReportsEveryTruncatedCollection proves the detector is not days-only: a
// single unrelated save that empties genres and studios reports both.
func TestReportsEveryTruncatedCollection(t *testing.T) {
	desired := `{
		"name": "One Pace - Wano",
		"days": [{"day": "Lunes", "order": 1}, {"day": "Martes", "order": 2}, {"day": "Jueves", "order": 3}],
		"genres": [],
		"studios": [],
		"cover": {"type": "url", "path": "after.jpg"},
		"active": true
	}`

	findings, err := DetectTruncations(Operation{
		OperationID:         "op-4",
		AnimeID:             "anime-1",
		CommittedAtMs:       1788064372872,
		BaseSnapshotJSON:    []byte(baseWithDays),
		DesiredSnapshotJSON: []byte(desired),
	})
	if err != nil {
		t.Fatalf("DetectTruncations returned error: %v", err)
	}

	if len(findings) != 2 {
		t.Fatalf("expected 2 findings, got %d: %+v", len(findings), findings)
	}
	if findings[0].Field != "genres" {
		t.Errorf("expected first field %q, got %q", "genres", findings[0].Field)
	}
	if findings[1].Field != "studios" {
		t.Errorf("expected second field %q, got %q", "studios", findings[1].Field)
	}
}

// TestAbsentCollectionIsNotATruncation covers a snapshot that never carried the
// field: absent is not the same as emptied, and inventing a truncation there
// would report every anime that never had genres.
func TestAbsentCollectionIsNotATruncation(t *testing.T) {
	base := `{"name": "X", "days": [{"day": "Lunes", "order": 1}], "cover": {"type": "url", "path": "a.jpg"}}`
	desired := `{"name": "X", "days": [{"day": "Lunes", "order": 1}], "cover": {"type": "url", "path": "b.jpg"}}`

	findings, err := DetectTruncations(Operation{
		OperationID:         "op-5",
		AnimeID:             "anime-2",
		CommittedAtMs:       1788064372873,
		BaseSnapshotJSON:    []byte(base),
		DesiredSnapshotJSON: []byte(desired),
	})
	if err != nil {
		t.Fatalf("DetectTruncations returned error: %v", err)
	}

	if len(findings) != 0 {
		t.Fatalf("expected no findings when the collection was never present, got %d: %+v", len(findings), findings)
	}
}

// TestAlreadyEmptyCollectionIsNotATruncation pins the lower bound of the
// non-empty test. A collection that was already empty did not lose anything,
// and the real stored shape carries empty genres and studios on many rows, so
// treating empty-to-empty as a truncation would report most of the database.
func TestAlreadyEmptyCollectionIsNotATruncation(t *testing.T) {
	base := `{"name": "X", "days": [], "genres": [], "studios": [], "cover": {"type": "url", "path": "a.jpg"}}`
	desired := `{"name": "X", "days": [], "genres": [], "studios": [], "cover": {"type": "url", "path": "b.jpg"}}`

	findings, err := DetectTruncations(Operation{
		OperationID:         "op-7",
		AnimeID:             "anime-4",
		CommittedAtMs:       1788064372875,
		BaseSnapshotJSON:    []byte(base),
		DesiredSnapshotJSON: []byte(desired),
	})
	if err != nil {
		t.Fatalf("DetectTruncations returned error: %v", err)
	}

	if len(findings) != 0 {
		t.Fatalf("expected no findings for an already-empty collection, got %d: %+v", len(findings), findings)
	}
}

// TestFieldMissingFromDesiredIsNotATruncation covers the asymmetric case: the
// desired snapshot omits the key entirely rather than carrying an empty list.
// Absent is not emptied, and reading it as emptied would invent a truncation
// out of a partial snapshot.
func TestFieldMissingFromDesiredIsNotATruncation(t *testing.T) {
	base := `{"name": "X", "days": [{"day": "Lunes", "order": 1}], "cover": {"type": "url", "path": "a.jpg"}}`
	desired := `{"name": "X", "cover": {"type": "url", "path": "b.jpg"}}`

	findings, err := DetectTruncations(Operation{
		OperationID:         "op-8",
		AnimeID:             "anime-5",
		CommittedAtMs:       1788064372876,
		BaseSnapshotJSON:    []byte(base),
		DesiredSnapshotJSON: []byte(desired),
	})
	if err != nil {
		t.Fatalf("DetectTruncations returned error: %v", err)
	}

	if len(findings) != 0 {
		t.Fatalf("expected no findings when the field is absent from desired, got %d: %+v", len(findings), findings)
	}
}

// TestUnrecognisedVocabularyIsAnErrorNotACleanRun is the guard against the
// worst outcome this whole check exists to prevent: reporting "clean" because
// it never looked. Snapshots written before the English vocabulary migration
// name the schedule `dias`, so a detector scanning for `days` finds nothing and
// would otherwise pass a database full of truncations.
func TestUnrecognisedVocabularyIsAnErrorNotACleanRun(t *testing.T) {
	spanish := `{"nombre": "X", "dias": [{"dia": "Lunes", "orden": 1}], "portada": {"tipo": "url"}}`
	spanishAfter := `{"nombre": "X", "dias": [], "portada": {"tipo": "file"}}`

	_, err := Analyze([]Operation{{
		OperationID:         "op-legacy",
		AnimeID:             "anime-legacy",
		CommittedAtMs:       1784175529242,
		BaseSnapshotJSON:    []byte(spanish),
		DesiredSnapshotJSON: []byte(spanishAfter),
	}})
	if err == nil {
		t.Fatal("expected an error when no snapshot carries a known collection field, got nil")
	}
}

// TestRecognisedVocabularyAnalysesCleanly proves the vocabulary guard does not
// fire on the shape the check does understand.
func TestRecognisedVocabularyAnalysesCleanly(t *testing.T) {
	findings, err := Analyze([]Operation{{
		OperationID:         "op-1",
		AnimeID:             "anime-1",
		CommittedAtMs:       1788064372869,
		BaseSnapshotJSON:    []byte(baseWithDays),
		DesiredSnapshotJSON: []byte(baseWithDays),
	}})
	if err != nil {
		t.Fatalf("Analyze returned error on a recognised shape: %v", err)
	}
	if len(findings) != 0 {
		t.Fatalf("expected no findings, got %d: %+v", len(findings), findings)
	}
}

// TestAnalyseEmptyRunIsNotAVocabularyFailure covers a database with no
// committed writes at all: there is nothing to recognise, and that is a clean
// run rather than an unreadable one.
func TestAnalyseEmptyRunIsNotAVocabularyFailure(t *testing.T) {
	findings, err := Analyze(nil)
	if err != nil {
		t.Fatalf("Analyze returned error on an empty run: %v", err)
	}
	if len(findings) != 0 {
		t.Fatalf("expected no findings, got %d", len(findings))
	}
}

// TestMalformedSnapshotIsAnError proves an unreadable snapshot surfaces rather
// than silently counting as "no truncation found".
func TestMalformedSnapshotIsAnError(t *testing.T) {
	_, err := DetectTruncations(Operation{
		OperationID:         "op-6",
		AnimeID:             "anime-3",
		CommittedAtMs:       1788064372874,
		BaseSnapshotJSON:    []byte(`{"days": [`),
		DesiredSnapshotJSON: []byte(baseWithDays),
	})
	if err == nil {
		t.Fatal("expected an error for a malformed base snapshot, got nil")
	}
}
