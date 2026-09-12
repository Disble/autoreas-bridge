package desktop

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"autoreas-bridge/internal/backup"
	"autoreas-bridge/internal/settings"
)

// snapshotAppSettingsExcludingKeymap returns every app_settings row whose
// key is not "keyboard.keymap", keyed by key. It scans generically over
// whatever the build has written -- never naming the other keys -- so a
// newly added key is covered by construction, mirroring
// assertNoDataEntryContainsMarker's scan discipline in app_backup_test.go
// (spec's own wording: "compared without naming the keys").
func snapshotAppSettingsExcludingKeymap(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()

	rows, err := db.QueryContext(context.Background(), `SELECT key, value FROM app_settings WHERE key != 'keyboard.keymap'`)
	if err != nil {
		t.Fatalf("query app_settings: %v", err)
	}
	defer func() { _ = rows.Close() }()

	snapshot := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			t.Fatalf("scan app_settings row: %v", err)
		}
		snapshot[key] = value
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate app_settings rows: %v", err)
	}
	return snapshot
}

// TestImportingKeymapOnlyBundleLeavesOtherAppSettingsKeysUntouched closes
// "Import Writes Only Its Own Key": every app_settings key the build writes
// -- five owned by internal/settings, plus internal/desktop's own
// observability.events.persist_debug (tasks.md Note A) -- is seeded with a
// distinct value, a bundle carrying only keyboard_keymap is imported, and
// every row but keyboard.keymap must be byte-identical before and after.
// The comparison never names the other keys (spec's own wording).
func TestImportingKeymapOnlyBundleLeavesOtherAppSettingsKeysUntouched(t *testing.T) {
	app, _ := appBackupImportTestApp(t)
	ctx := context.Background()
	store := settings.NewSQLiteStore(app.bridgeDB)

	if err := store.SetDownloadsRoot(ctx, "marker-downloads-root"); err != nil {
		t.Fatalf("seed downloads root: %v", err)
	}
	if err := store.SetAutoStartEnabled(ctx, true); err != nil {
		t.Fatalf("seed auto start: %v", err)
	}
	if err := store.SetEpisodeRenameEnabled(ctx, true); err != nil {
		t.Fatalf("seed episode rename: %v", err)
	}
	if err := store.SetAPIAddr(ctx, "marker-addr"); err != nil {
		t.Fatalf("seed api addr: %v", err)
	}
	if err := store.SetKeymap(ctx, "pre-import-keymap"); err != nil {
		t.Fatalf("seed keymap: %v", err)
	}
	if _, err := app.bridgeDB.ExecContext(ctx, `INSERT INTO app_settings (key, value) VALUES (?, 'true')`, eventPersistDebugSettingKey); err != nil {
		t.Fatalf("seed persist-debug setting: %v", err)
	}

	before := snapshotAppSettingsExcludingKeymap(t, app.bridgeDB)
	if len(before) == 0 {
		t.Fatal("expected the scan to have captured at least one non-keymap app_settings row")
	}

	bundlePath := filepath.Join(t.TempDir(), "keymap-only.zip")
	writeHandBuiltBundle(t, bundlePath, map[string][]string{
		"keyboard_keymap": {`{"document":"post-import-keymap"}`},
	})
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }

	preview, err := app.PreviewBackupImport()
	if err != nil {
		t.Fatalf("preview backup import: %v", err)
	}
	if _, err := app.ConfirmBackupImport(preview.BundleChecksum); err != nil {
		t.Fatalf("confirm backup import: %v", err)
	}

	after := snapshotAppSettingsExcludingKeymap(t, app.bridgeDB)
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("expected every non-keymap app_settings row unchanged, before=%+v after=%+v", before, after)
	}

	gotKeymap, err := store.Keymap(ctx)
	if err != nil {
		t.Fatalf("read back keymap: %v", err)
	}
	if gotKeymap != "post-import-keymap" {
		t.Fatalf("expected the keymap-only group to actually import, got %q", gotKeymap)
	}
}

// keymapGroupImportCase is one row of TestImportedKeymapGroupOutcomesByPresence.
type keymapGroupImportCase struct {
	name             string
	seedKeymap       string
	bundleGroups     map[string][]string
	wantAbsentGroup  bool
	wantStoredKeymap string
}

// TestImportedKeymapGroupOutcomesByPresence closes "A Present-But-Empty
// Group Resets The Keymap To Defaults" and "An Absent Group Leaves The
// Keymap Untouched": its two rows share one preview/confirm shape -- build
// app, optionally seed a keymap, write a hand-built bundle, preview,
// confirm, read back, compare.
func TestImportedKeymapGroupOutcomesByPresence(t *testing.T) {
	tests := []keymapGroupImportCase{
		{
			name:             "present but empty group resets the keymap to defaults",
			bundleGroups:     map[string][]string{"keyboard_keymap": {}},
			wantStoredKeymap: "",
		},
		{
			name:       "absent group leaves the stored keymap unchanged",
			seedKeymap: `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`,
			bundleGroups: map[string][]string{
				"anime_snapshots": {`{"anime_id":"a","snapshot_json":"{}","snapshot_hash":"h","modified_at":1}`},
			},
			wantAbsentGroup:  true,
			wantStoredKeymap: `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertKeymapGroupImportOutcome(t, tt)
		})
	}
}

// assertKeymapGroupImportOutcome seeds an optional pre-import keymap,
// imports a hand-built bundle carrying tt.bundleGroups, and checks the
// preview's AbsentGroups membership and the confirm's ErrorMessage only
// when tt.wantAbsentGroup is set (the absent-group case), then always
// checks the keymap read back afterward against tt.
func assertKeymapGroupImportOutcome(t *testing.T, tt keymapGroupImportCase) {
	t.Helper()

	app, _ := appBackupImportTestApp(t)
	ctx := context.Background()
	store := settings.NewSQLiteStore(app.bridgeDB)
	if tt.seedKeymap != "" {
		if err := store.SetKeymap(ctx, tt.seedKeymap); err != nil {
			t.Fatalf("seed keymap: %v", err)
		}
	}

	bundlePath := filepath.Join(t.TempDir(), "keymap-group.zip")
	writeHandBuiltBundle(t, bundlePath, tt.bundleGroups)
	app.pickBundle = func(context.Context, string) (string, error) { return bundlePath, nil }

	preview, err := app.PreviewBackupImport()
	if err != nil {
		t.Fatalf("preview backup import: %v", err)
	}
	if tt.wantAbsentGroup && !slices.Contains(preview.AbsentGroups, "keyboard_keymap") {
		t.Fatalf("expected keyboard_keymap in AbsentGroups, got %+v", preview.AbsentGroups)
	}

	result, err := app.ConfirmBackupImport(preview.BundleChecksum)
	if err != nil {
		t.Fatalf("confirm backup import: %v", err)
	}
	if tt.wantAbsentGroup && result.ErrorMessage != "" {
		t.Fatalf("expected no error/warning reported for an absent keymap group, got %q", result.ErrorMessage)
	}

	got, err := store.Keymap(ctx)
	if err != nil {
		t.Fatalf("read back keymap: %v", err)
	}
	if got != tt.wantStoredKeymap {
		t.Fatalf("keymap = %q, want %q", got, tt.wantStoredKeymap)
	}
}

// TestPreviewOfKeymapCarryingBundleOnAnOlderImportGroupsSliceReportsItAsUnknown
// closes "An Unknown Group Is Ignored With A Warning": simulating a build
// older than this capability -- app.importGroups()[:3], with no
// keyboard_keymap entry -- previewing a bundle that carries the group lists
// it among UnknownGroups, and leaves FormatVersion untouched.
func TestPreviewOfKeymapCarryingBundleOnAnOlderImportGroupsSliceReportsItAsUnknown(t *testing.T) {
	app, _ := appBackupImportTestApp(t)
	olderBuildGroups := app.importGroups()[:3]

	bundlePath := filepath.Join(t.TempDir(), "keymap-carrying.zip")
	writeHandBuiltBundle(t, bundlePath, map[string][]string{
		"keyboard_keymap": {`{"document":"{\"version\":1,\"overrides\":{}}"}`},
	})

	report, err := backup.Preview(context.Background(), bundlePath, olderBuildGroups)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}

	if !slices.Contains(report.UnknownGroups, "keyboard_keymap") {
		t.Fatalf("expected keyboard_keymap in UnknownGroups, got %+v", report.UnknownGroups)
	}
	if report.FormatVersion != backup.SupportedFormatVersion {
		t.Fatalf("expected FormatVersion unchanged by the unknown group, got %d", report.FormatVersion)
	}
}
