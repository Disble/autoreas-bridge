package main

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/backup"
	bridgeSync "autoreas-bridge/internal/sync"
)

// appBackupImportTestApp opens a fully bootstrapped bridge database at a
// known, fixed path (needed so ConfirmBackupImport's restore point lands
// somewhere assertable) and wires resolveBridgeDBPath to that path.
func appBackupImportTestApp(t *testing.T) (*App, string) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	app := newAppTestApp(t)
	app.bridgeDB = db
	app.resolveBridgeDBPath = func() (string, error) { return dbPath, nil }
	app.pickBundle = func(context.Context, string) (string, error) {
		return "", errors.New("pickBundle not stubbed for this test")
	}
	return app, dbPath
}

// hashFile returns the hex SHA-256 of path's bytes.
func hashFile(t *testing.T, path string) string {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file %q: %v", path, err)
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// assertNoRestorePoint fails the test if any restore point file exists
// beside dbPath.
func assertNoRestorePoint(t *testing.T, dbPath string) {
	t.Helper()

	entries, err := os.ReadDir(filepath.Dir(dbPath))
	if err != nil {
		t.Fatalf("read db dir: %v", err)
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), bridgeSync.RestorePointPrefix) {
			t.Fatalf("expected no restore point file, found %q", e.Name())
		}
	}
}

// seedAnimeSnapshot inserts one anime_snapshots row via the real snapshot
// store, so bundles built from it exercise the real export shape.
func seedAnimeSnapshot(t *testing.T, db *sql.DB, animeID string) {
	t.Helper()

	body := []byte(fmt.Sprintf(`{"id":%q}`, animeID))
	store := bridgeSync.NewAnimeSnapshotStore(db)
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		animeID: {AnimeID: animeID, CanonicalJSON: body, Hash: anime.HashSnapshot(body)},
	}, nil); err != nil {
		t.Fatalf("seed anime snapshot %q: %v", animeID, err)
	}
}

// buildTestBundle exports a fresh, valid three-group bundle from a scratch
// database, exercising the real export write path end to end.
func buildTestBundle(t *testing.T) string {
	t.Helper()

	producer := appBackupTestDB(t)
	result, err := producer.ExportBackup()
	if err != nil {
		t.Fatalf("export test bundle: %v", err)
	}
	return result.DestinationPath
}

// buildTestBundleWithAnime is buildTestBundle plus one seeded, identifiable
// anime_snapshots row, so a test can tell the bundle's data apart from a
// target database's pre-import data.
func buildTestBundleWithAnime(t *testing.T, animeID string) string {
	t.Helper()

	producer := appBackupTestDB(t)
	seedAnimeSnapshot(t, producer.bridgeDB, animeID)
	result, err := producer.ExportBackup()
	if err != nil {
		t.Fatalf("export test bundle: %v", err)
	}
	return result.DestinationPath
}

// computeTestBundleChecksum mirrors internal/backup's unexported
// computeBundleChecksum -- the formula is a plain, documented hash of the
// ordered (name, recordCount, sha256) tuples, not a secret, so a
// package-main test hand-building a bundle has to reproduce it.
func computeTestBundleChecksum(contexts []backup.ContextEntry) string {
	h := sha256.New()
	for _, c := range contexts {
		_, _ = fmt.Fprintf(h, "%s:%d:%s\n", c.Name, c.RecordCount, c.SHA256)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// writeHandBuiltBundle writes a valid bundle at dest whose data/{name}.jsonl
// entries are exactly groupLines, bypassing the real export path entirely so
// a test can construct records the real export could never produce -- such
// as a duplicate primary key inside one group.
func writeHandBuiltBundle(t *testing.T, dest string, groupLines map[string][]string) {
	t.Helper()

	f, err := os.Create(dest)
	if err != nil {
		t.Fatalf("create bundle file %q: %v", dest, err)
	}
	zw := zip.NewWriter(f)

	names := make([]string, 0, len(groupLines))
	for name := range groupLines {
		names = append(names, name)
	}
	sort.Strings(names)

	contexts := make([]backup.ContextEntry, 0, len(names))
	for _, name := range names {
		lines := groupLines[name]
		var body strings.Builder
		for _, line := range lines {
			body.WriteString(line)
			body.WriteByte('\n')
		}
		w, entryErr := zw.Create("data/" + name + ".jsonl")
		if entryErr != nil {
			t.Fatalf("create data entry %q: %v", name, entryErr)
		}
		if _, writeErr := io.WriteString(w, body.String()); writeErr != nil {
			t.Fatalf("write data entry %q: %v", name, writeErr)
		}
		sum := sha256.Sum256([]byte(body.String()))
		contexts = append(contexts, backup.ContextEntry{Name: name, RecordCount: len(lines), SHA256: hex.EncodeToString(sum[:])})
	}

	manifest := backup.Manifest{
		FormatVersion:  backup.SupportedFormatVersion,
		BridgeVersion:  "dev",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Contexts:       contexts,
		BundleChecksum: computeTestBundleChecksum(contexts),
	}
	mw, err := zw.Create("manifest.json")
	if err != nil {
		t.Fatalf("create manifest entry: %v", err)
	}
	if err := json.NewEncoder(mw).Encode(manifest); err != nil {
		t.Fatalf("encode manifest: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close bundle file: %v", err)
	}
}

func TestPreviewBackupImportRejectsEmptyDialogResult(t *testing.T) {
	app, dbPath := appBackupImportTestApp(t)
	app.pickBundle = func(context.Context, string) (string, error) { return "", nil }

	before := hashFile(t, dbPath)
	result, err := app.PreviewBackupImport()
	if err != nil {
		t.Fatalf("expected no error on a cancelled dialog, got %v", err)
	}
	if !result.Cancelled {
		t.Fatalf("expected Cancelled to be true, got %+v", result)
	}
	if hashFile(t, dbPath) != before {
		t.Fatalf("expected bridge.db unchanged on a cancelled dialog")
	}
	if app.pendingBackupImport != nil {
		t.Fatalf("expected no pending preview after a cancelled dialog")
	}
	assertNoRestorePoint(t, dbPath)
}

// TestPreviewBackupImportNeverAcceptsACallerSuppliedPath asserts the source
// path can only ever come from the native dialog: PreviewBackupImport takes
// no parameters beyond the receiver, so there is no argument a caller could
// use to smuggle in an arbitrary path.
func TestPreviewBackupImportNeverAcceptsACallerSuppliedPath(t *testing.T) {
	method, ok := reflect.TypeOf(&App{}).MethodByName("PreviewBackupImport")
	if !ok {
		t.Fatal("expected an App.PreviewBackupImport method")
	}
	if method.Type.NumIn() != 1 {
		t.Fatalf("expected PreviewBackupImport to accept no arguments beyond the receiver, got %d input(s)", method.Type.NumIn())
	}
}

func TestPreviewBackupImportWritesNothing(t *testing.T) {
	app, dbPath := appBackupImportTestApp(t)
	bundlePath := buildTestBundle(t)
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }

	before := hashFile(t, dbPath)
	if _, err := app.PreviewBackupImport(); err != nil {
		t.Fatalf("preview backup import: %v", err)
	}
	if hashFile(t, dbPath) != before {
		t.Fatalf("expected bridge.db unchanged by a preview")
	}
}

func TestPreviewBackupImportCreatesNoRestorePoint(t *testing.T) {
	app, dbPath := appBackupImportTestApp(t)
	bundlePath := buildTestBundle(t)
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }

	if _, err := app.PreviewBackupImport(); err != nil {
		t.Fatalf("preview backup import: %v", err)
	}
	assertNoRestorePoint(t, dbPath)
}

func TestConfirmWithoutMatchingPreviewIsRefused(t *testing.T) {
	t.Run("no preview at all", func(t *testing.T) {
		app, dbPath := appBackupImportTestApp(t)
		before := hashFile(t, dbPath)

		if _, err := app.ConfirmBackupImport("deadbeef"); err == nil {
			t.Fatal("expected an error confirming with no prior preview")
		}
		if hashFile(t, dbPath) != before {
			t.Fatalf("expected bridge.db unchanged")
		}
		assertNoRestorePoint(t, dbPath)
	})

	t.Run("checksum does not match the previewed bundle", func(t *testing.T) {
		app, dbPath := appBackupImportTestApp(t)
		bundlePath := buildTestBundle(t)
		app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }
		if _, err := app.PreviewBackupImport(); err != nil {
			t.Fatalf("preview backup import: %v", err)
		}

		before := hashFile(t, dbPath)
		if _, err := app.ConfirmBackupImport("not-the-previewed-checksum"); err == nil {
			t.Fatal("expected an error confirming a mismatched checksum")
		}
		if hashFile(t, dbPath) != before {
			t.Fatalf("expected bridge.db unchanged")
		}
		assertNoRestorePoint(t, dbPath)
	})
}

func TestRestorePointFailureAbortsWithZeroGroupWrites(t *testing.T) {
	app, dbPath := appBackupImportTestApp(t)
	bundlePath := buildTestBundle(t)
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }
	preview, err := app.PreviewBackupImport()
	if err != nil {
		t.Fatalf("preview backup import: %v", err)
	}

	// Force CreateRestorePoint to fail: VACUUM INTO cannot create a file
	// inside a directory that does not exist.
	app.resolveBridgeDBPath = func() (string, error) {
		return filepath.Join(t.TempDir(), "does-not-exist", "bridge.db"), nil
	}

	before := hashFile(t, dbPath)
	result, err := app.ConfirmBackupImport(preview.BundleChecksum)
	if err == nil {
		t.Fatal("expected an error when the restore point fails")
	}
	if hashFile(t, dbPath) != before {
		t.Fatalf("expected bridge.db unchanged after a restore-point failure")
	}
	if len(result.ImportedGroups) != 0 {
		t.Fatalf("expected zero group writes, got %+v", result.ImportedGroups)
	}
}

func TestRestorePointIsCreatedBeforeTheFirstGroupIsApplied(t *testing.T) {
	app, _ := appBackupImportTestApp(t)
	seedAnimeSnapshot(t, app.bridgeDB, "target-only")

	bundlePath := buildTestBundleWithAnime(t, "bundle-only")
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }
	preview, err := app.PreviewBackupImport()
	if err != nil {
		t.Fatalf("preview backup import: %v", err)
	}

	result, err := app.ConfirmBackupImport(preview.BundleChecksum)
	if err != nil {
		t.Fatalf("confirm backup import: %v", err)
	}
	if result.RestorePointPath == "" {
		t.Fatal("expected a restore point path")
	}

	restoreDB, err := bridgeSync.OpenBridgeDB(result.RestorePointPath)
	if err != nil {
		t.Fatalf("open restore point: %v", err)
	}
	defer func() { _ = restoreDB.Close() }()

	var preImportCount int
	if err := restoreDB.QueryRow(`SELECT COUNT(*) FROM anime_snapshots WHERE anime_id = ?`, "target-only").Scan(&preImportCount); err != nil {
		t.Fatalf("query restore point: %v", err)
	}
	if preImportCount != 1 {
		t.Fatalf("expected the restore point to hold the pre-import row, got count=%d", preImportCount)
	}

	var liveCount int
	if err := app.bridgeDB.QueryRow(`SELECT COUNT(*) FROM anime_snapshots WHERE anime_id = ?`, "bundle-only").Scan(&liveCount); err != nil {
		t.Fatalf("query live db: %v", err)
	}
	if liveCount != 1 {
		t.Fatalf("expected the live db to hold the bundle's row after a successful import")
	}
}

// TestConfirmBackupImportReportsRestorePointPathOnPartialFailure builds a
// bundle whose "seasons" group carries two records sharing the same primary
// key. Preview's Validate only checks that a primary key is non-empty, so
// the duplicate passes preview; Apply's plain INSERT then fails on the
// second row's PRIMARY KEY collision -- a group failure that could not have
// been caught at preview time.
//
// ConfirmBackupImport returns a nil Go error here on purpose: once the
// restore point exists, a group failure is a reportable outcome, not a
// binding-level failure. Returning a non-nil error would make Wails discard
// the resolved BackupImportResult entirely, silently dropping the restore
// point path and the committed/failed/unattempted breakdown from the
// frontend.
func TestConfirmBackupImportReportsRestorePointPathOnPartialFailure(t *testing.T) {
	app, _ := appBackupImportTestApp(t)

	bundlePath := filepath.Join(t.TempDir(), "partial-failure.zip")
	dupSeason := `{"id":"dup","name":"Test","min_approval_grade":4,"slots":12,"status":"open","ordering_draft_json":"","created_at":1}`
	writeHandBuiltBundle(t, bundlePath, map[string][]string{
		"anime_snapshots": {`{"anime_id":"anime-1","snapshot_json":"{}","snapshot_hash":"h","modified_at":1}`},
		"seasons":         {dupSeason, dupSeason},
	})
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }

	preview, err := app.PreviewBackupImport()
	if err != nil {
		t.Fatalf("expected the duplicate-primary-key bundle to preview cleanly, got %v", err)
	}

	result, err := app.ConfirmBackupImport(preview.BundleChecksum)
	if err != nil {
		t.Fatalf("expected a nil Go error so Wails resolves the structured result, got %v", err)
	}
	if result.FailedGroup != "seasons" {
		t.Fatalf("expected the seasons group to be reported as failed, got %+v", result)
	}
	if result.RestorePointPath == "" {
		t.Fatalf("expected the restore point path to be reported on a partial failure")
	}
	if result.ErrorMessage == "" {
		t.Fatalf("expected a non-empty error message on a partial failure")
	}
}

func TestPendingPreviewIsClearedAfterAnyTerminalOutcome(t *testing.T) {
	app, _ := appBackupImportTestApp(t)
	bundlePath := buildTestBundle(t)
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }
	preview, err := app.PreviewBackupImport()
	if err != nil {
		t.Fatalf("preview backup import: %v", err)
	}
	if app.pendingBackupImport == nil {
		t.Fatal("expected a pending preview after a successful preview")
	}

	if _, err := app.ConfirmBackupImport(preview.BundleChecksum); err != nil {
		t.Fatalf("confirm backup import: %v", err)
	}
	if app.pendingBackupImport != nil {
		t.Fatal("expected the pending preview to be cleared after a successful confirm")
	}

	if _, err := app.ConfirmBackupImport(preview.BundleChecksum); err == nil {
		t.Fatal("expected a second confirm with the same checksum to be refused once the pending preview is gone")
	}
}

func TestImportedBundleAppliesExactlyTheThreeKnownGroups(t *testing.T) {
	app, _ := appBackupImportTestApp(t)
	groups := app.importGroups()

	wantNames := []string{"anime_snapshots", "seasons", "season_animes"}
	if len(groups) != len(wantNames) {
		t.Fatalf("expected exactly %d import groups, got %d: %+v", len(wantNames), len(groups), groups)
	}
	for i, want := range wantNames {
		if groups[i].Name != want {
			t.Fatalf("group %d: expected name %q, got %q", i, want, groups[i].Name)
		}
	}
}

// TestNoRESTRouteOrWSEventExposesImport asserts backup import stays a
// desktop-only surface (spec: "Import Is A Desktop-Only Surface"): no field
// on the HTTP API's wiring config, which is the only place a REST route or
// WS event could be registered from, names backup or import.
func TestNoRESTRouteOrWSEventExposesImport(t *testing.T) {
	configType := reflect.TypeOf(api.Config{})
	for i := 0; i < configType.NumField(); i++ {
		name := strings.ToLower(configType.Field(i).Name)
		if strings.Contains(name, "backup") || strings.Contains(name, "import") {
			t.Fatalf("api.Config field %q exposes backup/import over the wire; import is desktop-only", configType.Field(i).Name)
		}
	}
}
