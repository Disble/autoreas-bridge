package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
)

// seedAnimeSnapshotFixture writes the real stored-shape fixture (cloned per
// project rule 7 -- the testdata file itself is never mutated) into db as one
// anime_snapshots row and returns the raw snapshot_json bytes it wrote.
func seedAnimeSnapshotFixture(t *testing.T, db anime.SnapshotStore) []byte {
	t.Helper()

	original, err := os.ReadFile(filepath.Join("..", "anime", "store", "testdata", "real_snapshot_shape.jsonl"))
	if err != nil {
		t.Fatalf("read cloned real snapshot fixture: %v", err)
	}
	clonedPath := filepath.Join(t.TempDir(), "real_snapshot_shape.jsonl")
	if err := os.WriteFile(clonedPath, original, 0o600); err != nil {
		t.Fatalf("write cloned fixture into t.TempDir(): %v", err)
	}
	canonicalJSON, err := os.ReadFile(clonedPath)
	if err != nil {
		t.Fatalf("read cloned fixture: %v", err)
	}
	canonicalJSON = bytes.TrimRight(canonicalJSON, "\n")

	record := anime.SnapshotRecord{
		AnimeID:       "10wvY4Q7seDrCiek",
		CanonicalJSON: canonicalJSON,
		Hash:          anime.HashSnapshot(canonicalJSON),
		ModifiedAt:    1_700_000_000_000,
	}
	if err := db.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{record.AnimeID: record}, nil); err != nil {
		t.Fatalf("seed anime snapshot fixture: %v", err)
	}
	return canonicalJSON
}

func TestExportAnimeSnapshotsEmitsOneLinePerRow(t *testing.T) {
	db := openTestBridgeDB(t)
	store := NewAnimeSnapshotStore(db)
	canonicalJSON := seedAnimeSnapshotFixture(t, store)

	exportFn := ExportAnimeSnapshots(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("export anime snapshots: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 row exported, got %d", count)
	}

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if len(lines) != 1 {
		t.Fatalf("expected exactly one JSONL line, got %d: %s", len(lines), buf.String())
	}

	var rec animeSnapshotRecord
	if err := json.Unmarshal(lines[0], &rec); err != nil {
		t.Fatalf("decode exported JSONL line: %v", err)
	}
	if rec.AnimeID != "10wvY4Q7seDrCiek" {
		t.Fatalf("unexpected anime_id: %q", rec.AnimeID)
	}
	if rec.SnapshotJSON != string(canonicalJSON) {
		t.Fatalf("snapshot_json did not survive byte-identical:\nwant: %s\ngot:  %s", canonicalJSON, rec.SnapshotJSON)
	}
	if rec.ModifiedAt != 1_700_000_000_000 {
		t.Fatalf("unexpected modified_at: %d", rec.ModifiedAt)
	}
}

func TestExportAnimeSnapshotsReturnsRowCount(t *testing.T) {
	db := openTestBridgeDB(t)
	store := NewAnimeSnapshotStore(db)

	seed := map[string]anime.SnapshotRecord{
		"one": {AnimeID: "one", CanonicalJSON: []byte(`{"id":"one"}`), Hash: anime.HashSnapshot([]byte(`{"id":"one"}`))},
		"two": {AnimeID: "two", CanonicalJSON: []byte(`{"id":"two"}`), Hash: anime.HashSnapshot([]byte(`{"id":"two"}`))},
	}
	if err := store.ReplaceBaseline(context.Background(), seed, nil); err != nil {
		t.Fatalf("seed anime snapshots: %v", err)
	}

	exportFn := ExportAnimeSnapshots(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("export anime snapshots: %v", err)
	}
	if count != len(seed) {
		t.Fatalf("expected count %d, got %d", len(seed), count)
	}

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if len(lines) != len(seed) {
		t.Fatalf("expected %d JSONL lines, got %d", len(seed), len(lines))
	}
}

// countingWriter records how many times Write was called, so
// TestAnimeExportWritesIncrementally can assert one call per record instead
// of one call for the whole document (mutation guard 7).
type countingWriter struct {
	writes int
}

func (w *countingWriter) Write(p []byte) (int, error) {
	w.writes++
	return len(p), nil
}

func TestAnimeExportWritesIncrementally(t *testing.T) {
	db := openTestBridgeDB(t)
	store := NewAnimeSnapshotStore(db)

	seed := map[string]anime.SnapshotRecord{
		"one":   {AnimeID: "one", CanonicalJSON: []byte(`{"id":"one"}`), Hash: anime.HashSnapshot([]byte(`{"id":"one"}`))},
		"two":   {AnimeID: "two", CanonicalJSON: []byte(`{"id":"two"}`), Hash: anime.HashSnapshot([]byte(`{"id":"two"}`))},
		"three": {AnimeID: "three", CanonicalJSON: []byte(`{"id":"three"}`), Hash: anime.HashSnapshot([]byte(`{"id":"three"}`))},
	}
	if err := store.ReplaceBaseline(context.Background(), seed, nil); err != nil {
		t.Fatalf("seed anime snapshots: %v", err)
	}

	exportFn := ExportAnimeSnapshots(db)
	cw := &countingWriter{}
	count, err := exportFn(context.Background(), cw)
	if err != nil {
		t.Fatalf("export anime snapshots: %v", err)
	}
	if count != len(seed) {
		t.Fatalf("expected count %d, got %d", len(seed), count)
	}
	if cw.writes != len(seed) {
		t.Fatalf("expected one write call per record (%d), got %d -- rows are being accumulated instead of streamed", len(seed), cw.writes)
	}
}

func TestExportAnimeSnapshotsPropagatesQueryError(t *testing.T) {
	db := openTestBridgeDB(t)
	closeTestDB(t, db)

	exportFn := ExportAnimeSnapshots(db)
	var buf bytes.Buffer
	_, err := exportFn(context.Background(), &buf)
	if err == nil {
		t.Fatal("expected export to propagate the query error from a closed database")
	}
}
