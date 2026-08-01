package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime"
)

func TestImportAnimeSnapshotsReplacesExistingRows(t *testing.T) {
	db := openTestBridgeDB(t)
	store := NewAnimeSnapshotStore(db)

	seed := map[string]anime.SnapshotRecord{
		"a": {AnimeID: "a", CanonicalJSON: []byte(`{"id":"a"}`), Hash: anime.HashSnapshot([]byte(`{"id":"a"}`))},
		"b": {AnimeID: "b", CanonicalJSON: []byte(`{"id":"b"}`), Hash: anime.HashSnapshot([]byte(`{"id":"b"}`))},
	}
	if err := store.ReplaceBaseline(context.Background(), seed, nil); err != nil {
		t.Fatalf("seed: %v", err)
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, rec := range []animeSnapshotRecord{
		{AnimeID: "b", SnapshotJSON: `{"id":"b2"}`, SnapshotHash: "hash-b2", ModifiedAt: 2},
		{AnimeID: "c", SnapshotJSON: `{"id":"c"}`, SnapshotHash: "hash-c", ModifiedAt: 3},
	} {
		if err := enc.Encode(rec); err != nil {
			t.Fatalf("encode fixture record: %v", err)
		}
	}

	importFn := ImportAnimeSnapshots(db)
	count, err := importFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected count 2, got %d", count)
	}

	got, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("ListSnapshots: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected exactly 2 rows after full refresh, got %d: %+v", len(got), got)
	}
	if _, ok := got["a"]; ok {
		t.Fatal("expected row 'a' to be gone after full refresh")
	}
	if got["b"].CanonicalJSON == nil || string(got["b"].CanonicalJSON) != `{"id":"b2"}` {
		t.Fatalf("expected row 'b' replaced, got %+v", got["b"])
	}
	if _, ok := got["c"]; !ok {
		t.Fatal("expected new row 'c' present")
	}
}

func TestImportAnimeSnapshotsRoundTripsExportedRecords(t *testing.T) {
	srcDB := openTestBridgeDB(t)
	srcStore := NewAnimeSnapshotStore(srcDB)
	canonicalJSON := seedAnimeSnapshotFixture(t, srcStore)

	var buf bytes.Buffer
	exportFn := ExportAnimeSnapshots(srcDB)
	if _, err := exportFn(context.Background(), &buf); err != nil {
		t.Fatalf("export: %v", err)
	}

	dstDB := openTestBridgeDB(t)
	importFn := ImportAnimeSnapshots(dstDB)
	if _, err := importFn(context.Background(), &buf); err != nil {
		t.Fatalf("import: %v", err)
	}

	dstStore := NewAnimeSnapshotStore(dstDB)
	got, err := dstStore.GetSnapshot(context.Background(), "10wvY4Q7seDrCiek")
	if err != nil {
		t.Fatalf("GetSnapshot: %v", err)
	}
	if string(got.CanonicalJSON) != string(canonicalJSON) {
		t.Fatalf("snapshot_json did not round-trip byte-identical:\nwant: %s\ngot:  %s", canonicalJSON, got.CanonicalJSON)
	}
	if got.ModifiedAt != 1_700_000_000_000 {
		t.Fatalf("unexpected modified_at: %d", got.ModifiedAt)
	}
}

// erroringAfterNReader allows reading at most n total bytes of the
// underlying content, then fails -- simulating a stream that dies partway
// through, used to prove records are decoded and applied one at a time
// rather than accumulated.
type erroringAfterNReader struct {
	r       *bytes.Reader
	n       int64
	read    int64
	failure error
}

func (e *erroringAfterNReader) Read(p []byte) (int, error) {
	if e.read >= e.n {
		return 0, e.failure
	}
	remaining := e.n - e.read
	if int64(len(p)) > remaining {
		p = p[:remaining]
	}
	n, err := e.r.Read(p)
	e.read += int64(n)
	return n, err
}

func TestImportDecodesIncrementally(t *testing.T) {
	db := openTestBridgeDB(t)

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for i := 0; i < 5; i++ {
		rec := animeSnapshotRecord{AnimeID: string(rune('a' + i)), SnapshotJSON: "{}", SnapshotHash: "h", ModifiedAt: int64(i)}
		if err := enc.Encode(rec); err != nil {
			t.Fatalf("encode fixture record %d: %v", i, err)
		}
	}

	// Read the full body one byte at a time via the reader below, but only
	// allow it to succeed for the first few Read calls that cover exactly 3
	// full JSON records, then fail.
	full := buf.Bytes()
	// Find the offset right after the third newline (three complete records).
	offset := 0
	newlines := 0
	for i, b := range full {
		if b == '\n' {
			newlines++
			if newlines == 3 {
				offset = i + 1
				break
			}
		}
	}
	failing := &erroringAfterNReader{r: bytes.NewReader(full), n: int64(offset), failure: errors.New("stream broke")}

	importFn := ImportAnimeSnapshots(db)
	count, err := importFn(context.Background(), failing)
	if err == nil {
		t.Fatal("expected the import to propagate the reader's error")
	}
	if count != 3 {
		t.Fatalf("expected count 3 (records decoded before the failure), got %d", count)
	}
}

func TestImportAnimeSnapshotsIgnoresUnknownFields(t *testing.T) {
	db := openTestBridgeDB(t)

	body := `{"anime_id":"x","snapshot_json":"{}","snapshot_hash":"h","modified_at":1,"future_field":"ignored"}` + "\n"

	importFn := ImportAnimeSnapshots(db)
	count, err := importFn(context.Background(), strings.NewReader(body))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}

	store := NewAnimeSnapshotStore(db)
	got, err := store.GetSnapshot(context.Background(), "x")
	if err != nil {
		t.Fatalf("GetSnapshot: %v", err)
	}
	if got.ModifiedAt != 1 {
		t.Fatalf("unexpected modified_at: %d", got.ModifiedAt)
	}
}

func TestImportAnimeSnapshotsDefaultsAbsentFields(t *testing.T) {
	db := openTestBridgeDB(t)

	body := `{"anime_id":"y"}` + "\n"

	importFn := ImportAnimeSnapshots(db)
	if _, err := importFn(context.Background(), strings.NewReader(body)); err != nil {
		t.Fatalf("import: %v", err)
	}

	store := NewAnimeSnapshotStore(db)
	got, err := store.GetSnapshot(context.Background(), "y")
	if err != nil {
		t.Fatalf("GetSnapshot: %v", err)
	}
	if got.ModifiedAt != 0 {
		t.Fatalf("expected absent modified_at to default to zero, got %d", got.ModifiedAt)
	}
	if string(got.CanonicalJSON) != "" {
		t.Fatalf("expected absent snapshot_json to default to empty, got %q", got.CanonicalJSON)
	}
}

func TestImportUsesBoundParameters(t *testing.T) {
	db := openTestBridgeDB(t)

	malicious := `'); DROP TABLE anime_snapshots; --`
	body := `{"anime_id":"z","snapshot_json":"{}","snapshot_hash":"` + malicious + `","modified_at":1}` + "\n"

	importFn := ImportAnimeSnapshots(db)
	if _, err := importFn(context.Background(), strings.NewReader(body)); err != nil {
		t.Fatalf("import: %v", err)
	}

	store := NewAnimeSnapshotStore(db)
	got, err := store.GetSnapshot(context.Background(), "z")
	if err != nil {
		t.Fatalf("GetSnapshot: %v", err)
	}
	if got.Hash != malicious {
		t.Fatalf("expected the metacharacter-laden hash to round-trip verbatim, got %q", got.Hash)
	}
}

func TestValidateAnimeSnapshotsTouchesNoDatabase(t *testing.T) {
	body := `{"anime_id":"a","snapshot_json":"{}","snapshot_hash":"h","modified_at":1}` + "\n"

	validateFn := ValidateAnimeSnapshots()
	count, err := validateFn(context.Background(), strings.NewReader(body))
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}
}

func TestValidateAnimeSnapshotsRejectsRecordWithEmptyPrimaryKey(t *testing.T) {
	body := `{"anime_id":"","snapshot_json":"{}","snapshot_hash":"h","modified_at":1}` + "\n"

	validateFn := ValidateAnimeSnapshots()
	if _, err := validateFn(context.Background(), strings.NewReader(body)); err == nil {
		t.Fatal("expected validation to reject a record with an empty anime_id")
	}
}
