package season

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"

	"autoreas-bridge/internal/season/domain"
)

// newMetadataService wires a real service over a real temp-SQLite store, so a
// metadata write is asserted at the storage boundary the app actually uses.
func newMetadataService(db *sql.DB) *Service {
	return NewService(NewSQLiteStore(db), func() time.Time {
		return time.UnixMilli(1_700_000_000_000)
	}, func() string { return "generated-id" }, nil)
}

// seedMetadataRowFixture seeds one open season and one available row and
// returns their ids.
func seedMetadataRowFixture(t *testing.T, db *sql.DB) (seasonID, rowID string) {
	t.Helper()
	store := NewSQLiteStore(db)
	seedSeasonFixture(t, store)
	seedSeasonAnimeFixture(t, store, "season-1", "sa-1", "Frieren", time.UnixMilli(1_700_000_000_000))
	return "season-1", "sa-1"
}

// openSeasonDBAt opens a temp-path SQLite database and applies the season
// schema, so a second store can be opened over the same file ("reopen the app").
func openSeasonDBAt(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite %s: %v", path, err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	ensureSeasonSchema(t, db, "open "+filepath.Base(path))
	return db
}

// TestServiceSetSeasonAnimeMetadataRoundTripsThroughStore proves a confirmed
// lookup set through the service is read back byte-identically by every read
// path the Season screen uses: the store's by-id read and the service's list.
func TestServiceSetSeasonAnimeMetadataRoundTripsThroughStore(t *testing.T) {
	db := openTestSeasonDB(t)
	svc := newMetadataService(db)
	_, rowID := seedMetadataRowFixture(t, db)
	ctx := context.Background()

	if err := svc.SetSeasonAnimeMetadata(ctx, rowID, confirmedMetadataJSON); err != nil {
		t.Fatalf("SetSeasonAnimeMetadata: %v", err)
	}

	byID, err := NewSQLiteStore(db).SeasonAnimeByID(ctx, rowID)
	if err != nil || byID == nil {
		t.Fatalf("SeasonAnimeByID: %v (%+v)", err, byID)
	}
	if byID.MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("SeasonAnimeByID metadata = %q, want byte-identical %q", byID.MetadataJSON, confirmedMetadataJSON)
	}

	rows, err := svc.ListSeasonAnimes(ctx, "season-1")
	if err != nil || len(rows) != 1 {
		t.Fatalf("ListSeasonAnimes: %v (%+v)", err, rows)
	}
	if rows[0].MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("ListSeasonAnimes metadata = %q, want %q", rows[0].MetadataJSON, confirmedMetadataJSON)
	}
}

// TestSeasonAnimeMetadataSurvivesNewStoreOverSameFile is the "leaving the
// Season screen and reopening the app" claim: the value lives in the file, not
// in process memory, so a brand-new store over the same file reads it back.
func TestSeasonAnimeMetadataSurvivesNewStoreOverSameFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.db")

	first := openSeasonDBAt(t, path)
	_, rowID := seedMetadataRowFixture(t, first)
	if err := newMetadataService(first).SetSeasonAnimeMetadata(context.Background(), rowID, confirmedMetadataJSON); err != nil {
		t.Fatalf("SetSeasonAnimeMetadata: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close first store: %v", err)
	}

	second := openSeasonDBAt(t, path)
	got, err := NewSQLiteStore(second).SeasonAnimeByID(context.Background(), rowID)
	if err != nil || got == nil {
		t.Fatalf("SeasonAnimeByID after reopen: %v (%+v)", err, got)
	}
	if got.MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("reopened metadata = %q, want %q", got.MetadataJSON, confirmedMetadataJSON)
	}
}

// TestSeasonAnimeMetadataLegacyRowReadsEmpty proves a row that never had a
// lookup reads back as the empty "not recorded" string, and stays SQL NULL
// rather than an empty record.
func TestSeasonAnimeMetadataLegacyRowReadsEmpty(t *testing.T) {
	db := openTestSeasonDB(t)
	if _, err := db.Exec(`INSERT INTO season_animes (id, season_id, raw_name, created_at)
		VALUES ('legacy-1', 'season-1', 'Legacy', 1)`); err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}

	got, err := NewSQLiteStore(db).SeasonAnimeByID(context.Background(), "legacy-1")
	if err != nil || got == nil {
		t.Fatalf("SeasonAnimeByID: %v (%+v)", err, got)
	}
	if got.MetadataJSON != "" {
		t.Fatalf("legacy metadata = %q, want \"\"", got.MetadataJSON)
	}
	assertMetadataRawNull(t, db, "legacy-1")
}

// TestSetSeasonAnimeMetadataRejectsMalformedPayloadWithoutWriting proves a
// caller can never persist garbage: malformed text and any valid JSON that is
// not an object are refused, and the row stays untouched at SQL NULL.
func TestSetSeasonAnimeMetadataRejectsMalformedPayloadWithoutWriting(t *testing.T) {
	payloads := []string{"not json", "[1, 2, 3]", `"a string"`, "42", "null", `{"unterminated":`}

	for _, payload := range payloads {
		t.Run(payload, func(t *testing.T) {
			db := openTestSeasonDB(t)
			svc := newMetadataService(db)
			_, rowID := seedMetadataRowFixture(t, db)

			err := svc.SetSeasonAnimeMetadata(context.Background(), rowID, payload)
			if !errors.Is(err, ErrInvalidMetadata) {
				t.Fatalf("SetSeasonAnimeMetadata(%q) = %v, want ErrInvalidMetadata", payload, err)
			}
			assertMetadataRawNull(t, db, rowID)
		})
	}
}

// TestSetSeasonAnimeMetadataEmptyStringClears proves the clear sentinel removes
// a recorded lookup, leaving SQL NULL ("not recorded") again.
func TestSetSeasonAnimeMetadataEmptyStringClears(t *testing.T) {
	db := openTestSeasonDB(t)
	svc := newMetadataService(db)
	_, rowID := seedMetadataRowFixture(t, db)
	ctx := context.Background()

	if err := svc.SetSeasonAnimeMetadata(ctx, rowID, confirmedMetadataJSON); err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := svc.SetSeasonAnimeMetadata(ctx, rowID, ""); err != nil {
		t.Fatalf("clear: %v", err)
	}

	got, err := NewSQLiteStore(db).SeasonAnimeByID(ctx, rowID)
	if err != nil || got == nil {
		t.Fatalf("SeasonAnimeByID: %v (%+v)", err, got)
	}
	if got.MetadataJSON != "" {
		t.Fatalf("metadata after clear = %q, want \"\"", got.MetadataJSON)
	}
	assertMetadataRawNull(t, db, rowID)
}

// TestSetSeasonAnimeMetadataUnknownRowIsAnError proves an unknown row is an
// error, never a silent no-op that drops the write.
func TestSetSeasonAnimeMetadataUnknownRowIsAnError(t *testing.T) {
	db := openTestSeasonDB(t)
	err := newMetadataService(db).SetSeasonAnimeMetadata(context.Background(), "nope", confirmedMetadataJSON)
	if !errors.Is(err, ErrSeasonAnimeNotFound) {
		t.Fatalf("unknown row = %v, want ErrSeasonAnimeNotFound", err)
	}
}

// TestSetSeasonAnimeMetadataRejectsCreatedRow proves a row whose anime already
// exists is refused: its metadata already travelled at creation, so a later
// write could only diverge the row from the anime.
func TestSetSeasonAnimeMetadataRejectsCreatedRow(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	seedSeasonFixture(t, store)
	row := domain.NewSeasonAnime("sa-1", "season-1", "Frieren", time.UnixMilli(1_700_000_000_000))
	row.Availability = domain.AvailabilityCreated
	row.AnimeID = "anime-1"
	if err := store.CreateSeasonAnime(context.Background(), row); err != nil {
		t.Fatalf("seed created row: %v", err)
	}

	err := newMetadataService(db).SetSeasonAnimeMetadata(context.Background(), "sa-1", confirmedMetadataJSON)
	if !errors.Is(err, ErrSeasonAnimeAlreadyCreated) {
		t.Fatalf("created row = %v, want ErrSeasonAnimeAlreadyCreated", err)
	}
	assertMetadataRawNull(t, db, "sa-1")
}

// TestSQLiteStoreSeasonAnimeCreatedRowKeepsMetadata proves the INSERT carries a
// confirmed lookup and the created-row update that follows keeps it, so the
// durable row still describes what the user confirmed.
func TestSQLiteStoreSeasonAnimeCreatedRowKeepsMetadata(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	seedSeasonFixture(t, store)
	ctx := context.Background()

	sa := domain.NewSeasonAnime("sa-1", "season-1", "Frieren", time.UnixMilli(1_700_000_000_000))
	sa.MetadataJSON = confirmedMetadataJSON
	if err := store.CreateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("CreateSeasonAnime: %v", err)
	}
	inserted, err := store.SeasonAnimeByID(ctx, "sa-1")
	if err != nil || inserted == nil {
		t.Fatalf("SeasonAnimeByID after insert: %v (%+v)", err, inserted)
	}
	if inserted.MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("INSERT dropped metadata: %q", inserted.MetadataJSON)
	}

	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = "anime-1"
	if err := store.UpdateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("UpdateSeasonAnime created: %v", err)
	}

	got, err := store.SeasonAnimeByID(ctx, "sa-1")
	if err != nil || got == nil {
		t.Fatalf("SeasonAnimeByID: %v (%+v)", err, got)
	}
	if got.MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("created row lost metadata: %q", got.MetadataJSON)
	}
}
