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

// TestSetSeasonAnimeMetadataRejectsMalformedPayloadWithoutWriting proves a
// caller can never persist garbage: malformed text and any valid JSON that is
// not an object are refused, and the row stays untouched at SQL NULL.
func TestSetSeasonAnimeMetadataRejectsMalformedPayloadWithoutWriting(t *testing.T) {
	payloads := []string{"not json", "[1, 2, 3]", "null"}

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

// TestSeasonAnimeMetadataIsSetReadClearedAndRefusedWhereItCannotLand drives one
// file-backed database: an unknown row and a created row refuse a write, a
// confirmed lookup set through the service reads back byte-identical from every
// read path and from a new store over the same file ("reopen the app"), the
// clear sentinel restores SQL NULL, and a legacy row reads the empty string.
func TestSeasonAnimeMetadataIsSetReadClearedAndRefusedWhereItCannotLand(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.db")
	db := openSeasonDBAt(t, path)
	svc := newMetadataService(db)
	_, rowID := seedMetadataRowFixture(t, db)
	ctx := context.Background()

	if err := svc.SetSeasonAnimeMetadata(ctx, "nope", confirmedMetadataJSON); !errors.Is(err, ErrSeasonAnimeNotFound) {
		t.Fatalf("unknown row = %v, want ErrSeasonAnimeNotFound", err)
	}
	assertCreatedRowRefusesMetadata(t, db, svc)

	if err := svc.SetSeasonAnimeMetadata(ctx, rowID, confirmedMetadataJSON); err != nil {
		t.Fatalf("SetSeasonAnimeMetadata: %v", err)
	}
	byID, err := NewSQLiteStore(db).SeasonAnimeByID(ctx, rowID)
	if err != nil || byID == nil || byID.MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("SeasonAnimeByID = %+v (%v), want byte-identical metadata %q", byID, err, confirmedMetadataJSON)
	}
	rows, err := svc.ListSeasonAnimes(ctx, "season-1")
	if err != nil || len(rows) != 2 || seasonAnimesByID(rows)[rowID].MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("ListSeasonAnimes = %+v (%v), want metadata %q on %s", rows, err, confirmedMetadataJSON, rowID)
	}
	reopened, err := NewSQLiteStore(openSeasonDBAt(t, path)).SeasonAnimeByID(ctx, rowID)
	if err != nil || reopened == nil || reopened.MetadataJSON != confirmedMetadataJSON {
		t.Fatalf("reopened metadata = %+v (%v), want %q", reopened, err, confirmedMetadataJSON)
	}

	if err := svc.SetSeasonAnimeMetadata(ctx, rowID, ""); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if got, err := NewSQLiteStore(db).SeasonAnimeByID(ctx, rowID); err != nil || got == nil || got.MetadataJSON != "" {
		t.Fatalf("metadata after clear = %+v (%v), want \"\"", got, err)
	}
	assertMetadataRawNull(t, db, rowID)

	if _, err := db.Exec(`INSERT INTO season_animes (id, season_id, raw_name, created_at)
		VALUES ('legacy-1', 'season-1', 'Legacy', 1)`); err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}
	if got, err := NewSQLiteStore(db).SeasonAnimeByID(ctx, "legacy-1"); err != nil || got == nil || got.MetadataJSON != "" {
		t.Fatalf("legacy metadata = %+v (%v), want \"\"", got, err)
	}
	assertMetadataRawNull(t, db, "legacy-1")
}

// assertCreatedRowRefusesMetadata seeds a row whose anime already exists and
// checks a metadata write is refused and leaves the column SQL NULL: its
// metadata already travelled at creation.
func assertCreatedRowRefusesMetadata(t *testing.T, db *sql.DB, svc *Service) {
	t.Helper()

	row := domain.NewSeasonAnime("sa-created", "season-1", "Dandadan", time.UnixMilli(1_700_000_000_000))
	row.Availability = domain.AvailabilityCreated
	row.AnimeID = "anime-1"
	if err := NewSQLiteStore(db).CreateSeasonAnime(context.Background(), row); err != nil {
		t.Fatalf("seed created row: %v", err)
	}
	err := svc.SetSeasonAnimeMetadata(context.Background(), "sa-created", confirmedMetadataJSON)
	if !errors.Is(err, ErrSeasonAnimeAlreadyCreated) {
		t.Fatalf("created row = %v, want ErrSeasonAnimeAlreadyCreated", err)
	}
	assertMetadataRawNull(t, db, "sa-created")
}
