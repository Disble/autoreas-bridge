package season

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
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

func TestExportSeasonsEmitsOneLinePerRowAndPropagatesAQueryError(t *testing.T) {
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

	if err := db.Close(); err != nil {
		t.Fatalf("close test db: %v", err)
	}
	if _, err := exportFn(context.Background(), &buf); err == nil {
		t.Fatal("expected export to propagate the query error from a closed database")
	}
}

// TestExportSeasonAnimesEmitsMetadataJSONField proves the bundle carries the
// confirmed lookup as its own nullable field: a recorded value exports as that
// value and an unrecorded row exports as null, never as an empty record.
func TestExportSeasonAnimesEmitsMetadataJSONField(t *testing.T) {
	db := openTestSeasonDB(t)
	if _, err := db.Exec(`INSERT INTO season_animes (id, season_id, raw_name, created_at, metadata_json) VALUES
		('sa-confirmed', 's1', 'Frieren', 1, ?),
		('sa-none', 's1', 'Dandadan', 2, NULL)`, confirmedMetadataJSON); err != nil {
		t.Fatalf("seed: %v", err)
	}

	var buf bytes.Buffer
	if _, err := ExportSeasonAnimes(db)(context.Background(), &buf); err != nil {
		t.Fatalf("export: %v", err)
	}

	byID := map[string]*string{}
	dec := json.NewDecoder(&buf)
	for dec.More() {
		var rec seasonAnimeRecord
		if err := dec.Decode(&rec); err != nil {
			t.Fatalf("decode exported line: %v", err)
		}
		byID[rec.ID] = rec.MetadataJSON
	}
	if got, ok := byID["sa-confirmed"]; !ok || got == nil || *got != confirmedMetadataJSON {
		t.Fatalf("sa-confirmed metadata = %v, want %q", got, confirmedMetadataJSON)
	}
	if got, ok := byID["sa-none"]; !ok || got != nil {
		t.Fatalf("sa-none metadata = %v, want null", got)
	}
}

// countingSeasonWriter records how many times Write was called, so
// TestExportSeasonAnimesStreamsOneLinePerRowAndCountsIt can assert one call per record instead
// of one call for the whole document.
type countingSeasonWriter struct {
	writes int
}

func (w *countingSeasonWriter) Write(p []byte) (int, error) {
	w.writes++
	return len(p), nil
}

func TestExportSeasonAnimesStreamsOneLinePerRowAndCountsIt(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	seeded := seedSeasonFixture(t, store)

	for i, name := range []string{"one", "two", "three"} {
		seedSeasonAnimeFixture(t, store, seeded.ID, "sa-"+name, name, time.UnixMilli(1_700_000_000_000+int64(i)))
	}

	exportFn := ExportSeasonAnimes(db)
	var buf bytes.Buffer
	cw := &countingSeasonWriter{}
	count, err := exportFn(context.Background(), io.MultiWriter(&buf, cw))
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
	if cw.writes != 3 {
		t.Fatalf("expected one write call per record (3), got %d -- rows are being accumulated instead of streamed", cw.writes)
	}

	var rec seasonAnimeRecord
	if err := json.Unmarshal(lines[0], &rec); err != nil {
		t.Fatalf("decode exported JSONL line: %v", err)
	}
	assertFreshSeasonAnimeRecord(t, rec, seeded.ID)
}

// assertFreshSeasonAnimeRecord checks the exported record of the fresh unmatched row sa-one.
func assertFreshSeasonAnimeRecord(t *testing.T, rec seasonAnimeRecord, seasonID string) {
	t.Helper()

	if rec.ID != "sa-one" {
		t.Fatalf("unexpected id: got %q want %q", rec.ID, "sa-one")
	}
	if rec.SeasonID != seasonID {
		t.Fatalf("unexpected season_id: got %q want %q", rec.SeasonID, seasonID)
	}
	if rec.MatchStatus != string(domain.MatchPending) {
		t.Fatalf("unexpected match_status: got %q want %q", rec.MatchStatus, domain.MatchPending)
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
