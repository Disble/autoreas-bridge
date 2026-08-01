package season

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// seedSeasonFixture creates one season row and returns it, failing the test on
// any store error.
func seedSeasonFixture(t *testing.T, store *SQLiteStore) domain.Season {
	t.Helper()

	now := time.UnixMilli(1_700_000_000_000)
	s := domain.NewSeason("season-1", "Julio 2026", now)
	if err := store.CreateSeason(context.Background(), s); err != nil {
		t.Fatalf("seed season: %v", err)
	}
	return s
}

// seedSeasonAnimeFixture creates one season_animes row under seasonID and
// returns it, failing the test on any store error.
func seedSeasonAnimeFixture(t *testing.T, store *SQLiteStore, seasonID, id, rawName string, createdAt time.Time) domain.SeasonAnime {
	t.Helper()

	sa := domain.NewSeasonAnime(id, seasonID, rawName, createdAt)
	if err := store.CreateSeasonAnime(context.Background(), sa); err != nil {
		t.Fatalf("seed season anime %q: %v", id, err)
	}
	return sa
}

func TestExportSeasonsEmitsOneLinePerRow(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	seeded := seedSeasonFixture(t, store)

	exportFn := ExportSeasons(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("export seasons: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 season exported, got %d", count)
	}

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if len(lines) != 1 {
		t.Fatalf("expected exactly one JSONL line, got %d: %s", len(lines), buf.String())
	}

	var rec seasonRecord
	if err := json.Unmarshal(lines[0], &rec); err != nil {
		t.Fatalf("decode exported JSONL line: %v", err)
	}
	if rec.ID != seeded.ID {
		t.Fatalf("unexpected id: got %q want %q", rec.ID, seeded.ID)
	}
	if rec.Name != seeded.Name {
		t.Fatalf("unexpected name: got %q want %q", rec.Name, seeded.Name)
	}
	if rec.Status != string(seeded.Status) {
		t.Fatalf("unexpected status: got %q want %q", rec.Status, seeded.Status)
	}
	if rec.SelectionConfirmedAt != nil {
		t.Fatalf("expected selection_confirmed_at to stay null, got %v", *rec.SelectionConfirmedAt)
	}
	if rec.AppliedAt != nil {
		t.Fatalf("expected applied_at to stay null, got %v", *rec.AppliedAt)
	}
	if rec.ClosedAt != nil {
		t.Fatalf("expected closed_at to stay null, got %v", *rec.ClosedAt)
	}
}

func TestExportSeasonAnimesEmitsOneLinePerRow(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	seeded := seedSeasonFixture(t, store)
	sa := seedSeasonAnimeFixture(t, store, seeded.ID, "sa-1", "Some Anime", time.UnixMilli(1_700_000_000_000))

	exportFn := ExportSeasonAnimes(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("export season animes: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 season anime exported, got %d", count)
	}

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if len(lines) != 1 {
		t.Fatalf("expected exactly one JSONL line, got %d: %s", len(lines), buf.String())
	}

	var rec seasonAnimeRecord
	if err := json.Unmarshal(lines[0], &rec); err != nil {
		t.Fatalf("decode exported JSONL line: %v", err)
	}
	if rec.ID != sa.ID {
		t.Fatalf("unexpected id: got %q want %q", rec.ID, sa.ID)
	}
	if rec.SeasonID != sa.SeasonID {
		t.Fatalf("unexpected season_id: got %q want %q", rec.SeasonID, sa.SeasonID)
	}
	if rec.MatchStatus != string(sa.MatchStatus) {
		t.Fatalf("unexpected match_status: got %q want %q", rec.MatchStatus, sa.MatchStatus)
	}
	// matched_slug and anime_id are populated by CreateSeasonAnime as empty
	// strings, not NULL, for a fresh unmatched row -- only the columns
	// CreateSeasonAnime omits entirely (or nullifies via a *Ptr helper) come
	// back as SQL NULL. first_available_at is one of the omitted columns.
	if rec.MatchedSlug == nil || *rec.MatchedSlug != "" {
		t.Fatalf("expected matched_slug to be an empty string, got %v", rec.MatchedSlug)
	}
	if rec.AnimeID == nil || *rec.AnimeID != "" {
		t.Fatalf("expected anime_id to be an empty string, got %v", rec.AnimeID)
	}
	if rec.PremiereGrade != nil {
		t.Fatalf("expected premiere_grade to stay null, got %v", *rec.PremiereGrade)
	}
	if rec.FirstAvailableAt != nil {
		t.Fatalf("expected first_available_at to stay null, got %v", *rec.FirstAvailableAt)
	}
}

// countingSeasonWriter records how many times Write was called, so
// TestSeasonExportWritesIncrementally can assert one call per record instead
// of one call for the whole document.
type countingSeasonWriter struct {
	writes int
}

func (w *countingSeasonWriter) Write(p []byte) (int, error) {
	w.writes++
	return len(p), nil
}

func TestExportFuncReportsCountItWrote(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	seeded := seedSeasonFixture(t, store)

	for i, name := range []string{"one", "two", "three"} {
		seedSeasonAnimeFixture(t, store, seeded.ID, "sa-"+name, name, time.UnixMilli(1_700_000_000_000+int64(i)))
	}

	exportFn := ExportSeasonAnimes(db)
	var buf bytes.Buffer
	count, err := exportFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("export season animes: %v", err)
	}

	lines := bytes.Split(bytes.TrimRight(buf.Bytes(), "\n"), []byte("\n"))
	if count != len(lines) {
		t.Fatalf("returned count %d does not match decoded JSONL line count %d", count, len(lines))
	}
	if count != 3 {
		t.Fatalf("expected 3 season animes exported, got %d", count)
	}
}

func TestSeasonExportWritesIncrementally(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	seeded := seedSeasonFixture(t, store)

	for i, name := range []string{"one", "two", "three"} {
		seedSeasonAnimeFixture(t, store, seeded.ID, "sa-"+name, name, time.UnixMilli(1_700_000_000_000+int64(i)))
	}

	exportFn := ExportSeasonAnimes(db)
	cw := &countingSeasonWriter{}
	count, err := exportFn(context.Background(), cw)
	if err != nil {
		t.Fatalf("export season animes: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected count 3, got %d", count)
	}
	if cw.writes != 3 {
		t.Fatalf("expected one write call per record (3), got %d -- rows are being accumulated instead of streamed", cw.writes)
	}
}

func TestExportSeasonsPropagatesQueryError(t *testing.T) {
	db := openTestSeasonDB(t)
	if err := db.Close(); err != nil {
		t.Fatalf("close test db: %v", err)
	}

	exportFn := ExportSeasons(db)
	var buf bytes.Buffer
	_, err := exportFn(context.Background(), &buf)
	if err == nil {
		t.Fatal("expected export to propagate the query error from a closed database")
	}
}
