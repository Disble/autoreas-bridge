package watchhistory

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
)

func TestExportWatchHistoryEmitsOneLinePerRow(t *testing.T) {
	db := openStoreTestDB(t)
	res, err := db.ExecContext(context.Background(), `
		INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
		VALUES ('anime-1', 'Anime One', 3, 1, 1000, 'desktop', NULL)
	`)
	if err != nil {
		t.Fatalf("seed watch_history row: %v", err)
	}
	wantID, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("read seeded id: %v", err)
	}

	exportFn := ExportWatchHistory(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("export watch_history: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 row exported, got %d", count)
	}

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if len(lines) != 1 {
		t.Fatalf("expected exactly one JSONL line, got %d: %s", len(lines), buf.String())
	}

	var rec watchHistoryRecord
	if err := json.Unmarshal(lines[0], &rec); err != nil {
		t.Fatalf("decode exported JSONL line: %v", err)
	}
	if rec.ID != wantID {
		t.Fatalf("unexpected id: got %d want %d", rec.ID, wantID)
	}
	if rec.AnimeID != "anime-1" {
		t.Fatalf("unexpected anime_id: got %q", rec.AnimeID)
	}
	if rec.AnimeName != "Anime One" {
		t.Fatalf("unexpected anime_name: got %q", rec.AnimeName)
	}
	if rec.Episode != 3 {
		t.Fatalf("unexpected episode: got %d", rec.Episode)
	}
	if rec.Cycle != 1 {
		t.Fatalf("unexpected cycle: got %d", rec.Cycle)
	}
	if rec.WatchedAtMS != 1000 {
		t.Fatalf("unexpected watched_at_ms: got %d", rec.WatchedAtMS)
	}
	if rec.Source != "desktop" {
		t.Fatalf("unexpected source: got %q", rec.Source)
	}
	if rec.SourceActivityID != nil {
		t.Fatalf("expected source_activity_id to stay null for a live write, got %v", *rec.SourceActivityID)
	}
}

func TestExportWatchHistoryRoundTripsNonNullSourceActivityID(t *testing.T) {
	db := openStoreTestDB(t)
	if _, err := db.ExecContext(context.Background(), `
		INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
		VALUES ('anime-1', 'Anime One', 1, 1, 1000, 'backfill', 42)
	`); err != nil {
		t.Fatalf("seed watch_history row: %v", err)
	}

	exportFn := ExportWatchHistory(db)
	var buf bytes.Buffer
	if _, err := exportFn(context.Background(), &buf); err != nil {
		t.Fatalf("export watch_history: %v", err)
	}

	var rec watchHistoryRecord
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &rec); err != nil {
		t.Fatalf("decode exported JSONL line: %v", err)
	}
	if rec.SourceActivityID == nil || *rec.SourceActivityID != 42 {
		t.Fatalf("expected source_activity_id 42, got %v", rec.SourceActivityID)
	}
}

// countingWatchHistoryWriter records how many times Write was called, so
// TestExportWatchHistoryWritesIncrementally can assert one call per record
// instead of one call for the whole document.
type countingWatchHistoryWriter struct {
	writes int
}

func (w *countingWatchHistoryWriter) Write(p []byte) (int, error) {
	w.writes++
	return len(p), nil
}

func TestExportWatchHistoryWritesIncrementally(t *testing.T) {
	db := openStoreTestDB(t)
	for i := range 3 {
		if _, err := db.ExecContext(context.Background(), `
			INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
			VALUES ('anime-1', 'Anime One', ?, 1, ?, 'desktop', NULL)
		`, i+1, 1000+i); err != nil {
			t.Fatalf("seed watch_history row %d: %v", i, err)
		}
	}

	exportFn := ExportWatchHistory(db)
	cw := &countingWatchHistoryWriter{}
	count, err := exportFn(context.Background(), cw)
	if err != nil {
		t.Fatalf("export watch_history: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected count 3, got %d", count)
	}
	if cw.writes != 3 {
		t.Fatalf("expected one write call per record (3), got %d -- rows are being accumulated instead of streamed", cw.writes)
	}
}

func TestExportWatchHistoryPropagatesQueryError(t *testing.T) {
	db := openStoreTestDB(t)
	if err := db.Close(); err != nil {
		t.Fatalf("close test db: %v", err)
	}

	exportFn := ExportWatchHistory(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err == nil {
		t.Fatal("expected export to propagate the query error from a closed database")
	}
	if count != 0 {
		t.Fatalf("expected a query failure to report count 0, got %d", count)
	}
}
