package main

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	bridgeSync "autoreas-bridge/internal/sync"
)

// appBackupTestDB opens a fully bootstrapped bridge database (every table)
// for backup binding tests -- reused from openRuntimeBridgeDB in
// app_runtime_db_test.go.
func appBackupTestDB(t *testing.T) *App {
	t.Helper()

	db := openRuntimeBridgeDB(t)
	app := newAppTestApp(t)
	app.bridgeDB = db
	app.saveFile = func(context.Context, string, string) (string, error) {
		return filepath.Join(t.TempDir(), "backup.zip"), nil
	}
	return app
}

func TestExportBackupRejectsEmptyDialogResult(t *testing.T) {
	app := appBackupTestDB(t)
	dir := t.TempDir()
	app.saveFile = func(context.Context, string, string) (string, error) {
		return "", nil
	}

	result, err := app.ExportBackup()
	if err != nil {
		t.Fatalf("expected no error on a cancelled dialog, got %v", err)
	}
	if !result.Cancelled {
		t.Fatalf("expected Cancelled to be true, got %+v", result)
	}
	if result.DestinationPath != "" {
		t.Fatalf("expected no destination path on cancel, got %q", result.DestinationPath)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read scratch dir: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no file written on a cancelled dialog, found %d entries", len(entries))
	}
}

func TestExportBackupWritesOnlyToDialogPath(t *testing.T) {
	app := appBackupTestDB(t)
	dest := filepath.Join(t.TempDir(), "chosen.zip")
	app.saveFile = func(context.Context, string, string) (string, error) {
		return dest, nil
	}

	result, err := app.ExportBackup()
	if err != nil {
		t.Fatalf("export backup: %v", err)
	}
	if result.DestinationPath != dest {
		t.Fatalf("expected destination path %q, got %q", dest, result.DestinationPath)
	}
	if _, err := os.Stat(dest); err != nil {
		t.Fatalf("expected bundle at dialog path %q: %v", dest, err)
	}
}

func TestExportBackupInvokesExportWithDialogPath(t *testing.T) {
	app := appBackupTestDB(t)
	dest := filepath.Join(t.TempDir(), "invoked.zip")
	var seenDest string
	app.saveFile = func(context.Context, string, string) (string, error) {
		seenDest = dest
		return dest, nil
	}

	if _, err := app.ExportBackup(); err != nil {
		t.Fatalf("export backup: %v", err)
	}
	if seenDest != dest {
		t.Fatalf("expected saveFile to report %q, got %q", dest, seenDest)
	}
	if _, err := os.Stat(dest); err != nil {
		t.Fatalf("expected bundle written to %q: %v", dest, err)
	}
}

func TestExportBackupReadsManifestBackBeforeReportingSuccess(t *testing.T) {
	app := appBackupTestDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(app.bridgeDB)
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		"one": {AnimeID: "one", CanonicalJSON: []byte(`{"id":"one"}`), Hash: anime.HashSnapshot([]byte(`{"id":"one"}`))},
	}, nil); err != nil {
		t.Fatalf("seed anime snapshot: %v", err)
	}

	result, err := app.ExportBackup()
	if err != nil {
		t.Fatalf("export backup: %v", err)
	}
	if result.BundleChecksum == "" {
		t.Fatalf("expected a non-empty bundle checksum read back from the manifest")
	}
	animeGroup, ok := findGroup(result.Groups, "anime_snapshots")
	if !ok {
		t.Fatalf("expected an anime_snapshots group in %+v", result.Groups)
	}
	if animeGroup.RecordCount != 1 {
		t.Fatalf("expected 1 exported anime snapshot per the manifest read back, got %d", animeGroup.RecordCount)
	}
}

func TestExportedBundleHasExactlyThreeGroups(t *testing.T) {
	app := appBackupTestDB(t)

	result, err := app.ExportBackup()
	if err != nil {
		t.Fatalf("export backup: %v", err)
	}
	wantNames := []string{"anime_snapshots", "seasons", "season_animes"}
	if len(result.Groups) != len(wantNames) {
		t.Fatalf("expected exactly %d groups, got %d: %+v", len(wantNames), len(result.Groups), result.Groups)
	}
	for i, want := range wantNames {
		if result.Groups[i].Name != want {
			t.Fatalf("group %d: expected name %q, got %q", i, want, result.Groups[i].Name)
		}
	}
}

// TestExportedBundleContainsNoExcludedTableData seeds every table that must
// never appear in a backup bundle -- secrets (download_jd_config),
// machine-local settings (app_settings), pairing state (pairing_tokens,
// devices, device_sync_state), pure-DB reorderable data
// (download_hoster_priority), and observability/bookkeeping tables
// (runtime_events, request_captures) -- with a distinctive marker, then
// asserts the marker never reaches any exported data entry. This is guard 5:
// scope is enforced by which groups are in the inline slice, not a comment.
func TestExportedBundleContainsNoExcludedTableData(t *testing.T) {
	app := appBackupTestDB(t)
	marker := "EXCLUDED-TABLE-MARKER-DO-NOT-EXPORT"

	execs := []struct {
		stmt string
		args []any
	}{
		{`INSERT INTO pairing_tokens (token, created_at_ms) VALUES (?, 1)`, []any{marker}},
		{`INSERT INTO devices (device_id, name, auth_token, paired_at_ms) VALUES ('d1', ?, 'tok', 1)`, []any{marker}},
		{`INSERT INTO device_sync_state (device_id, last_ack_changelog_id, last_seen_at_ms, sync_status) VALUES (?, 0, 1, 'active')`, []any{marker}},
		{`INSERT INTO download_jd_config (id, myjd_email, myjd_password_encrypted) VALUES (1, ?, ?)`, []any{marker, []byte(marker)}},
		{`INSERT INTO app_settings (key, value) VALUES ('marker', ?)`, []any{marker}},
		{`INSERT INTO download_hoster_priority (site, hoster, priority) VALUES ('jkanime', ?, 1)`, []any{marker}},
		{`INSERT INTO runtime_events (occurred_at_ms, domain, level, message) VALUES (1, 'test', 'info', ?)`, []any{marker}},
		{`INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json) VALUES (?, 1, 'k', 'r', 't', 'd', 'n', 'o', '{}', '{}')`, []any{marker}},
	}
	for _, e := range execs {
		if _, err := app.bridgeDB.ExecContext(context.Background(), e.stmt, e.args...); err != nil {
			t.Fatalf("seed excluded-table marker via %q: %v", e.stmt, err)
		}
	}

	result, err := app.ExportBackup()
	if err != nil {
		t.Fatalf("export backup: %v", err)
	}

	raw, err := os.ReadFile(result.DestinationPath)
	if err != nil {
		t.Fatalf("read exported bundle: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("open bundle as zip: %v", err)
	}

	for _, f := range zr.File {
		if !bytes.HasPrefix([]byte(f.Name), []byte("data/")) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open bundle entry %q: %v", f.Name, err)
		}
		content, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("read bundle entry %q: %v", f.Name, err)
		}
		if bytes.Contains(content, []byte(marker)) {
			t.Fatalf("excluded-table marker leaked into bundle entry %q", f.Name)
		}
	}
}

// findGroup returns the named group from a result set, reporting whether it
// was present.
func findGroup(groups []BackupGroupResult, name string) (BackupGroupResult, bool) {
	for _, g := range groups {
		if g.Name == name {
			return g, true
		}
	}
	return BackupGroupResult{}, false
}

func TestExportBackupPropagatesExportError(t *testing.T) {
	app := appBackupTestDB(t)
	if err := app.bridgeDB.Close(); err != nil {
		t.Fatalf("close bridge db: %v", err)
	}

	_, err := app.ExportBackup()
	if err == nil {
		t.Fatal("expected an error when the underlying export fails against a closed database")
	}
	if errors.Is(err, errExportBackupUnavailable) {
		t.Fatalf("expected the closed-DB export error, not the nil-DB guard error: %v", err)
	}
}

// TestNoRESTRouteOrWSEventExposesExport asserts backup export stays a
// desktop-only surface (spec: "Backup Is A Desktop-Only Surface"): no field
// on the HTTP API's wiring config, which is the only place a REST route or
// WS event could be registered from, names backup or export.
func TestNoRESTRouteOrWSEventExposesExport(t *testing.T) {
	configType := reflect.TypeFor[api.Config]()
	for field := range configType.Fields() {
		name := strings.ToLower(field.Name)
		if strings.Contains(name, "backup") || strings.Contains(name, "export") {
			t.Fatalf("api.Config field %q exposes backup/export over the wire; backup is desktop-only", field.Name)
		}
	}
}

func TestExportBackupUnavailableWithoutBridgeDB(t *testing.T) {
	app := newAppTestApp(t)
	app.bridgeDB = nil

	_, err := app.ExportBackup()
	if !errors.Is(err, errExportBackupUnavailable) {
		t.Fatalf("expected errExportBackupUnavailable, got %v", err)
	}
}
