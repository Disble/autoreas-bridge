package season

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// seedSeasonRow creates one seasons row via the store, used by backup import
// tests to establish a pre-import baseline row.
func seedSeasonRow(t *testing.T, db *sql.DB, s domain.Season) {
	t.Helper()
	if err := NewSQLiteStore(db).CreateSeason(context.Background(), s); err != nil {
		t.Fatalf("seed season %q: %v", s.ID, err)
	}
}

func TestImportSeasonsReplacesExistingRows(t *testing.T) {
	db := openTestSeasonDB(t)
	seedSeasonRow(t, db, domain.NewSeason("old-season", "Old", time.UnixMilli(1)))

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	rec := seasonRecord{
		ID: "new-season", Name: "New", MinApprovalGrade: 4, Slots: 12,
		Status: "open", OrderingDraftJSON: "", CreatedAt: 2,
	}
	if err := enc.Encode(rec); err != nil {
		t.Fatalf("encode fixture: %v", err)
	}

	importFn := ImportSeasons(db)
	count, err := importFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}

	rows, err := db.Query(`SELECT id FROM seasons`)
	if err != nil {
		t.Fatalf("query seasons: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan: %v", err)
		}
		ids = append(ids, id)
	}
	if len(ids) != 1 || ids[0] != "new-season" {
		t.Fatalf("expected exactly [new-season] after full refresh, got %v", ids)
	}
}

func TestImportSeasonAnimesReplacesExistingRows(t *testing.T) {
	db := openTestSeasonDB(t)
	if _, err := db.Exec(`INSERT INTO season_animes (id, season_id, raw_name, created_at) VALUES ('old', 'season-1', 'Old Show', 1)`); err != nil {
		t.Fatalf("seed season_animes: %v", err)
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	rec := seasonAnimeRecord{ID: "new", SeasonID: "season-1", RawName: "New Show", MatchStatus: "pending", Availability: "waiting", Consideration: "none", CreatedAt: 2}
	if err := enc.Encode(rec); err != nil {
		t.Fatalf("encode fixture: %v", err)
	}

	importFn := ImportSeasonAnimes(db)
	count, err := importFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}

	rows, err := db.Query(`SELECT id FROM season_animes`)
	if err != nil {
		t.Fatalf("query season_animes: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan: %v", err)
		}
		ids = append(ids, id)
	}
	if len(ids) != 1 || ids[0] != "new" {
		t.Fatalf("expected exactly [new] after full refresh, got %v", ids)
	}
}

func TestImportSeasonsRoundTripsNullableColumnsAsNull(t *testing.T) {
	srcDB := openTestSeasonDB(t)
	seedSeasonRow(t, srcDB, domain.NewSeason("season-1", "Julio", time.UnixMilli(1)))
	// NewSeason leaves selection_confirmed_at/applied_at/closed_at NULL.

	var buf bytes.Buffer
	if _, err := ExportSeasons(srcDB)(context.Background(), &buf); err != nil {
		t.Fatalf("export: %v", err)
	}

	dstDB := openTestSeasonDB(t)
	if _, err := ImportSeasons(dstDB)(context.Background(), &buf); err != nil {
		t.Fatalf("import: %v", err)
	}

	var selectionConfirmedAt sql.NullInt64
	if err := dstDB.QueryRow(`SELECT selection_confirmed_at FROM seasons WHERE id = 'season-1'`).Scan(&selectionConfirmedAt); err != nil {
		t.Fatalf("query: %v", err)
	}
	if selectionConfirmedAt.Valid {
		t.Fatalf("expected selection_confirmed_at to remain NULL, got %v", selectionConfirmedAt.Int64)
	}
}

func TestImportSeasonAnimesRoundTripsEveryColumn(t *testing.T) {
	srcDB := openTestSeasonDB(t)
	if _, err := srcDB.Exec(`
		INSERT INTO season_animes (id, season_id, raw_name, match_status, matched_slug, match_candidates_json,
			availability, first_available_at, available_episodes, anime_id, premiere_grade, grade_source,
			post_season_grade, rated_at, skip_grading, consideration, last_checked_at, created_at)
		VALUES ('a1', 's1', 'Show A', 'matched', 'show-a', '["show-a"]', 'available', 100, 12,
			'anime-a', 5, 'auto', 4, 200, 0, 'considered', 300, 1)
	`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	var buf bytes.Buffer
	if _, err := ExportSeasonAnimes(srcDB)(context.Background(), &buf); err != nil {
		t.Fatalf("export: %v", err)
	}

	dstDB := openTestSeasonDB(t)
	if _, err := ImportSeasonAnimes(dstDB)(context.Background(), &buf); err != nil {
		t.Fatalf("import: %v", err)
	}

	var matchedSlug, animeID sql.NullString
	var premiereGrade sql.NullInt64
	if err := dstDB.QueryRow(`SELECT matched_slug, anime_id, premiere_grade FROM season_animes WHERE id = 'a1'`).
		Scan(&matchedSlug, &animeID, &premiereGrade); err != nil {
		t.Fatalf("query: %v", err)
	}
	if !matchedSlug.Valid || matchedSlug.String != "show-a" {
		t.Fatalf("expected matched_slug 'show-a', got %+v", matchedSlug)
	}
	if !animeID.Valid || animeID.String != "anime-a" {
		t.Fatalf("expected anime_id 'anime-a', got %+v", animeID)
	}
	if !premiereGrade.Valid || premiereGrade.Int64 != 5 {
		t.Fatalf("expected premiere_grade 5, got %+v", premiereGrade)
	}
}

func TestSeasonImportDecodesIncrementally(t *testing.T) {
	db := openTestSeasonDB(t)

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for i := range 5 {
		status := "closed"
		if i == 0 {
			status = "open"
		}
		rec := seasonRecord{ID: string(rune('a' + i)), Name: "n", MinApprovalGrade: 4, Slots: 12, Status: status, CreatedAt: int64(i)}
		if err := enc.Encode(rec); err != nil {
			t.Fatalf("encode: %v", err)
		}
	}
	full := buf.Bytes()
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
	failing := &boundedReader{data: full, limit: offset, failure: errors.New("stream broke")}

	count, err := ImportSeasons(db)(context.Background(), failing)
	if err == nil {
		t.Fatal("expected the import to propagate the reader's error")
	}
	if count != 3 {
		t.Fatalf("expected count 3, got %d", count)
	}
}

// boundedReader allows reading at most limit bytes, then fails.
type boundedReader struct {
	data    []byte
	pos     int
	limit   int
	failure error
}

func (b *boundedReader) Read(p []byte) (int, error) {
	if b.pos >= b.limit {
		return 0, b.failure
	}
	remaining := b.limit - b.pos
	if len(p) > remaining {
		p = p[:remaining]
	}
	n := copy(p, b.data[b.pos:])
	b.pos += n
	return n, nil
}

func TestValidateSeasonsRejectsMalformedLine(t *testing.T) {
	validateFn := ValidateSeasons()
	_, err := validateFn(context.Background(), bytes.NewBufferString("not json\n"))
	if err == nil {
		t.Fatal("expected validation to reject a malformed JSONL line")
	}
}

func TestImportSeasonsReportsTheCountItApplied(t *testing.T) {
	db := openTestSeasonDB(t)

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for i := range 3 {
		status := "closed"
		if i == 0 {
			status = "open"
		}
		rec := seasonRecord{ID: string(rune('a' + i)), Name: "n", MinApprovalGrade: 4, Slots: 12, Status: status, CreatedAt: int64(i)}
		if err := enc.Encode(rec); err != nil {
			t.Fatalf("encode: %v", err)
		}
	}

	count, err := ImportSeasons(db)(context.Background(), &buf)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected count 3, got %d", count)
	}

	var rowCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM seasons`).Scan(&rowCount); err != nil {
		t.Fatalf("count: %v", err)
	}
	if rowCount != 3 {
		t.Fatalf("expected 3 rows in seasons, got %d", rowCount)
	}
}
